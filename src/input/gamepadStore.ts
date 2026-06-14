// Gamepad UI/setting state — kept tiny and SEPARATE from the hot input path (the
// per-frame stick/button reads live in module-level state inside useInput.ts /
// GamepadController, never in React). This store holds only:
//   • `connected` — is a usable pad currently exposed by the browser? (drives the
//     on-screen "press a button to connect" → "controller connected" indicator).
//   • `throttleMode` — the one user-facing controller setting (see §3 of the spec):
//     'sticky' (default; deflection = rate of throttle change, holds when centered —
//     the analog W/S model) or 'hover' (left-stick-Y is a direct position, center = hover).
import { create } from "zustand";

export type ControllerThrottleMode = "sticky" | "hover";

type GamepadStore = {
  connected: boolean;
  throttleMode: ControllerThrottleMode;
  setConnected: (v: boolean) => void;
  setThrottleMode: (m: ControllerThrottleMode) => void;
  toggleThrottleMode: () => void;
};

export const useGamepadStore = create<GamepadStore>((set) => ({
  connected: false,
  throttleMode: "sticky",
  setConnected: (v) => set({ connected: v }),
  setThrottleMode: (m) => set({ throttleMode: m }),
  toggleThrottleMode: () =>
    set((s) => ({ throttleMode: s.throttleMode === "sticky" ? "hover" : "sticky" })),
}));
