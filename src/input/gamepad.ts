// Pure Gamepad-API helpers — no React, no flight state. Standard-mapping button indices,
// pad selection, radial deadzone, and the rumble effect. Kept separate so
// GamepadController stays focused on per-frame orchestration.
//
// The "standard" mapping (https://w3c.github.io/gamepad/#remapping) is what makes PS4,
// PS5, Xbox, and most pads expose the same axis/button layout — we rely on it for the
// common case and fall back to the same indices best-effort for non-standard devices.

// Standard-mapping button indices.
export const BTN = {
  cross: 0, // ✕ / A
  circle: 1, // ○ / B
  square: 2, // □ / X
  triangle: 3, // △ / Y
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  share: 8, // Share / Back / View
  options: 9, // Options / Start / Menu
  l3: 10,
  r3: 11,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
  guide: 16, // PS / Xbox / Guide
} as const;

// Standard-mapping axes: [0],[1] = left stick X/Y; [2],[3] = right stick X/Y.
// (Gamepad Y axes are +down, so callers negate for "up = positive".)

// Pick the first usable connected pad, preferring the W3C "standard" mapping.
export function pickGamepad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  let fallback: Gamepad | null = null;
  for (const p of pads) {
    if (!p || !p.connected) continue;
    if (p.mapping === "standard") return p;
    if (!fallback) fallback = p; // non-standard → best-effort, assume same order
  }
  return fallback;
}

// Radial deadzone: ignore drift inside `dz`, then rescale the remaining range so full
// deflection is still reachable. Writes [x,y] into `out` (allocation-free hot path).
export function applyRadialDeadzone(
  x: number,
  y: number,
  dz: number,
  out: [number, number],
): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag <= dz || mag === 0) {
    out[0] = 0;
    out[1] = 0;
    return out;
  }
  const scaled = (mag - dz) / (1 - dz) / mag; // [dz..1] → [0..1], preserve direction
  out[0] = x * scaled;
  out[1] = y * scaled;
  return out;
}

// vibrationActuator isn't in every TS DOM lib version — narrow it locally.
type Rumbler = {
  vibrationActuator?: {
    playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>;
  };
};

// Subtle dual-rumble scaled to descent speed (m/s). Graceful no-op where vibration is
// unsupported (Safari/Firefox vary) or the actuator is absent — never throws.
export function playRumble(pad: Gamepad | null, descentSpeed: number): void {
  const act = (pad as (Gamepad & Rumbler) | null)?.vibrationActuator;
  if (!act?.playEffect) return;
  // ~1 m/s (gentle touch) → ~22 m/s (near terminal, a hard slam)
  const t = Math.min(1, Math.max(0, (descentSpeed - 1) / 21));
  try {
    act
      .playEffect("dual-rumble", {
        duration: 90 + 110 * t,
        strongMagnitude: 0.15 + 0.85 * t,
        weakMagnitude: 0.1 + 0.5 * t,
      })
      ?.catch?.(() => {});
  } catch {
    /* unsupported → silent */
  }
}
