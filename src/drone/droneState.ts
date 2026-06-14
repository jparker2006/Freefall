// Drone state, split for performance:
//   • `drone` — a plain mutable singleton holding the hot physics state. It is
//     mutated in place at 120Hz and NEVER triggers React. The drone <group> and
//     FPV camera read it directly inside useFrame.
//   • `useDroneStore` — a zustand store for low-frequency display/UI state (mode,
//     HUD/panel visibility) plus a throttled telemetry snapshot (~30Hz) that the
//     HTML OSD subscribes to, so the HUD re-renders at a readable rate.
import * as THREE from "three";
import { create } from "zustand";
import { SPAWN_POSITION, SPAWN_YAW_DEG, DEFAULTS, G } from "../constants";
import { DEG2RAD } from "../lib/mathUtils";

// Hover thrust at the default mass — used to pre-charge thrustMag so the drone
// holds altitude from frame 0 instead of sinking during the motor-spool ramp.
const HOVER_THRUST = DEFAULTS.mass * G;

// Spawn orientation: a fixed yaw about +Y so the pilot opens facing the skyline.
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SPAWN_QUAT = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, SPAWN_YAW_DEG * DEG2RAD);

export type FlightMode = "acro" | "angle";

export type Telemetry = {
  altitude: number; // m
  groundSpeed: number; // m/s (horizontal)
  verticalSpeed: number; // m/s
  speed: number; // m/s (total)
  heading: number; // deg, 0..360 compass
  pitchDeg: number; // + = nose up
  rollDeg: number; // + = rolled right
  throttlePct: number; // 0..100
  timer: number; // s since spawn/reset
  // virtual gimbal positions for the stick indicators
  stickThrottle: number; // 0..1
  stickYaw: number; // -1..1
  stickPitch: number; // -1..1
  stickRoll: number; // -1..1
  locked: boolean; // pointer lock engaged (mouse flying active)
};

// --- Hot physics state (mutated in place; not React) -------------------------
export const drone = {
  position: new THREE.Vector3(SPAWN_POSITION[0], SPAWN_POSITION[1], SPAWN_POSITION[2]),
  velocity: new THREE.Vector3(),
  bodyRates: new THREE.Vector3(), // rad/s, body frame (x=pitch, y=yaw, z=roll)
  orientation: SPAWN_QUAT.clone(), // spawn facing the skyline (SPAWN_YAW_DEG)
  thrustMag: HOVER_THRUST, // N (low-passed); starts at hover so it holds on load
  flightTime: 0, // s since last reset
};

// Active spawn — updated by teleport (M3) so R returns to the CURRENT location,
// not always Westwood. Starts at the M2 airborne Westwood spawn.
let activeSpawnAlt = SPAWN_POSITION[1];
let activeSpawnYaw = SPAWN_YAW_DEG;
const _spawnQuat = new THREE.Quaternion();

// Reset to an airborne hover at `altitude` over the local origin, facing `yawDeg`
// about +Y, holding hover. Becomes the new "home" for R. Teleport (locations.ts)
// re-anchors the world first, then calls this so the drone lands over the new spot.
export function spawnAt(altitude: number, yawDeg: number): void {
  activeSpawnAlt = altitude;
  activeSpawnYaw = yawDeg;
  drone.position.set(0, altitude, 0);
  drone.velocity.set(0, 0, 0);
  drone.bodyRates.set(0, 0, 0);
  drone.orientation.copy(_spawnQuat.setFromAxisAngle(Y_AXIS, yawDeg * DEG2RAD));
  drone.thrustMag = HOVER_THRUST;
  drone.flightTime = 0;
}

export function resetFlight(): void {
  spawnAt(activeSpawnAlt, activeSpawnYaw);
}

const ZERO_TELEMETRY: Telemetry = {
  altitude: SPAWN_POSITION[1],
  groundSpeed: 0,
  verticalSpeed: 0,
  speed: 0,
  heading: 0,
  pitchDeg: 0,
  rollDeg: 0,
  throttlePct: 0,
  timer: 0,
  stickThrottle: 0,
  stickYaw: 0,
  stickPitch: 0,
  stickRoll: 0,
  locked: false,
};

// --- Display / UI store ------------------------------------------------------
type DroneStore = {
  mode: FlightMode;
  hudVisible: boolean;
  tuningVisible: boolean;
  paused: boolean; // pause / free-look: physics frozen, free camera active
  showDroneBody: boolean; // debug: render the (normally invisible) quad body
  telemetry: Telemetry;
  toggleMode: () => void;
  setMode: (m: FlightMode) => void;
  toggleHud: () => void;
  toggleTuning: () => void;
  togglePaused: () => void;
  setShowDroneBody: (v: boolean) => void;
  setTelemetry: (t: Telemetry) => void;
};

export const useDroneStore = create<DroneStore>((set) => ({
  mode: "acro",
  hudVisible: true,
  // M3: the tuning panel starts hidden so the minimap (bottom-right) and the flight
  // view are unobstructed — it's a tuning tool now, one ` keystroke away.
  tuningVisible: false,
  paused: false,
  showDroneBody: false,
  telemetry: ZERO_TELEMETRY,
  toggleMode: () => set((s) => ({ mode: s.mode === "acro" ? "angle" : "acro" })),
  setMode: (m) => set({ mode: m }),
  toggleHud: () => set((s) => ({ hudVisible: !s.hudVisible })),
  toggleTuning: () => set((s) => ({ tuningVisible: !s.tuningVisible })),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setShowDroneBody: (v) => set({ showDroneBody: v }),
  setTelemetry: (t) => set({ telemetry: t }),
}));
