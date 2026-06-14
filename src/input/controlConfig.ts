// Keymap + control config. Uses KeyboardEvent.code (physical keys, so WASD works
// regardless of keyboard layout). Two gimbals mapped to two hands:
//   Left  (WASD): W/S throttle (held setpoint), A/D yaw
//   Right (mouse primary, arrows fallback): X roll, Y pitch
export const CONTROLS = {
  throttleUp: "KeyW",
  throttleDown: "KeyS",
  yawLeft: "KeyA",
  yawRight: "KeyD",
  pitchUp: "ArrowUp",
  pitchDown: "ArrowDown",
  rollLeft: "ArrowLeft",
  rollRight: "ArrowRight",
  modeToggle: ["Tab", "KeyT"],
  reset: "KeyR",
  precision: ["ShiftLeft", "ShiftRight"],
  hud: "KeyH",
  tuning: "Backquote",
  units: "KeyU",
  releaseLock: "Escape",
  // M3 orientation
  mapExpand: "KeyM", // toggle the minimap expanded ⇄ corner
  cycleTarget: "KeyG", // cycle the nav target (auto-nearest → each roster spot)
  goto: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"], // teleport 1–9
  // Add-on: waypoint + pause/free-look
  pause: "Space", // freeze the drone + free-look camera
  clearWaypoint: "KeyC", // clear the custom waypoint
} as const;
