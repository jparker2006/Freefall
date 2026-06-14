// Setpoint logic for the two flight modes. Returns the *commanded* body rates
// (rad/s) for a substep; the flight loop then eases the actual rates toward this
// with the tauRot lag and integrates orientation.
//
// Body frame: X = right, Y = up, -Z = forward.
// Sign conventions (so input feels natural):
//   pitchIn > 0 = nose up    →  +X rate  (right-hand +X tips -Z toward +Y)
//   yawIn   > 0 = yaw right   →  -Y rate  (right-hand +Y is yaw left)
//   rollIn  > 0 = roll right  →  -Z rate  (right-hand +Z is roll left)
import * as THREE from "three";
import { clamp, expo, DEG2RAD } from "../lib/mathUtils";
import { ANGLE_KP, ANGLE_MAX_TILT_DEG } from "../constants";
import type { TuningParams } from "../constants";
import type { FlightMode } from "./droneState";

export type ControlAxes = {
  throttle: number; // 0..1
  yaw: number; // -1..1
  pitch: number; // -1..1
  roll: number; // -1..1
};

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

// Fills and returns `out` = (pitchRate, yawRate, rollRate) in body frame, rad/s.
export function commandedRates(
  out: THREE.Vector3,
  axes: ControlAxes,
  mode: FlightMode,
  p: TuningParams,
  orientation: THREE.Quaternion,
): THREE.Vector3 {
  const e = p.rateExpo;
  const maxRP = p.maxRateRollPitch * DEG2RAD;
  const maxYaw = p.maxRateYaw * DEG2RAD;
  const yawRate = -expo(axes.yaw, e) * maxYaw; // yaw is rate-based in both modes

  if (mode === "acro") {
    out.set(expo(axes.pitch, e) * maxRP, yawRate, -expo(axes.roll, e) * maxRP);
    return out;
  }

  // Angle mode: a pure-P outer loop drives attitude toward stick-scaled targets,
  // so releasing the sticks self-levels. (tauRot supplies the damping.)
  const maxTilt = ANGLE_MAX_TILT_DEG * DEG2RAD;
  _fwd.set(0, 0, -1).applyQuaternion(orientation);
  _right.set(1, 0, 0).applyQuaternion(orientation);
  const pitchAngle = Math.asin(clamp(_fwd.y, -1, 1)); // + = nose up
  const bankRight = Math.asin(clamp(-_right.y, -1, 1)); // + = rolled right
  const targetPitch = expo(axes.pitch, e) * maxTilt;
  const targetBank = expo(axes.roll, e) * maxTilt;
  const pitchRate = clamp(ANGLE_KP * (targetPitch - pitchAngle), -maxRP, maxRP);
  const rollRightRate = clamp(ANGLE_KP * (targetBank - bankRight), -maxRP, maxRP);
  out.set(pitchRate, yawRate, -rollRightRate);
  return out;
}
