// Immersive fullscreen on mobile. A phone won't go edge-to-edge on its own — even an
// installed PWA can launch with the system status/navigation bars visible (the dark "bar"),
// and a browser tab keeps its chrome. So on touch we request the Fullscreen API on the user's
// first interaction (and re-assert it on later taps if it was dismissed), then lock landscape
// and nudge a resize so the canvas refills the new viewport.
//
// We listen on BOTH pointerdown (fires for the virtual sticks) and touchend (the most
// reliably-accepted gesture for fullscreen across browsers). Gated to touch only — desktop is
// untouched. The actual request no-ops once already fullscreen.
import { useEffect } from "react";
import { IS_TOUCH } from "./device";
import { requestImmersiveFullscreen } from "./fullscreen";

type Lockable = { lock?: (orientation: string) => Promise<void> };

export function ImmersiveFullscreen(): null {
  useEffect(() => {
    if (!IS_TOUCH) return;

    const onGesture = () => requestImmersiveFullscreen();
    const onFsChange = () => {
      if (document.fullscreenElement) {
        // Orientation lock needs an active fullscreen, so do it here, not in the gesture.
        (screen.orientation as unknown as Lockable)?.lock?.("landscape").catch(() => {});
      }
      // The viewport just grew/shrank — make r3f (and any vh-based overlays) re-measure.
      window.dispatchEvent(new Event("resize"));
    };

    // capture + passive: run before the sticks' own handlers, never interfere with them.
    window.addEventListener("pointerdown", onGesture, { capture: true, passive: true });
    window.addEventListener("touchend", onGesture, { capture: true, passive: true });
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("touchend", onGesture, true);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, []);

  return null;
}
