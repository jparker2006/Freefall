// Small, allocation-free math helpers for the flight loop.
import * as THREE from "three";

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

// Cubic expo: softer near center, full authority at the edges. expo(±1)=±1.
export const expo = (x: number, e: number): number => (1 - e) * x + e * x * x * x;

// First-order lag blend factor for a fixed step. tau<=0 → snap.
export const dampFactor = (tau: number, dt: number): number =>
  tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);

// Ease `cur` toward `tgt` with time constant `tau` over step `dt`.
export const expDamp = (cur: number, tgt: number, tau: number, dt: number): number =>
  cur + (tgt - cur) * dampFactor(tau, dt);

// Linear slew toward `tgt`, moving at most `maxStep`. Used for ramped key axes
// (reaches full deflection in exactly inputRampTime).
export const slew = (cur: number, tgt: number, maxStep: number): number => {
  const d = tgt - cur;
  if (d > maxStep) return cur + maxStep;
  if (d < -maxStep) return cur - maxStep;
  return tgt;
};

// Integrate body angular rates (rad/s, body frame) into a quaternion, in place.
// Builds a delta quaternion (axis = normalized rates, angle = |rates|*dt) and
// right-multiplies so rotation is applied in the body frame, then renormalizes.
const _axis = new THREE.Vector3();
const _dq = new THREE.Quaternion();
export function integrateQuat(q: THREE.Quaternion, rates: THREE.Vector3, dt: number): void {
  const len = rates.length();
  const angle = len * dt;
  if (angle < 1e-9) return;
  _axis.copy(rates).multiplyScalar(1 / len); // normalize without re-measuring length
  _dq.setFromAxisAngle(_axis, angle);
  q.multiply(_dq).normalize();
}
