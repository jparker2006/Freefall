// Touch / mobile detection + orientation. Detection is computed ONCE at module load:
// the result decides whether the touch overlays mount and the HUD reflows, and it must
// be stable for the session (re-deciding mid-flight would tear down input). The desktop
// path is byte-for-byte unchanged because IS_TOUCH is false on a normal desktop, so the
// touch overlays never mount and the gated branches never run.
//
// A URL override exists for testing: `?touch=1` forces the touch UI, `?desktop=1` forces
// the desktop UI. This is how Playwright exercises both, and how the byte-for-byte desktop
// regression check is run on a touch device.
import { useEffect, useState } from "react";

function detectTouch(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("touch")) return params.get("touch") !== "0";
    if (params.has("desktop")) return params.get("desktop") === "0";
  } catch {
    /* no window.location (shouldn't happen in this client-only app) */
  }
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const hasTouchPoints = (navigator.maxTouchPoints ?? 0) > 0;
  return coarse && hasTouchPoints;
}

/** True when the touch UI (virtual sticks, button cluster, settings sheet, rotate gate) is active. */
export const IS_TOUCH: boolean = detectTouch();

export type Orientation = "portrait" | "landscape";

function currentOrientation(): Orientation {
  const portrait =
    window.matchMedia?.("(orientation: portrait)").matches ??
    window.innerHeight > window.innerWidth;
  return portrait ? "portrait" : "landscape";
}

/** Live orientation, for the landscape gate. Listens to media-query + resize + orientationchange. */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(currentOrientation);
  useEffect(() => {
    const update = () => setOrientation(currentOrientation());
    const mq = window.matchMedia("(orientation: portrait)");
    mq.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    update();
    return () => {
      mq.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return orientation;
}
