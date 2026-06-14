// Single source of truth for every tunable flight/lens parameter.
//
// Flat zustand store so the physics loop can read params allocation-free via
// `useTuning.getState()` each frame (picks up leva edits live), while React
// components subscribe to just the fields they render.
import { create } from "zustand";
import { DEFAULTS, PRESETS } from "../constants";
import type { TuningParams, PresetName } from "../constants";

type TuningStore = TuningParams & {
  setParams: (patch: Partial<TuningParams>) => void;
  applyPreset: (name: PresetName) => void;
  toggleMetric: () => void;
  exportConfig: () => string;
};

export const useTuning = create<TuningStore>((set, get) => ({
  ...DEFAULTS,
  setParams: (patch) => set(patch),
  applyPreset: (name) => set({ ...PRESETS[name] }),
  toggleMetric: () => set((s) => ({ metric: !s.metric })),
  // Serialize just the params (not the actions) so the JSON pastes cleanly back
  // into constants.ts DEFAULTS.
  exportConfig: () => {
    const {
      mass,
      twr,
      maxRateRollPitch,
      maxRateYaw,
      tauRot,
      rateExpo,
      cQuad,
      cLinear,
      tauThrottle,
      inputRampTime,
      mouseSensitivity,
      invertPitch,
      precisionScale,
      fov,
      cameraUptilt,
      barrel,
      vignette,
      chroma,
      motionBlur,
      metric,
    } = get();
    const params: TuningParams = {
      mass,
      twr,
      maxRateRollPitch,
      maxRateYaw,
      tauRot,
      rateExpo,
      cQuad,
      cLinear,
      tauThrottle,
      inputRampTime,
      mouseSensitivity,
      invertPitch,
      precisionScale,
      fov,
      cameraUptilt,
      barrel,
      vignette,
      chroma,
      motionBlur,
      metric,
    };
    return JSON.stringify(params, null, 2);
  },
}));
