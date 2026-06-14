// World / environment state for M2 — kept SEPARATE from useTuning (flight + lens)
// so the tuning export stays flight-only. Holds: which world is shown (real LA
// tiles vs the M1 greybox), tile streaming detail + draw distance (the "World"
// leva group), the atmosphere mood, and the startup loading / API-key state.
import { create } from "zustand";
import type { MoodName } from "./moods";

// Vite exposes only VITE_-prefixed env vars to the client. Empty/missing key →
// fly the greybox sandbox instead of LA (graceful fallback, no hard failure).
export const GOOGLE_API_KEY = (
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? ""
).trim();
export const HAS_API_KEY = GOOGLE_API_KEY.length > 0;

export type WorldMode = "la" | "sandbox";

type WorldStore = {
  mode: WorldMode;
  loading: boolean; // true until the initial LA tiles settle (LA mode only)
  loadEpoch: number; // bumped per teleport so the loading tracker re-arms its gate
  apiKeyMissing: boolean; // no VITE_GOOGLE_MAPS_API_KEY → sandbox fallback
  tileError: boolean; // Google auth / quota failure → sandbox fallback
  errorTarget: number; // tile screen-space error target (lower = crisper/heavier)
  drawDistance: number; // camera far plane (m) ≈ how far the city renders
  mood: MoodName;
  contextLost: boolean; // WebGL context lost (GPU out of memory) → show a notice
  setMode: (m: WorldMode) => void;
  setLoading: (v: boolean) => void;
  beginTeleportLoad: () => void; // M3 teleport: show the overlay + re-arm the gate
  setErrorTarget: (v: number) => void;
  setDrawDistance: (v: number) => void;
  setMood: (m: MoodName) => void;
  reportTileError: () => void;
  setContextLost: (v: boolean) => void;
};

export const useWorldStore = create<WorldStore>((set) => ({
  mode: HAS_API_KEY ? "la" : "sandbox",
  loading: HAS_API_KEY, // only LA mode streams; sandbox is instant
  loadEpoch: 0,
  apiKeyMissing: !HAS_API_KEY,
  tileError: false,
  // detail (screen-space error; lower = sharper/heavier). 10 is a touch sharper than
  // the old 12 yet lighter at the capped dpr 1.5; the slider floor (6) + dpr cap keep
  // it out of the GPU-memory zone that loses the WebGL context.
  errorTarget: 10,
  drawDistance: 14000, // ~14 km — far skyline fades into haze (see moods fog)
  mood: "daylight",
  contextLost: false,
  setMode: (m) => set({ mode: m, loading: m === "la" && HAS_API_KEY }),
  setLoading: (v) => set({ loading: v }),
  beginTeleportLoad: () => set((s) => ({ loading: true, loadEpoch: s.loadEpoch + 1 })),
  setErrorTarget: (v) => set({ errorTarget: v }),
  setDrawDistance: (v) => set({ drawDistance: v }),
  setMood: (m) => set({ mood: m }),
  reportTileError: () => set({ mode: "sandbox", tileError: true, loading: false }),
  setContextLost: (v) => set({ contextLost: v }),
}));
