// Touch settings sheet — the leva replacement on mobile (leva is hidden on touch). Slides
// in from the right when the gear is tapped (reuses `tuningVisible`). Exposes the essentials
// in touch-friendly form: flight mode, the World detail + draw-distance sliders (LA only),
// and units. Writes the same stores the leva panel does. Desktop never mounts this.
import { useDroneStore } from "../drone/droneState";
import { useWorldStore } from "../world/useWorldStore";
import { useTuning } from "../tuning/tuningStore";
import { useTouchControls } from "../input/touchControls";
import { IS_TOUCH } from "./device";
import "./touch.css";

export function TouchSettings(): React.ReactElement | null {
  const open = useDroneStore((s) => s.tuningVisible);
  const mode = useDroneStore((s) => s.mode);
  const worldMode = useWorldStore((s) => s.mode);
  const errorTarget = useWorldStore((s) => s.errorTarget);
  const drawDistance = useWorldStore((s) => s.drawDistance);
  const metric = useTuning((s) => s.metric);
  const pitchRollSens = useTouchControls((s) => s.pitchRollSens);
  const yawSens = useTouchControls((s) => s.yawSens);
  if (!IS_TOUCH || !open) return null;

  const w = useWorldStore.getState;
  const tc = useTouchControls.getState;
  const close = () => useDroneStore.getState().toggleTuning();
  const setMode = (m: "acro" | "angle") => useDroneStore.getState().setMode(m);
  const setMetric = (toMetric: boolean) => {
    if (toMetric !== metric) useTuning.getState().toggleMetric();
  };

  return (
    <div className="ff-sheet-scrim" onClick={close}>
      <div className="ff-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ff-sheet-head">
          <span>SETTINGS</span>
          <button className="ff-btn" onClick={close} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="ff-set-row">
          <div className="ff-set-label">FLIGHT MODE</div>
          <div className="ff-seg">
            <button
              className={`ff-seg-btn${mode === "angle" ? " on" : ""}`}
              onClick={() => setMode("angle")}
            >
              ANGLE
            </button>
            <button
              className={`ff-seg-btn${mode === "acro" ? " on" : ""}`}
              onClick={() => setMode("acro")}
            >
              ACRO
            </button>
          </div>
        </div>

        <div className="ff-set-row">
          <div className="ff-set-label">
            PITCH / ROLL SENS <span className="ff-set-val">{pitchRollSens.toFixed(2)}</span>
            <div className="ff-set-sub">lower = gentler attitude</div>
          </div>
          <input
            type="range"
            min={0.25}
            max={1}
            step={0.05}
            value={pitchRollSens}
            onChange={(e) => tc().setPitchRollSens(Number(e.target.value))}
          />
        </div>
        <div className="ff-set-row">
          <div className="ff-set-label">
            YAW SENS <span className="ff-set-val">{yawSens.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.25}
            max={1}
            step={0.05}
            value={yawSens}
            onChange={(e) => tc().setYawSens(Number(e.target.value))}
          />
        </div>

        {worldMode === "la" && (
          <>
            <div className="ff-set-row">
              <div className="ff-set-label">
                DETAIL <span className="ff-set-val">{errorTarget}</span>
                <div className="ff-set-sub">lower = sharper (heavier)</div>
              </div>
              <input
                type="range"
                min={6}
                max={48}
                step={1}
                value={errorTarget}
                onChange={(e) => w().setErrorTarget(Number(e.target.value))}
              />
            </div>
            <div className="ff-set-row">
              <div className="ff-set-label">
                DRAW DIST <span className="ff-set-val">{(drawDistance / 1000).toFixed(1)}km</span>
              </div>
              <input
                type="range"
                min={2000}
                max={30000}
                step={500}
                value={drawDistance}
                onChange={(e) => w().setDrawDistance(Number(e.target.value))}
              />
            </div>
          </>
        )}

        <div className="ff-set-row">
          <div className="ff-set-label">UNITS</div>
          <div className="ff-seg">
            <button className={`ff-seg-btn${!metric ? " on" : ""}`} onClick={() => setMetric(false)}>
              US
            </button>
            <button className={`ff-seg-btn${metric ? " on" : ""}`} onClick={() => setMetric(true)}>
              METRIC
            </button>
          </div>
        </div>

        <div className="ff-sheet-foot">crisp-first · raise DETAIL if it stutters</div>
      </div>
    </div>
  );
}
