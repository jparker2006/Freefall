import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { useTuning } from "./tuning/tuningStore";
import { useDroneStore, drone } from "./drone/droneState";

// No StrictMode: its dev-only double-invocation interferes with the stateful
// fixed-step physics loop and the global input listeners.
createRoot(document.getElementById("root")!).render(<App />);

// Dev-only handle for debugging / inspection from the console.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__freefall = { useTuning, useDroneStore, drone };
}
