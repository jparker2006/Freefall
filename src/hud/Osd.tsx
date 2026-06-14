// Retro green FPV OSD — an HTML/CSS overlay driven by the throttled telemetry
// snapshot. Crosshair, artificial horizon, altitude, ground speed, throttle,
// heading, timer, flight mode, dual stick indicators, scanlines.
import { useDroneStore } from "../drone/droneState";
import { useTuning } from "../tuning/tuningStore";
import { useGeoStore } from "../world/useGeoStore";
import { useWorldStore } from "../world/useWorldStore";
import { StickIndicator } from "./StickIndicator";
import "./osd.css";

const PX_PER_DEG = 6; // artificial-horizon pitch scale

function fmtTime(s: number): string {
  const total = Math.max(0, Math.floor(s));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const cardinal = (deg: number): string => CARDINALS[Math.round(deg / 45) % 8];

export function Osd() {
  const t = useDroneStore((s) => s.telemetry);
  const mode = useDroneStore((s) => s.mode);
  const hudVisible = useDroneStore((s) => s.hudVisible);
  const paused = useDroneStore((s) => s.paused);
  const metric = useTuning((s) => s.metric);

  // M3 orientation readouts (LA only). Selectors → re-render only when the shown
  // value changes, not every 12 Hz geo tick.
  const worldMode = useWorldStore((s) => s.mode);
  const geoReady = useGeoStore((s) => s.ready);
  const neighborhood = useGeoStore((s) => s.neighborhood);
  const targetName = useGeoStore((s) => s.targetName);
  const targetDistanceMi = useGeoStore((s) => s.targetDistanceMi);
  const targetBearingDeg = useGeoStore((s) => s.targetBearingDeg);
  const chevron = useGeoStore((s) => s.chevron);

  if (!hudVisible) return null;

  // Pause / free-look: hide all flight chrome (and the minimap + 3D guide elsewhere)
  // for a clean capture view — just a small PAUSED badge + a controls hint.
  if (paused) {
    return (
      <div className="osd osd-paused">
        <div className="paused-badge">❚❚ PAUSED · FREE LOOK</div>
        <div className="paused-hint">MOUSE LOOK · WASD MOVE · SHIFT FAST · SPACE RESUME</div>
      </div>
    );
  }

  const showNav = worldMode === "la" && geoReady;
  const navDist = metric
    ? `${(targetDistanceMi * 1.60934).toFixed(1)}km`
    : `${targetDistanceMi.toFixed(1)}mi`;

  const altitude = metric ? t.altitude : t.altitude * 3.28084;
  const altUnit = metric ? "m" : "ft";
  const speed = metric ? t.groundSpeed * 3.6 : t.groundSpeed * 2.23694;
  const speedUnit = metric ? "km/h" : "mph";
  const vspeed = metric ? t.verticalSpeed : t.verticalSpeed * 3.28084;

  // horizon moves down when nose goes up, and rolls opposite to the aircraft
  const horizonTransform = `translateY(${t.pitchDeg * PX_PER_DEG}px) rotate(${-t.rollDeg}deg)`;

  return (
    <div className="osd">
      {/* artificial horizon */}
      <div className="horizon-clip">
        <div className="horizon" style={{ transform: horizonTransform }}>
          <div className="horizon-line" />
        </div>
      </div>

      <div className="crosshair">+</div>

      {/* top bar */}
      <div className="readout mode">{mode === "acro" ? "ACRO" : "ANGLE"}</div>
      <div className="readout heading">
        {String(Math.round(t.heading)).padStart(3, "0")}° {cardinal(t.heading)}
      </div>
      <div className="readout timer">{fmtTime(t.timer)}</div>

      {/* orientation: live neighborhood + nav target (top-left) */}
      {showNav && (
        <div className="readout place">
          <div className="place-hood">▸ {neighborhood}</div>
          {targetName ? (
            <div className="place-nav">
              → {targetName} · {navDist} · {String(targetBearingDeg).padStart(3, "0")}°
            </div>
          ) : null}
        </div>
      )}

      {/* off-screen waypoint chevron (driven by WaypointGuide) */}
      {chevron.visible ? (
        <div
          className="wp-chevron"
          style={{
            left: `${chevron.x}px`,
            top: `${chevron.y}px`,
            transform: `translate(-50%, -50%) rotate(${chevron.angle}deg)`,
          }}
        >
          ▲
        </div>
      ) : null}

      {/* altitude / speed */}
      <div className="readout alt">
        <div className="label">ALT</div>
        <div>
          <span className="value">{Math.round(altitude)}</span>
          <span className="unit">{altUnit}</span>
        </div>
        <div className="vspd">
          VS {vspeed >= 0 ? "+" : ""}
          {vspeed.toFixed(1)}
        </div>
      </div>
      <div className="readout spd">
        <div className="label">SPD</div>
        <div>
          <span className="value">{Math.round(speed)}</span>
          <span className="unit">{speedUnit}</span>
        </div>
      </div>

      {/* throttle */}
      <div className="throttle">
        <div className="label">THR {Math.round(t.throttlePct)}%</div>
        <div className="throttle-track">
          <div className="throttle-fill" style={{ width: `${t.throttlePct}%` }} />
        </div>
      </div>

      {/* center messages */}
      <div className="center-msg">
        {!t.locked ? <div className="engage">◎ CLICK TO ENGAGE MOUSE</div> : null}
      </div>

      {/* virtual gimbals (Mode-2 layout) */}
      <StickIndicator
        side="left"
        label="THR / YAW"
        nx={(t.stickYaw + 1) / 2}
        ny={t.stickThrottle}
      />
      <StickIndicator
        side="right"
        label="PITCH / ROLL"
        nx={(t.stickRoll + 1) / 2}
        ny={(t.stickPitch + 1) / 2}
      />

      <div className="hint">
        CLICK = MOUSE LOCK · W/S THROTTLE · A/D YAW · MOUSE or ARROWS PITCH/ROLL · TAB MODE · R
        RESET · SHIFT PRECISION · H HUD · ` PANEL · U UNITS · M MAP · 1–9 GO · G TARGET · SPACE
        PAUSE · CLICK MAP = WAYPOINT · C CLEAR
      </div>

      <div className="scanlines" />
      <div className="vhs-vignette" />
    </div>
  );
}
