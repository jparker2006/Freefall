// Freefall — world constants + the tunable flight parameters.
//
// World scale: 1 three.js unit = 1 meter. Gravity is real. All speeds/heights
// are real-world meaningful. Values here are *starting points*; the pilot dials
// the feel live via the leva panel (see tuning/) and exports new defaults.

// ---- World / integration ----
export const G = 9.81; // m/s^2
export const DT = 1 / 120; // fixed physics substep (s) — physics never runs on raw frame delta
export const MAX_SUBSTEPS = 8; // spiral-of-death cap (8 * 1/120 ≈ 66ms budget/frame)
export const MAX_FRAME_DELTA = 0.1; // clamp huge frame gaps (tab refocus) before accumulating

// M2: free flight — no ground, no collision. Spawn airborne over the LA anchor
// (local origin) at ~350 m, already hovering. Altitude ≈ AGL near spawn (anchor.ts).
export const SPAWN_POSITION: readonly [number, number, number] = [0, 350, 0];
// Yaw about +Y applied on spawn/reset. With the LA frame (north=+Z, east=-X) a
// 45° yaw ≈ heading 135° (SE), opening toward the Century City / downtown skyline.
// Tunable — fine-tune the opening vista by flying.
export const SPAWN_YAW_DEG = 45;

// ---- Control behaviour ----
export const THROTTLE_RATE = 0.6; // throttle setpoint travel per second (full sweep ~1.6s)

// Angle-mode self-leveling (outer P controller). tauRot already smooths the rates,
// so a pure-P loop reads as nicely damped without overshoot bookkeeping.
export const ANGLE_MAX_TILT_DEG = 55; // bank/pitch at full stick in Angle mode
export const ANGLE_KP = 8; // commanded rate (rad/s) per rad of angle error

// ---- HUD ----
export const TELEMETRY_HZ = 30; // rate the HTML OSD snapshot is republished (decoupled from 120Hz physics)

// ---- Tunable flight parameters ----------------------------------------------
// Canonical units: seconds for time-constants/ramps, degrees for rates/angles
// (the leva panel shows ms where natural and converts at the boundary).
export type TuningParams = {
  // Flight
  mass: number; // kg — inertia/weight
  twr: number; // thrust:weight — power/punch (hover throttle = 1/twr)
  maxRateRollPitch: number; // deg/s — top roll & pitch rotation speed
  maxRateYaw: number; // deg/s — yaw authority
  tauRot: number; // s — rotational smoothing/weight (low=snappy, high=glidey)
  rateExpo: number; // 0..1 — softer near center for fine control
  cQuad: number; // quadratic drag (lower=glide/float, higher=tight stops)
  cLinear: number; // linear low-speed settle
  tauThrottle: number; // s — motor response lag (adds weight)
  // Input
  inputRampTime: number; // s — key → full-deflection ease (the keyboard-feel knob)
  mouseSensitivity: number; // virtual-stick deflection per pixel of mouse motion
  invertPitch: boolean; // mouse Y direction (default false = mouse up is nose up)
  precisionScale: number; // 0..1 — rate/sens multiplier while Shift held
  // Camera
  fov: number; // deg — field of view
  cameraUptilt: number; // deg — FPV cam upward mount angle
  // Lens / postfx
  barrel: number; // 0..1 — fisheye/barrel distortion
  vignette: number; // 0..1 — dark corners
  chroma: number; // chromatic aberration offset
  motionBlur: number; // 0..1 — speed blur (0 = off)
  // Display
  metric: boolean; // false = ft/mph (US default), true = m / km/h
};

// Out-of-the-box "cinematic-freestyle" blend.
export const DEFAULTS: TuningParams = {
  mass: 0.7,
  twr: 2.2,
  maxRateRollPitch: 420,
  maxRateYaw: 250,
  tauRot: 0.09,
  rateExpo: 0.3,
  cQuad: 0.01,
  cLinear: 0.1,
  tauThrottle: 0.06,
  inputRampTime: 0.12,
  mouseSensitivity: 0.008,
  invertPitch: false,
  precisionScale: 0.4,
  fov: 120,
  cameraUptilt: 30,
  barrel: 0.3,
  vignette: 0.5,
  chroma: 0.0008,
  motionBlur: 0,
  metric: false,
};

export type PresetName = "cinematicFreestyle" | "freestyle" | "cinematic";

// Fly the two extremes to find your personal middle fast. Drag direction follows
// the physical lever in spec §3: lower cQuad = glide (cinematic), higher = tight
// stops (freestyle).
export const PRESETS: Record<PresetName, TuningParams> = {
  cinematicFreestyle: { ...DEFAULTS },
  freestyle: {
    ...DEFAULTS,
    mass: 0.5,
    twr: 2.6,
    maxRateRollPitch: 600,
    maxRateYaw: 320,
    tauRot: 0.05,
    rateExpo: 0.25,
    cQuad: 0.016,
    cLinear: 0.12,
    tauThrottle: 0.04,
    inputRampTime: 0.09,
  },
  cinematic: {
    ...DEFAULTS,
    mass: 0.95,
    twr: 2.0,
    maxRateRollPitch: 320,
    maxRateYaw: 200,
    tauRot: 0.16,
    rateExpo: 0.35,
    cQuad: 0.006,
    cLinear: 0.08,
    tauThrottle: 0.09,
    inputRampTime: 0.15,
  },
};
