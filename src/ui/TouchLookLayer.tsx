// Touch free-look surface, active only while paused. One finger = look (feeds the same
// mouse-delta accumulator FreeCamController's consumeLook() drains, so the look path is
// unchanged); two fingers = dolly/truck the free camera (centroid drag → pushTouchPan).
// Desktop never mounts this. The drone stays frozen (FlightModel bails while paused).
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { useDroneStore } from "../drone/droneState";
import { IS_TOUCH } from "./device";
import { pushTouchLook, pushTouchPan } from "../input/useInput";
import "./touch.css";

const LOOK_SCALE = 1.3; // touch px → mouse-delta px (FreeCamController then applies LOOK_SENS)
const PAN_SCALE = 1.0; // touch px → pushTouchPan units (FreeCamController applies TOUCH_PAN_GAIN)

export function TouchLookLayer(): ReactElement | null {
  const paused = useDroneStore((s) => s.paused);
  const layerRef = useRef<HTMLDivElement>(null);
  const ptsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastCentroidRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!IS_TOUCH) return;
    const el = layerRef.current;
    if (!el) return;
    const pts = ptsRef.current;

    const centroid = () => {
      let sx = 0;
      let sy = 0;
      for (const p of pts.values()) {
        sx += p.x;
        sy += p.y;
      }
      const n = pts.size || 1;
      return { x: sx / n, y: sy / n };
    };

    const onDown = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* best-effort */
      }
      if (pts.size === 2) lastCentroidRef.current = centroid();
    };
    const onMove = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const nx = e.clientX;
      const ny = e.clientY;
      if (pts.size >= 2) {
        // two-finger → dolly (vertical) + truck (horizontal) via centroid delta
        pts.set(e.pointerId, { x: nx, y: ny });
        const c = centroid();
        const last = lastCentroidRef.current;
        if (last) pushTouchPan(-(c.y - last.y) * PAN_SCALE, (c.x - last.x) * PAN_SCALE);
        lastCentroidRef.current = c;
      } else {
        // one-finger → look
        pts.set(e.pointerId, { x: nx, y: ny });
        pushTouchLook((nx - prev.x) * LOOK_SCALE, (ny - prev.y) * LOOK_SCALE);
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      lastCentroidRef.current = pts.size === 2 ? centroid() : null;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Drop any tracked fingers when leaving pause so a new pause starts clean.
  useEffect(() => {
    if (!paused) {
      ptsRef.current.clear();
      lastCentroidRef.current = null;
    }
  }, [paused]);

  if (!IS_TOUCH) return null;
  return <div className={`ff-look-layer${paused ? " active" : ""}`} ref={layerRef} aria-hidden />;
}
