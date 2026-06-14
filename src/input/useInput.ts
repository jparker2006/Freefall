// Input layer: raw keyboard/mouse → four ramped virtual axes.
//
// The whole trick of keyboard FPV is making digital keys feel analog:
//   • throttle (W/S) is a *persistent setpoint* — nudged while held, holds on release.
//   • yaw (A/D) and the arrow-key pitch/roll fallback ease toward ±1 / back to 0
//     over inputRampTime, so releasing a rate key decays to 0 → the drone holds
//     attitude in acro.
//   • mouse is already analog: this frame's accumulated movement maps straight to
//     pitch/roll deflection and is consumed each frame, so stopping the mouse
//     re-centers the stick and holds attitude.
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { clamp, slew } from "../lib/mathUtils";
import { THROTTLE_RATE, DEFAULTS, G } from "../constants";
import { useTuning } from "../tuning/tuningStore";
import { useDroneStore, resetFlight, drone } from "../drone/droneState";
import { levaBridge } from "../tuning/levaBridge";
import { CONTROLS } from "./controlConfig";
import { useGeoStore } from "../world/useGeoStore";
import { teleportTo, cycleTarget } from "../world/locations";
import type { ControlAxes } from "../drone/flightModes";

// --- module-level singletons (mutated by listeners; read by the flight loop) ---
const keys: Record<string, boolean> = {};
let mouseDX = 0;
let mouseDY = 0;
let locked = false;

export const input: { axes: ControlAxes; precision: boolean; locked: boolean } = {
  // start at hover throttle so the drone holds altitude on load
  axes: { throttle: 1 / DEFAULTS.twr, yaw: 0, pitch: 0, roll: 0 },
  precision: false,
  locked: false,
};

// Raw accessors for the pause/free-look camera. During pause the flight loop skips
// advanceInput, so FreeCamController is the ONLY consumer of the pointer delta —
// no double-drain. (Mouse delta is also zeroed on the Space toggle edge.)
export const isDown = (code: string): boolean => !!keys[code];
export function consumeLook(): { dx: number; dy: number } {
  const d = { dx: mouseDX, dy: mouseDY };
  mouseDX = 0;
  mouseDY = 0;
  return d;
}

// --- touch source (mobile virtual sticks) -----------------------------------------
// Inert until <VirtualSticks> calls setTouchAxes. `touchActive` gates every touch branch
// in advanceInput, so on desktop (where nothing ever calls setTouchAxes) the seam runs the
// original arithmetic with `+ 0` — byte-for-byte unchanged. Throttle is the sticky setpoint
// while a left-stick finger is down; on release we stop writing it, so it holds in place
// exactly like the keyboard's persistent throttle. Yaw/pitch/roll are additive and the stick
// reports 0 on release → self-levels in Angle mode, mirroring the mouse path.
const ZERO_TOUCH = Object.freeze({ yaw: 0, pitch: 0, roll: 0 });
let touchActive = false;
let touchThrottleHeld = false;
const touchAxes = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

export function setTouchAxes(a: {
  throttle?: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
}): void {
  touchActive = true;
  if (a.throttle !== undefined) touchAxes.throttle = a.throttle;
  if (a.yaw !== undefined) touchAxes.yaw = a.yaw;
  if (a.pitch !== undefined) touchAxes.pitch = a.pitch;
  if (a.roll !== undefined) touchAxes.roll = a.roll;
}
export function setTouchThrottleHeld(held: boolean): void {
  touchThrottleHeld = held;
}
export function clearTouchAxes(): void {
  touchActive = false;
  touchThrottleHeld = false;
  touchAxes.yaw = touchAxes.pitch = touchAxes.roll = 0;
}
/** Live throttle setpoint — the left nub seeds from this so the stick never jumps on touch. */
export function getThrottle(): number {
  return input.axes.throttle;
}

// Respawn: reset the drone, settle the throttle setpoint to hover, and pre-charge thrust so
// it holds altitude (no post-reset sink). Shared by the R key and the touch respawn button.
export function respawn(): void {
  resetFlight();
  const tu = useTuning.getState();
  input.axes.throttle = clamp(1 / tu.twr, 0, 1);
  drone.thrustMag = tu.mass * G;
}

// Touch free-look during pause: 1-finger look feeds the SAME mouseDX/DY that consumeLook()
// drains (so FreeCamController's look code is unchanged); 2-finger drag feeds a separate
// dolly accumulator the FreeCamController consumes.
export function pushTouchLook(dx: number, dy: number): void {
  mouseDX += dx;
  mouseDY += dy;
}
const touchPan = { dz: 0, dx: 0 };
export function pushTouchPan(dz: number, dx: number): void {
  touchPan.dz += dz;
  touchPan.dx += dx;
}
export function consumeTouchPan(): { dz: number; dx: number } {
  const v = { dz: touchPan.dz, dx: touchPan.dx };
  touchPan.dz = 0;
  touchPan.dx = 0;
  return v;
}

// internal ramped sub-axes for the binary keys
let yawAxis = 0;
let pitchKeyAxis = 0;
let rollKeyAxis = 0;

const isPressed = (codes: string | readonly string[]): boolean =>
  typeof codes === "string" ? !!keys[codes] : codes.some((c) => !!keys[c]);

// Advance the ramped axes by `dt` and consume this frame's mouse delta.
// Called once per frame by the flight loop; the fixed substeps read the result.
export function advanceInput(dt: number): typeof input {
  const p = useTuning.getState();

  // throttle: persistent 0..1 setpoint
  const tDir =
    (isPressed(CONTROLS.throttleUp) ? 1 : 0) - (isPressed(CONTROLS.throttleDown) ? 1 : 0);
  input.axes.throttle = clamp(input.axes.throttle + tDir * THROTTLE_RATE * dt, 0, 1);
  // touch: the left stick owns the throttle setpoint while held; on release we stop
  // writing → it holds (sticky), matching the keyboard's persistent throttle above.
  if (touchActive && touchThrottleHeld) {
    input.axes.throttle = clamp(touchAxes.throttle, 0, 1);
  }

  // ramped key axes (full deflection in inputRampTime, decay to 0 on release)
  const step = dt / Math.max(p.inputRampTime, 1e-3);
  const yawTarget = (isPressed(CONTROLS.yawRight) ? 1 : 0) - (isPressed(CONTROLS.yawLeft) ? 1 : 0);
  const pitchTarget =
    (isPressed(CONTROLS.pitchUp) ? 1 : 0) - (isPressed(CONTROLS.pitchDown) ? 1 : 0);
  const rollTarget =
    (isPressed(CONTROLS.rollRight) ? 1 : 0) - (isPressed(CONTROLS.rollLeft) ? 1 : 0);
  yawAxis = slew(yawAxis, yawTarget, step);
  pitchKeyAxis = slew(pitchKeyAxis, pitchTarget, step);
  rollKeyAxis = slew(rollKeyAxis, rollTarget, step);

  // mouse (consumed this frame). Non-inverted: mouse up (movementY<0) = nose up.
  const mPitch = (p.invertPitch ? mouseDY : -mouseDY) * p.mouseSensitivity;
  const mRoll = mouseDX * p.mouseSensitivity;
  mouseDX = 0;
  mouseDY = 0;

  // touch axes add on top of keyboard+mouse, then clamp (ZERO_TOUCH on desktop = no-op).
  const tx = touchActive ? touchAxes : ZERO_TOUCH;
  input.axes.yaw = clamp(yawAxis + tx.yaw, -1, 1);
  input.axes.pitch = clamp(pitchKeyAxis + mPitch + tx.pitch, -1, 1);
  input.axes.roll = clamp(rollKeyAxis + mRoll + tx.roll, -1, 1);
  input.precision = isPressed(CONTROLS.precision);
  input.locked = locked;
  return input;
}

// Wires DOM listeners + pointer lock. Rendered (returning null) inside <Canvas>
// so it can reach the WebGL canvas element via useThree.
export function InputBridge(): null {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const canvas = gl.domElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.repeat) {
        if (CONTROLS.modeToggle.includes(e.code as never)) {
          if (e.code === "Tab") e.preventDefault(); // keep focus on the canvas
          useDroneStore.getState().toggleMode();
        } else if (e.code === CONTROLS.reset) {
          respawn();
        } else if (e.code === CONTROLS.hud) {
          useDroneStore.getState().toggleHud();
        } else if (e.code === CONTROLS.tuning) {
          useDroneStore.getState().toggleTuning();
        } else if (e.code === CONTROLS.units) {
          // route through leva so the panel toggle and the store stay in sync
          const next = !useTuning.getState().metric;
          if (levaBridge.set) levaBridge.set({ metric: next });
          else useTuning.getState().toggleMetric();
        } else if (e.code === CONTROLS.mapExpand) {
          // M: expand ⇄ collapse the minimap. Expanding releases pointer lock so
          // the pins are clickable; collapsing via M is a fresh user gesture, so we
          // can re-lock for flight immediately.
          const geo = useGeoStore.getState();
          const next = !geo.expanded;
          geo.setExpanded(next);
          if (next) {
            if (document.pointerLockElement) document.exitPointerLock();
          } else {
            try {
              const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
              r?.catch?.(() => {});
            } catch {
              /* ignore */
            }
          }
        } else if (e.code === CONTROLS.cycleTarget) {
          cycleTarget();
        } else if ((CONTROLS.goto as readonly string[]).includes(e.code)) {
          teleportTo((CONTROLS.goto as readonly string[]).indexOf(e.code)); // 1–9 → roster
        } else if (e.code === CONTROLS.pause) {
          // Space: toggle pause / free-look. Suspends flight (FlightModel early-returns)
          // and hands the camera to FreeCamController. preventDefault stops the page
          // scrolling / activating a focused control.
          e.preventDefault();
          const willPause = !useDroneStore.getState().paused;
          useDroneStore.getState().togglePaused();
          mouseDX = 0; // clean the pause↔resume edge so neither mode inherits a jolt
          mouseDY = 0;
          if (willPause) {
            // free-look needs the cursor locked, not the expanded map eating events
            if (useGeoStore.getState().expanded) useGeoStore.getState().setExpanded(false);
            if (!document.pointerLockElement) {
              try {
                const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
                r?.catch?.(() => {}); // Space IS a user gesture, so this is allowed
              } catch {
                /* ignore */
              }
            }
          }
        } else if (e.code === CONTROLS.clearWaypoint) {
          useGeoStore.getState().clearWaypoint();
        } else if (e.code === CONTROLS.releaseLock) {
          // Esc: collapse the map if open (left unlocked — click to re-engage),
          // otherwise just release pointer lock.
          if (useGeoStore.getState().expanded) useGeoStore.getState().setExpanded(false);
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }
      keys[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    const onClick = () => {
      if (document.pointerLockElement) return;
      try {
        const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        r?.catch?.(() => {}); // ignore "locked too soon after exit" rejections
      } catch {
        /* ignore */
      }
    };
    const onPointerLockChange = () => {
      locked = document.pointerLockElement === canvas;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!locked) return;
      mouseDX += e.movementX;
      mouseDY += e.movementY;
    };
    const onBlur = () => {
      for (const k in keys) keys[k] = false; // drop held keys to avoid stuck inputs
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("blur", onBlur);
    };
  }, [gl]);

  return null;
}
