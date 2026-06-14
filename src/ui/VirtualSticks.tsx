// Dual virtual sticks (FPV "Mode 2") for touch. Left = vertical throttle (ratchet-from-
// hover: spring-to-center, deflection sets the rate of change, holds where you lift) +
// horizontal yaw (self-centers). Right = pitch + roll (both self-center). They feed the
// SAME normalized channels the keyboard/mouse drive, via setTouchAxes() — the flight model
// is untouched. Desktop never mounts this (App gates on IS_TOUCH), so the desktop input
// path is byte-for-byte unchanged.
//
// Implementation notes:
//  • Pointer Events + setPointerCapture per zone → two thumbs track independently even when
//    a thumb slides outside its corner. One active pointerId per zone.
//  • Floating origin: the base ring spawns where the thumb lands; deflection is measured
//    from there, clamped to a radius.
//  • A single rAF pump applies light smoothing and writes the axes at a steady cadence
//    (so the throttle ratchet integrates consistently), and stops once everything settles.
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { useDroneStore } from "../drone/droneState";
import { IS_TOUCH, useOrientation } from "./device";
import {
  setTouchAxes,
  setTouchThrottleHeld,
  clearTouchAxes,
  getThrottle,
} from "../input/useInput";
import "./touch.css";

const SMOOTH_TAU = 0.05; // s — light low-pass on yaw/pitch/roll + the throttle rate input
const THROTTLE_RATE = 0.9; // throttle units/sec at full vertical deflection (ratchet speed)

type Zone = {
  pointerId: number;
  ox: number; // origin clientX
  oy: number; // origin clientY
  rx: number; // clamped offset from origin, px (right+)
  ry: number; // clamped offset from origin, px (down+)
  active: boolean;
};
const newZone = (): Zone => ({ pointerId: -1, ox: 0, oy: 0, rx: 0, ry: 0, active: false });

export function VirtualSticks(): ReactElement | null {
  const paused = useDroneStore((s) => s.paused);
  const orientation = useOrientation();
  const enabled = !paused && orientation === "landscape";

  const leftZoneRef = useRef<HTMLDivElement>(null);
  const rightZoneRef = useRef<HTMLDivElement>(null);
  const leftBaseRef = useRef<HTMLDivElement>(null);
  const rightBaseRef = useRef<HTMLDivElement>(null);
  const leftNubRef = useRef<HTMLDivElement>(null);
  const rightNubRef = useRef<HTMLDivElement>(null);
  const thrFillRef = useRef<HTMLDivElement>(null);

  const left = useRef<Zone>(newZone());
  const right = useRef<Zone>(newZone());
  const radius = useRef(72);
  const smooth = useRef({ yaw: 0, pitch: 0, roll: 0, thr: 0 });
  const throttle = useRef(0);
  const raf = useRef(0);
  const lastT = useRef(0);
  const enabledRef = useRef(enabled);

  // Cross-effect handles (set by the main effect, called by the enabled effect).
  const placeRestRef = useRef<() => void>(() => {});
  const resetAllRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!IS_TOUCH) return;
    const leftZone = leftZoneRef.current;
    const rightZone = rightZoneRef.current;
    if (!leftZone || !rightZone) return;

    const computeRadius = () => {
      radius.current = Math.max(
        56,
        Math.min(96, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.18)),
      );
      const d = `${radius.current * 2}px`;
      for (const base of [leftBaseRef.current, rightBaseRef.current]) {
        if (base) {
          base.style.width = d;
          base.style.height = d;
        }
      }
    };

    // Park each base ring near its zone's lower-center as a "home" hint when idle.
    const placeRest = () => {
      for (const [zoneRef, baseRef] of [
        [leftZoneRef, leftBaseRef] as const,
        [rightZoneRef, rightBaseRef] as const,
      ]) {
        const zone = zoneRef.current;
        const base = baseRef.current;
        if (!zone || !base) continue;
        const r = zone.getBoundingClientRect();
        const x = r.width / 2;
        const y = r.height - radius.current - 28;
        base.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
    };
    placeRestRef.current = placeRest;

    const tick = (t: number) => {
      const dt = lastT.current ? Math.min(0.05, (t - lastT.current) / 1000) : 0.016;
      lastT.current = t;
      const R = radius.current;
      const L = left.current;
      const Rt = right.current;

      // targets (0 when a zone is idle → axis self-centers)
      const yawTarget = L.active ? L.rx / R : 0;
      const thrTarget = L.active ? -L.ry / R : 0; // up (ry<0) = increase
      const pitchTarget = Rt.active ? -Rt.ry / R : 0; // up = nose up
      const rollTarget = Rt.active ? Rt.rx / R : 0;

      const k = 1 - Math.exp(-dt / SMOOTH_TAU);
      const s = smooth.current;
      s.yaw += (yawTarget - s.yaw) * k;
      s.pitch += (pitchTarget - s.pitch) * k;
      s.roll += (rollTarget - s.roll) * k;
      s.thr += (thrTarget - s.thr) * k;

      // throttle ratchet: deflection integrates the setpoint while held; holds on release.
      if (L.active) {
        throttle.current = Math.max(0, Math.min(1, throttle.current + s.thr * THROTTLE_RATE * dt));
        setTouchAxes({ throttle: throttle.current, yaw: s.yaw });
      } else {
        setTouchAxes({ yaw: s.yaw });
      }
      setTouchAxes({ pitch: s.pitch, roll: s.roll });

      // visuals
      if (thrFillRef.current) thrFillRef.current.style.transform = `scaleY(${throttle.current})`;
      if (leftNubRef.current) {
        const nx = L.active ? L.rx : 0;
        const ny = L.active ? L.ry : 0;
        leftNubRef.current.style.transform = `translate(-50%, -50%) translate(${nx}px, ${ny}px)`;
      }
      if (rightNubRef.current) {
        const nx = Rt.active ? Rt.rx : 0;
        const ny = Rt.active ? Rt.ry : 0;
        rightNubRef.current.style.transform = `translate(-50%, -50%) translate(${nx}px, ${ny}px)`;
      }

      const settled =
        !L.active &&
        !Rt.active &&
        Math.abs(s.yaw) < 1e-3 &&
        Math.abs(s.pitch) < 1e-3 &&
        Math.abs(s.roll) < 1e-3 &&
        Math.abs(s.thr) < 1e-3;
      if (settled) {
        s.yaw = s.pitch = s.roll = s.thr = 0;
        setTouchAxes({ yaw: 0, pitch: 0, roll: 0 });
        raf.current = 0;
        lastT.current = 0;
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    const ensureLoop = () => {
      if (!raf.current) {
        lastT.current = 0;
        raf.current = requestAnimationFrame(tick);
      }
    };

    const resetZone = (zone: Zone, base: HTMLDivElement | null) => {
      zone.active = false;
      zone.pointerId = -1;
      zone.rx = 0;
      zone.ry = 0;
      base?.classList.remove("active");
    };
    const resetAll = () => {
      resetZone(left.current, leftBaseRef.current);
      resetZone(right.current, rightBaseRef.current);
      setTouchThrottleHeld(false);
      placeRest();
      ensureLoop(); // smooth axes back to 0
    };
    resetAllRef.current = resetAll;

    const down =
      (zone: Zone, base: HTMLDivElement | null, isLeft: boolean) => (e: PointerEvent) => {
        if (!enabledRef.current || zone.active) return;
        zone.pointerId = e.pointerId;
        zone.ox = e.clientX;
        zone.oy = e.clientY;
        zone.rx = 0;
        zone.ry = 0;
        zone.active = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* synthetic events / browser quirks — capture is best-effort */
        }
        if (base) {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          base.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px) translate(-50%, -50%)`;
          base.classList.add("active");
        }
        if (isLeft) {
          throttle.current = getThrottle(); // seed at the live setpoint (hover on first touch)
          setTouchThrottleHeld(true);
        }
        ensureLoop();
      };
    const move = (zone: Zone) => (e: PointerEvent) => {
      if (zone.pointerId !== e.pointerId || !zone.active) return;
      let dx = e.clientX - zone.ox;
      let dy = e.clientY - zone.oy;
      const R = radius.current;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        const c = R / len;
        dx *= c;
        dy *= c;
      }
      zone.rx = dx;
      zone.ry = dy;
    };
    const up =
      (zone: Zone, base: HTMLDivElement | null, isLeft: boolean) => (e: PointerEvent) => {
        if (zone.pointerId !== e.pointerId) return;
        resetZone(zone, base);
        if (isLeft) setTouchThrottleHeld(false); // throttle holds its last value (sticky)
        placeRest();
        ensureLoop();
      };

    const lDown = down(left.current, leftBaseRef.current, true);
    const lMove = move(left.current);
    const lUp = up(left.current, leftBaseRef.current, true);
    const rDown = down(right.current, rightBaseRef.current, false);
    const rMove = move(right.current);
    const rUp = up(right.current, rightBaseRef.current, false);

    leftZone.addEventListener("pointerdown", lDown);
    leftZone.addEventListener("pointermove", lMove);
    leftZone.addEventListener("pointerup", lUp);
    leftZone.addEventListener("pointercancel", lUp);
    rightZone.addEventListener("pointerdown", rDown);
    rightZone.addEventListener("pointermove", rMove);
    rightZone.addEventListener("pointerup", rUp);
    rightZone.addEventListener("pointercancel", rUp);

    computeRadius();
    placeRest();
    window.addEventListener("resize", computeRadius);
    window.addEventListener("resize", placeRest);

    return () => {
      leftZone.removeEventListener("pointerdown", lDown);
      leftZone.removeEventListener("pointermove", lMove);
      leftZone.removeEventListener("pointerup", lUp);
      leftZone.removeEventListener("pointercancel", lUp);
      rightZone.removeEventListener("pointerdown", rDown);
      rightZone.removeEventListener("pointermove", rMove);
      rightZone.removeEventListener("pointerup", rUp);
      rightZone.removeEventListener("pointercancel", rUp);
      window.removeEventListener("resize", computeRadius);
      window.removeEventListener("resize", placeRest);
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      clearTouchAxes();
    };
  }, []);

  // When the sticks become disabled (pause / portrait) mid-hold, drop the held finger and
  // let the axes settle to 0; re-park the bases when re-enabled.
  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) placeRestRef.current();
    else resetAllRef.current();
  }, [enabled]);

  if (!IS_TOUCH) return null;
  return (
    <div className={`ff-sticks${enabled ? "" : " ff-sticks--hidden"}`} aria-hidden>
      <div className="ff-thr-gauge">
        <div className="ff-thr-track">
          <div className="ff-thr-fill" ref={thrFillRef} />
        </div>
        <div className="ff-thr-label">THR</div>
      </div>
      <div className="ff-stick-zone left" ref={leftZoneRef}>
        <div className="ff-stick-base" ref={leftBaseRef}>
          <div className="ff-stick-ring" />
          <div className="ff-stick-nub" ref={leftNubRef} />
        </div>
        <div className="ff-stick-tag">THR · YAW</div>
      </div>
      <div className="ff-stick-zone right" ref={rightZoneRef}>
        <div className="ff-stick-base" ref={rightBaseRef}>
          <div className="ff-stick-ring" />
          <div className="ff-stick-nub" ref={rightNubRef} />
        </div>
        <div className="ff-stick-tag">PITCH · ROLL</div>
      </div>
    </div>
  );
}
