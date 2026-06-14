// THE flight model — fixed-timestep physics, decoupled from render.
//
// World scale: 1 unit = 1 meter, gravity is real. Body frame: X=right, Y=up,
// -Z=forward; pitch about X, roll about Z, yaw about Y; thrust along body up.
//
// Each rendered frame we accumulate elapsed time and step the physics in fixed
// 1/120 s substeps (draining the accumulator, capped to avoid spiral-of-death).
// Physics never runs on the raw variable frame delta — that's what keeps the
// feel identical at 30, 60 or 144 fps.
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RefObject } from "react";
import { DT, MAX_SUBSTEPS, MAX_FRAME_DELTA, G, TELEMETRY_HZ } from "../constants";
import { expDamp, integrateQuat, clamp, RAD2DEG } from "../lib/mathUtils";
import { drone, useDroneStore } from "./droneState";
import type { Telemetry } from "./droneState";
import { commandedRates } from "./flightModes";
import type { ControlAxes } from "./flightModes";
import { useTuning } from "../tuning/tuningStore";
import { advanceInput, input } from "../input/useInput";
import { sampleGroundUnderDrone, clampToGround } from "./groundCollision";

// scratch — the loop is single-threaded and non-reentrant, so module-level
// temporaries are safe and keep the hot path allocation-free.
const UP = new THREE.Vector3(0, 1, 0);
const _cmd = new THREE.Vector3();
const _thrust = new THREE.Vector3();
const _force = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _axes: ControlAxes = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

let accumulator = 0;
let telAccum = 0;

function step(dt: number): void {
  const p = useTuning.getState();
  const mode = useDroneStore.getState().mode;

  // 1–3. read axes, apply Shift precision scaling (throttle is never scaled)
  const ps = input.precision ? p.precisionScale : 1;
  _axes.throttle = input.axes.throttle;
  _axes.yaw = input.axes.yaw * ps;
  _axes.pitch = input.axes.pitch * ps;
  _axes.roll = input.axes.roll * ps;

  // 4. commanded body rates for the active mode
  commandedRates(_cmd, _axes, mode, p, drone.orientation);

  // 5. rotational inertia: ease actual rates toward commanded (the "weight" knob)
  const kRot = 1 - Math.exp(-dt / Math.max(p.tauRot, 1e-4));
  drone.bodyRates.x += (_cmd.x - drone.bodyRates.x) * kRot;
  drone.bodyRates.y += (_cmd.y - drone.bodyRates.y) * kRot;
  drone.bodyRates.z += (_cmd.z - drone.bodyRates.z) * kRot;

  // 6. integrate orientation in the body frame
  integrateQuat(drone.orientation, drone.bodyRates, dt);

  // 7. thrust along body up, with motor-response lag
  const maxThrust = p.twr * p.mass * G;
  const thrustTarget = _axes.throttle * maxThrust;
  drone.thrustMag = expDamp(drone.thrustMag, thrustTarget, p.tauThrottle, dt);
  _thrust.copy(UP).applyQuaternion(drone.orientation).multiplyScalar(drone.thrustMag);

  // 8. forces: thrust + gravity + quadratic-dominant drag
  const speed = drone.velocity.length();
  const dragK = p.cQuad * speed + p.cLinear;
  _force.copy(_thrust);
  _force.y -= G * p.mass;
  _force.addScaledVector(drone.velocity, -dragK);

  // 9. integrate velocity & position. Free flight everywhere EXCEPT straight down:
  // collision is downward-only (see groundCollision.ts), so the drone still phases
  // through building sides and only rests when it descends onto the surface below.
  drone.velocity.addScaledVector(_force, dt / p.mass);
  drone.position.addScaledVector(drone.velocity, dt);

  // 10. ground collision — clamp onto the surface sampled once this frame (cheap; the
  // raycast itself ran in useFrame, not here). Skipped entirely when no ground is known.
  clampToGround();

  drone.flightTime += dt;
}

function publishTelemetry(): void {
  _fwd.set(0, 0, -1).applyQuaternion(drone.orientation);
  _right.set(1, 0, 0).applyQuaternion(drone.orientation);
  const v = drone.velocity;
  // LA frame: +Z = geographic north, -X = east (see anchor.ts) → true-north compass.
  let heading = Math.atan2(-_fwd.x, _fwd.z) * RAD2DEG; // 0=N(+Z), 90=E(-X)
  if (heading < 0) heading += 360;

  const tel: Telemetry = {
    altitude: drone.position.y,
    groundSpeed: Math.hypot(v.x, v.z),
    verticalSpeed: v.y,
    speed: v.length(),
    heading,
    pitchDeg: Math.asin(clamp(_fwd.y, -1, 1)) * RAD2DEG,
    rollDeg: Math.asin(clamp(-_right.y, -1, 1)) * RAD2DEG,
    throttlePct: input.axes.throttle * 100,
    timer: drone.flightTime,
    stickThrottle: input.axes.throttle,
    stickYaw: input.axes.yaw,
    stickPitch: input.axes.pitch,
    stickRoll: input.axes.roll,
    locked: input.locked,
  };
  useDroneStore.getState().setTelemetry(tel);
}

// Runs the loop and writes the result onto the drone rig each frame. The FPV
// camera is a child of that rig, so it follows automatically.
export function FlightModel({ droneRef }: { droneRef: RefObject<THREE.Group | null> }): null {
  useFrame((_state, delta) => {
    // Pause / free-look: freeze physics in place. Bail BEFORE accumulating delta so
    // there's no backlog on resume, and drone.velocity stays untouched → momentum
    // resumes verbatim. FreeCamController takes over the camera while paused.
    if (useDroneStore.getState().paused) return;

    advanceInput(delta); // ramp virtual axes once per frame (consumes mouse delta)
    sampleGroundUnderDrone(); // one downward raycast/frame; cached for every substep clamp

    accumulator += Math.min(delta, MAX_FRAME_DELTA);
    let n = 0;
    while (accumulator >= DT && n < MAX_SUBSTEPS) {
      step(DT);
      accumulator -= DT;
      n++;
    }
    if (n === MAX_SUBSTEPS) accumulator = 0; // drop backlog under heavy load

    const g = droneRef.current;
    if (g) {
      g.position.copy(drone.position);
      g.quaternion.copy(drone.orientation);
      // Refresh the FPV camera's world matrix now (camera is a child of the rig) so
      // the tiles renderer's same-frame update() culls against the current view, not
      // a stale one. (false, true) = skip parents, walk down to the camera.
      g.updateWorldMatrix(false, true);
    }

    telAccum += delta;
    if (telAccum >= 1 / TELEMETRY_HZ) {
      telAccum = 0;
      publishTelemetry();
    }
  });
  return null;
}
