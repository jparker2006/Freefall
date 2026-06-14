// Touch action cluster (top-center row). Each button calls the SAME store action as its
// desktop key, so behavior is identical — only the trigger differs. Desktop never mounts
// this. The gear reuses `tuningVisible` (the leva toggle) to open the touch settings sheet;
// leva itself is hidden on touch.
import { useDroneStore } from "../drone/droneState";
import { useWorldStore } from "../world/useWorldStore";
import { respawn } from "../input/useInput";
import { cycleTarget } from "../world/locations";
import { IS_TOUCH } from "./device";
import "./touch.css";

export function TouchButtons(): React.ReactElement | null {
  const paused = useDroneStore((s) => s.paused);
  const mode = useDroneStore((s) => s.mode);
  const worldMode = useWorldStore((s) => s.mode);
  if (!IS_TOUCH) return null;

  const ds = useDroneStore.getState;
  return (
    <div className="ff-btns">
      <button className="ff-btn" onClick={() => ds().togglePaused()} aria-label="Pause / resume">
        {paused ? "▶" : "❚❚"}
      </button>
      <button className="ff-btn ff-btn-wide" onClick={() => ds().toggleMode()} aria-label="Flight mode">
        {mode === "acro" ? "ACRO" : "ANGLE"}
      </button>
      <button className="ff-btn" onClick={() => respawn()} aria-label="Respawn">
        ⟲
      </button>
      {worldMode === "la" && (
        <button className="ff-btn" onClick={() => cycleTarget()} aria-label="Cycle target / clear waypoint">
          TGT
        </button>
      )}
      <button className="ff-btn" onClick={() => ds().toggleHud()} aria-label="Toggle HUD">
        HUD
      </button>
      <button className="ff-btn" onClick={() => ds().toggleTuning()} aria-label="Settings">
        ⚙
      </button>
    </div>
  );
}
