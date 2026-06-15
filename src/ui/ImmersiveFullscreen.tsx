// Installed-PWA immersive fullscreen. Android often launches a PWA in `standalone` mode —
// the system status/navigation bars stay visible even when the manifest asks for fullscreen —
// which leaves a dark system bar along a screen edge (and the web viewport ends up smaller
// than the screen). The Fullscreen API, invoked from a user gesture, hides those bars for
// true edge-to-edge play, and the resulting resize makes the canvas refill the whole screen.
//
// We arm it on touch (the first tap goes immersive; later taps re-assert it if it was
// dismissed). It only runs inside an INSTALLED PWA — a normal browser tab is left alone (the
// rotate gate already offers a manual "GO FULLSCREEN" button there).
import { useEffect } from "react";
import { IS_TOUCH } from "./device";

function isInstalledPWA(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

type Lockable = { lock?: (orientation: string) => Promise<void> };

export function ImmersiveFullscreen(): null {
  useEffect(() => {
    if (!IS_TOUCH || !isInstalledPWA()) return;

    const enter = () => {
      const el = document.documentElement as HTMLElement & {
        requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>;
      };
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
      }
    };
    // Once we're actually fullscreen, lock to landscape (this API needs fullscreen first).
    const onFsChange = () => {
      if (document.fullscreenElement) {
        (screen.orientation as unknown as Lockable)?.lock?.("landscape").catch(() => {});
      }
    };

    // Capture phase + passive: fire before the virtual sticks' own pointerdown, but never
    // interfere with it (no preventDefault / no stopPropagation).
    window.addEventListener("pointerdown", enter, { capture: true, passive: true });
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("pointerdown", enter, true);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, []);

  return null;
}
