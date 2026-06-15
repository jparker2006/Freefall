// Touch stick sensitivity — how much full thumb deflection on the virtual sticks maps into
// the attitude channels. Lower = gentler. Read by VirtualSticks each rAF tick and adjustable
// live from the touch settings sheet. Touch-only (desktop never reads it). The expo curve in
// commandedRates still applies on top; this just scales the reachable deflection, so it's a
// pure "how twitchy is the stick" knob.
import { create } from "zustand";

type TouchControls = {
  pitchRollSens: number; // right stick → pitch/roll, 0..1
  yawSens: number; // left stick horizontal → yaw, 0..1
  setPitchRollSens: (v: number) => void;
  setYawSens: (v: number) => void;
};

export const useTouchControls = create<TouchControls>((set) => ({
  // Intentionally gentle for thumb flying — full deflection only reaches 60% of the axis
  // (was effectively 1.0, which read as way too twitchy in pitch/roll). Dial it in the sheet.
  pitchRollSens: 0.6,
  yawSens: 1.0,
  setPitchRollSens: (v) => set({ pitchRollSens: v }),
  setYawSens: (v) => set({ yawSens: v }),
}));
