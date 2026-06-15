import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { useTuning } from "./tuning/tuningStore";
import { useDroneStore, drone } from "./drone/droneState";
import { useWorldStore } from "./world/useWorldStore";
import { useGeoStore } from "./world/useGeoStore";
import { useGamepadStore } from "./input/gamepadStore";
import { useTouchControls } from "./input/touchControls";
import { IS_TOUCH } from "./ui/device";

// Mobile defaults (desktop unaffected): self-leveling Angle mode is far friendlier for
// thumb flying — the right stick reads as a lean-angle that auto-levels on release.
if (IS_TOUCH) {
  useDroneStore.getState().setMode("angle");
}

// No StrictMode: its dev-only double-invocation interferes with the stateful
// fixed-step physics loop and the global input listeners.
createRoot(document.getElementById("root")!).render(<App />);

// PWA: register the service worker so the app is installable (runs fullscreen from the
// home screen — the proper way to get true fullscreen on mobile). Production only, so it
// never interferes with the Vite dev server / HMR.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Dev-only handle for debugging / inspection from the console.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__freefall = {
    useTuning,
    useDroneStore,
    useWorldStore,
    useGeoStore,
    useGamepadStore,
    useTouchControls,
    drone,
  };
}
