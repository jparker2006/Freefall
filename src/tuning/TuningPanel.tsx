// leva tuning panel — every flight/lens param, live (no reload). Grouped folders,
// Cinematic-Freestyle / Freestyle / Cinematic presets, and a config export that
// dumps JSON to the console + clipboard + a download, ready to paste back into
// constants.ts DEFAULTS. Toggle with the ` key (drives `tuningVisible`).
import { useEffect, useRef } from "react";
import { useControls, folder, button, Leva } from "leva";
import { DEFAULTS, PRESETS } from "../constants";
import type { TuningParams, PresetName } from "../constants";
import { useTuning } from "./tuningStore";
import { useDroneStore } from "../drone/droneState";
import { useWorldStore } from "../world/useWorldStore";
import type { WorldMode } from "../world/useWorldStore";
import { levaBridge } from "./levaBridge";
import { useGamepadStore } from "../input/gamepadStore";
import type { ControllerThrottleMode } from "../input/gamepadStore";
import { IS_TOUCH } from "../ui/device";

// The panel shows ms for time-constants and a couple of renamed keys; this is the
// shape of leva's value bag (folders flatten to unique leaf keys).
type LevaValues = {
  mass: number;
  twr: number;
  maxRateRollPitch: number;
  maxRateYaw: number;
  tauRotMs: number;
  rateExpo: number;
  cQuad: number;
  cLinear: number;
  tauThrottleMs: number;
  inputRampTimeMs: number;
  mouseSensitivity: number;
  invertPitch: boolean;
  precisionScale: number;
  fov: number;
  cameraUptilt: number;
  barrel: number;
  vignette: number;
  chroma: number;
  motionBlur: number;
  metric: boolean;
  controllerThrottle: string;
  showDroneBody: boolean;
  worldMode: string;
  errorTarget: number;
  drawDistance: number;
};

type LevaSetter = (patch: Record<string, unknown>) => void;

const presetToLeva = (p: TuningParams): Record<string, unknown> => ({
  mass: p.mass,
  twr: p.twr,
  maxRateRollPitch: p.maxRateRollPitch,
  maxRateYaw: p.maxRateYaw,
  tauRotMs: p.tauRot * 1000,
  rateExpo: p.rateExpo,
  cQuad: p.cQuad,
  cLinear: p.cLinear,
  tauThrottleMs: p.tauThrottle * 1000,
  inputRampTimeMs: p.inputRampTime * 1000,
  mouseSensitivity: p.mouseSensitivity,
  invertPitch: p.invertPitch,
  precisionScale: p.precisionScale,
  fov: p.fov,
  cameraUptilt: p.cameraUptilt,
  barrel: p.barrel,
  vignette: p.vignette,
  chroma: p.chroma,
  motionBlur: p.motionBlur,
  metric: p.metric,
});

function doExport(): void {
  const json = useTuning.getState().exportConfig();
  console.log(
    "%cFreefall tuning config:%c\n" + json,
    "color:#2bff8c;font-weight:bold",
    "color:inherit",
  );
  try {
    navigator.clipboard?.writeText(json)?.catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "freefall-tuning.json";
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

export function TuningPanel() {
  const tuningVisible = useDroneStore((s) => s.tuningVisible);
  const setRef = useRef<LevaSetter | null>(null);

  const applyPreset = (name: PresetName) => setRef.current?.(presetToLeva(PRESETS[name]));

  const [values, set] = useControls(
    () => ({
      Flight: folder({
        mass: { value: DEFAULTS.mass, min: 0.2, max: 2, step: 0.01 },
        twr: { value: DEFAULTS.twr, min: 1.2, max: 5, step: 0.05 },
        maxRateRollPitch: {
          value: DEFAULTS.maxRateRollPitch,
          min: 120,
          max: 1000,
          step: 10,
          label: "rate R/P °/s",
        },
        maxRateYaw: { value: DEFAULTS.maxRateYaw, min: 60, max: 600, step: 10, label: "rate yaw °/s" },
        tauRotMs: { value: DEFAULTS.tauRot * 1000, min: 10, max: 300, step: 1, label: "tauRot ms" },
        rateExpo: { value: DEFAULTS.rateExpo, min: 0, max: 0.9, step: 0.01 },
        cQuad: { value: DEFAULTS.cQuad, min: 0, max: 0.05, step: 0.001 },
        cLinear: { value: DEFAULTS.cLinear, min: 0, max: 1, step: 0.01 },
        tauThrottleMs: {
          value: DEFAULTS.tauThrottle * 1000,
          min: 0,
          max: 300,
          step: 1,
          label: "tauThrottle ms",
        },
      }),
      Input: folder({
        inputRampTimeMs: {
          value: DEFAULTS.inputRampTime * 1000,
          min: 0,
          max: 400,
          step: 5,
          label: "inputRamp ms",
        },
        mouseSensitivity: { value: DEFAULTS.mouseSensitivity, min: 0.001, max: 0.04, step: 0.0005 },
        invertPitch: { value: DEFAULTS.invertPitch },
        precisionScale: { value: DEFAULTS.precisionScale, min: 0.1, max: 1, step: 0.05 },
        controllerThrottle: {
          value: useGamepadStore.getState().throttleMode,
          options: ["sticky", "hover"],
          label: "ctrl throttle",
        },
      }),
      Camera: folder({
        fov: { value: DEFAULTS.fov, min: 60, max: 150, step: 1 },
        cameraUptilt: { value: DEFAULTS.cameraUptilt, min: 0, max: 60, step: 1, label: "uptilt °" },
      }),
      Lens: folder({
        barrel: { value: DEFAULTS.barrel, min: 0, max: 1, step: 0.01 },
        vignette: { value: DEFAULTS.vignette, min: 0, max: 1, step: 0.01 },
        chroma: { value: DEFAULTS.chroma, min: 0, max: 0.01, step: 0.0001 },
        motionBlur: { value: DEFAULTS.motionBlur, min: 0, max: 1, step: 0.01 },
      }),
      Display: folder({
        metric: { value: DEFAULTS.metric },
        showDroneBody: { value: false, label: "debug: show quad" },
      }),
      World: folder({
        worldMode: {
          value: useWorldStore.getState().mode,
          options: ["la", "sandbox"],
          label: "world",
        },
        errorTarget: {
          value: useWorldStore.getState().errorTarget,
          min: 6, // floor: below this the GPU can run out of VRAM (WebGL context loss)
          max: 48,
          step: 1,
          label: "detail (lower=sharp)",
        },
        drawDistance: {
          value: useWorldStore.getState().drawDistance,
          min: 2000,
          max: 30000,
          step: 500,
          label: "draw dist m",
        },
      }),
      Presets: folder({
        "Cinematic Freestyle": button(() => applyPreset("cinematicFreestyle")),
        Freestyle: button(() => applyPreset("freestyle")),
        Cinematic: button(() => applyPreset("cinematic")),
      }),
      "Export config → console + clipboard": button(() => doExport()),
    }),
    [],
  );

  // expose leva's setter to the preset buttons + the 'U' hotkey bridge (in an
  // effect, not during render — assigning a ref during render is disallowed).
  useEffect(() => {
    setRef.current = set as unknown as LevaSetter;
    levaBridge.set = set as unknown as LevaSetter;
    return () => {
      levaBridge.set = null;
    };
  }, [set]);

  // push leva values into the tuning store (physics/camera/postfx read it live)
  useEffect(() => {
    const v = values as unknown as LevaValues;
    useTuning.getState().setParams({
      mass: v.mass,
      twr: v.twr,
      maxRateRollPitch: v.maxRateRollPitch,
      maxRateYaw: v.maxRateYaw,
      tauRot: v.tauRotMs / 1000,
      rateExpo: v.rateExpo,
      cQuad: v.cQuad,
      cLinear: v.cLinear,
      tauThrottle: v.tauThrottleMs / 1000,
      inputRampTime: v.inputRampTimeMs / 1000,
      mouseSensitivity: v.mouseSensitivity,
      invertPitch: v.invertPitch,
      precisionScale: v.precisionScale,
      fov: v.fov,
      cameraUptilt: v.cameraUptilt,
      barrel: v.barrel,
      vignette: v.vignette,
      chroma: v.chroma,
      motionBlur: v.motionBlur,
      metric: v.metric,
    });
    useDroneStore.getState().setShowDroneBody(v.showDroneBody);

    // Controller throttle feel lives in the gamepad store (read by advanceInput each frame).
    if (v.controllerThrottle !== useGamepadStore.getState().throttleMode) {
      useGamepadStore.getState().setThrottleMode(v.controllerThrottle as ControllerThrottleMode);
    }

    // World settings live in their own store (kept out of the flight-tuning export).
    const w = useWorldStore.getState();
    w.setErrorTarget(v.errorTarget);
    w.setDrawDistance(v.drawDistance);
    if (v.worldMode !== w.mode) w.setMode(v.worldMode as WorldMode);
  }, [values]);

  // On touch the leva panel is unusable (drag-number inputs) and intercepts touches, so it
  // never shows — the TouchSettings sheet replaces it (and reuses the same tuningVisible flag).
  return <Leva hidden={IS_TOUCH || !tuningVisible} />;
}
