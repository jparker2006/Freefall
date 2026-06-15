// First-run "how to fly" card. Shows once, the very first time someone opens Freefall in a
// given browser (remembered in localStorage), and tailors the controls to the device: the
// keyboard+mouse scheme on desktop, the dual virtual sticks on touch. Dismissed by the button
// or by tapping the backdrop. Not input-gated otherwise — it greets every new player.
import { useState } from "react";
import { IS_TOUCH } from "./device";
import { requestImmersiveFullscreen } from "./fullscreen";
import "./onboarding.css";

const SEEN_KEY = "ff-onboarded";

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

const DESKTOP: [string, string][] = [
  ["CLICK", "lock the mouse to fly (Esc frees it)"],
  ["W / S", "throttle — climb / descend (hold)"],
  ["A / D", "yaw — turn left / right"],
  ["MOUSE", "pitch & roll — aim where you fly"],
  ["TAB", "Acro ⇄ Angle (Angle auto-levels)"],
  ["SPACE", "pause + free-look camera"],
];

const TOUCH: [string, string][] = [
  ["LEFT STICK", "up / down = throttle (climb / descend, holds where you lift) · left / right = yaw"],
  ["RIGHT STICK", "pitch & roll — lean where you fly; release to self-level"],
  ["BOTH THUMBS", "the sticks appear under your thumbs — use both at once"],
  ["TOP BUTTONS", "pause · mode · respawn · map · HUD · ⚙"],
  ["⚙ SETTINGS", "stick sensitivity, tile detail, units"],
];

export function Onboarding(): React.ReactElement | null {
  const [show, setShow] = useState(() => !alreadySeen());
  if (!show) return null;

  const dismiss = () => {
    // The button/backdrop tap is a reliable click gesture — the best moment to go fullscreen
    // on a phone (where launch-time fullscreen is flaky). Do it before unmounting.
    if (IS_TOUCH) requestImmersiveFullscreen();
    setShow(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode → it'll just greet again next time */
    }
  };

  const rows = IS_TOUCH ? TOUCH : DESKTOP;
  const tip = IS_TOUCH
    ? "Tip: mobile starts in Angle mode (auto-levels), so keep right-stick moves small. Tap INSTALL for true fullscreen."
    : "Tip: you spawn hovering — ease W to rise, nudge the mouse forward to tip into a dive. 1–9 teleport across LA, M opens the map. A controller works too — just press a button.";

  return (
    <div className="ff-onb-scrim" onClick={dismiss}>
      <div
        className="ff-onb"
        role="dialog"
        aria-label="How to fly"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ff-onb-head">
          <div className="ff-onb-title">FREEFALL</div>
          <div className="ff-onb-sub">
            HOW TO FLY · {IS_TOUCH ? "TOUCH" : "KEYBOARD + MOUSE"}
          </div>
        </div>
        <div className="ff-onb-rows">
          {rows.map(([k, d]) => (
            <div className="ff-onb-row" key={k}>
              <span className="ff-onb-k">{k}</span>
              <span className="ff-onb-d">{d}</span>
            </div>
          ))}
        </div>
        <div className="ff-onb-tip">{tip}</div>
        <button className="ff-onb-go" onClick={dismiss}>
          START FLYING ▸
        </button>
      </div>
    </div>
  );
}
