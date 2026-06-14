// Small bottom-center chip that reflects controller presence. Per the locked decision
// ("prompt + connected"): when no pad is exposed it nudges the user to wake one (a pad
// is invisible to the browser until its first button press), and once one connects it
// confirms with a brief-styled "controller" chip. Hidden while paused (clean capture)
// and when the HUD is toggled off. Pure DOM overlay — does NOT touch the input hot path.
import { useDroneStore } from "../drone/droneState";
import { useGamepadStore } from "../input/gamepadStore";
import "./gamepad.css";

export function GamepadIndicator() {
  const connected = useGamepadStore((s) => s.connected);
  const paused = useDroneStore((s) => s.paused);
  const hudVisible = useDroneStore((s) => s.hudVisible);

  if (paused || !hudVisible) return null;

  return (
    <div className={`gp-chip${connected ? " is-connected" : ""}`}>
      <span className="gp-glyph" aria-hidden="true">
        🎮
      </span>
      {connected ? "CONTROLLER" : "PRESS A BUTTON TO CONNECT CONTROLLER"}
    </div>
  );
}
