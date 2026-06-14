// The controller's per-frame brain. A null-rendering r3f component whose useFrame ALWAYS
// runs (FlightModel bails when paused, FreeCamController bails when not — neither can host
// an always-on poll, and we must read the resume button + drive the free cam while paused).
//
// Each frame it: picks the active pad, updates the connected indicator, edge-detects buttons
// → existing store actions, and feeds the sticks into either the flight channels (Mode 2,
// deadzoned) or, while paused, the free camera (right = look, left = dolly/truck). Haptics
// fire off the ground-collision touchdown edge. Everything is additive on top of the
// existing input seam — keyboard/mouse + touch stay live (last-active source wins).
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { drone, useDroneStore } from "../drone/droneState";
import { useGeoStore } from "../world/useGeoStore";
import { LOCATIONS, teleportTo, cycleTarget } from "../world/locations";
import { localToLatLon } from "../world/geo";
import { consumeGroundImpact } from "../drone/groundCollision";
import { useGamepadStore } from "./gamepadStore";
import {
  setGamepadInput,
  clearGamepadInput,
  respawn,
  pushTouchLook,
  pushTouchPan,
} from "./useInput";
import { BTN, pickGamepad, applyRadialDeadzone, playRumble } from "./gamepad";

const DEADZONE = 0.08; // radial; ignore resting drift, rescale the rest to full deflection
const ACTIVE_TIMEOUT_MS = 1500; // a pad must show input this recently to "own" the flight axes
const WAYPOINT_HOLD_MS = 500; // ✕ held longer than this clears instead of dropping
const GP_LOOK_RATE = 1000; // free-cam look: px-equivalent/s per unit stick (~2.2 rad/s full)
const GP_PAN_RATE = 160; // free-cam dolly/truck: m/s-equivalent per unit stick (~40 m/s full)
const IMPACT_MIN = 1.0; // m/s — quieter touchdowns don't rumble

// module scratch — single component instance, single-threaded useFrame
const _left: [number, number] = [0, 0];
const _right: [number, number] = [0, 0];
const _ll = { lat: 0, lon: 0 };

export function GamepadController(): null {
  const prevPressed = useRef<boolean[]>([]);
  const feeding = useRef(false); // are we currently driving the flight channels?
  const appliedAcro = useRef(false); // one-time "controller → Acro" latch
  const lastActivity = useRef(0); // performance.now() of the last stick/button activity
  const crossStart = useRef<number | null>(null); // ✕ press timestamp (hold-to-clear)
  const crossCleared = useRef(false); // ✕ already fired a clear this hold

  useFrame((_s, delta) => {
    // Always drain the touchdown impact so it never queues; rumble only if a pad is here.
    const impact = consumeGroundImpact();

    const pad = pickGamepad();
    const connected = !!pad;
    if (connected !== useGamepadStore.getState().connected) {
      useGamepadStore.getState().setConnected(connected);
    }

    if (!pad) {
      if (feeding.current) {
        clearGamepadInput();
        feeding.current = false;
      }
      prevPressed.current.length = 0;
      crossStart.current = null;
      return;
    }

    if (impact != null && impact > IMPACT_MIN) playRumble(pad, impact);

    const paused = useDroneStore.getState().paused;
    const buttons = pad.buttons;
    const prev = prevPressed.current;
    const jp = (i: number): boolean => !!buttons[i]?.pressed && !prev[i];

    // ---- sticks (read BEFORE buttons so the Acro-default latch below can't clobber a
    //      same-frame mode-toggle press) ----
    const ax = pad.axes;
    applyRadialDeadzone(ax[0] ?? 0, ax[1] ?? 0, DEADZONE, _left); // left: x=yaw, y=throttle
    applyRadialDeadzone(ax[2] ?? 0, ax[3] ?? 0, DEADZONE, _right); // right: x=roll, y=pitch
    const lx = _left[0];
    const ly = _left[1];
    const rx = _right[0];
    const ry = _right[1];

    // activity → owns the flight axes for a short window (last-active-source wins)
    const now = performance.now();
    const stickActive = lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0;
    const anyButton = buttons.some((b) => b.pressed);
    if (stickActive || anyButton) lastActivity.current = now;
    // Controller default = Acro, applied once on first activity. Done before the button
    // block so an initial △ still registers as a real toggle (Acro→Angle), not a no-op.
    if (!appliedAcro.current && (stickActive || anyButton)) {
      useDroneStore.getState().setMode("acro");
      appliedAcro.current = true;
    }
    const driving = now - lastActivity.current < ACTIVE_TIMEOUT_MS;
    const precision = (buttons[BTN.l2]?.pressed ?? false) || (buttons[BTN.l2]?.value ?? 0) > 0.5;

    // ---- buttons (rising edge) ----
    // Options toggles pause in any state (so the controller can always resume free-look).
    if (jp(BTN.options)) {
      const willPause = !useDroneStore.getState().paused;
      useDroneStore.getState().togglePaused();
      if (willPause && useGeoStore.getState().expanded) useGeoStore.getState().setExpanded(false);
    }
    // The rest only while flying — avoids an accidental teleport/respawn mid free-look shot.
    if (!paused) {
      if (jp(BTN.triangle)) useDroneStore.getState().toggleMode();
      if (jp(BTN.circle)) respawn();
      if (jp(BTN.square)) useGeoStore.getState().toggleExpanded();
      if (jp(BTN.share)) useDroneStore.getState().toggleHud();
      if (jp(BTN.l1)) teleportRelative(-1);
      if (jp(BTN.r1)) teleportRelative(1);
      if (jp(BTN.dpadLeft)) cycleTarget(-1);
      if (jp(BTN.dpadRight)) cycleTarget(1);
      handleWaypointButton(!!buttons[BTN.cross]?.pressed, crossStart, crossCleared);
    } else {
      crossStart.current = null; // don't carry a half-held ✕ across a pause
    }

    if (paused) {
      // free camera: right stick looks, left stick dollies/trucks (reuses the same paths
      // touch uses — see FreeCamController). Stick Y is +down, so negate for forward/up.
      if (feeding.current) {
        clearGamepadInput();
        feeding.current = false;
      }
      if (rx !== 0 || ry !== 0) pushTouchLook(rx * GP_LOOK_RATE * delta, ry * GP_LOOK_RATE * delta);
      if (lx !== 0 || ly !== 0) pushTouchPan(-ly * GP_PAN_RATE * delta, lx * GP_PAN_RATE * delta);
    } else if (driving) {
      // feed the four flight channels. Stick Y +down → negate so up = +throttle / nose up.
      setGamepadInput({ throttle: -ly, yaw: lx, pitch: -ry, roll: rx, precision });
      feeding.current = true;
    } else if (feeding.current) {
      clearGamepadInput(); // idle/handed back to keyboard → stop contributing
      feeding.current = false;
    }

    // save this frame's pressed state for edge detection
    prev.length = buttons.length;
    for (let i = 0; i < buttons.length; i++) prev[i] = !!buttons[i].pressed;
  });

  return null;
}

// L1/R1 → previous/next roster location (wraps), relative to the current spawn.
function teleportRelative(dir: 1 | -1): void {
  const n = LOCATIONS.length;
  const i = useGeoStore.getState().activeIndex;
  teleportTo((((i + dir) % n) + n) % n);
}

// ✕: tap = drop a waypoint at the drone's current ground position; hold ≥500 ms = clear.
function handleWaypointButton(
  pressed: boolean,
  start: React.MutableRefObject<number | null>,
  cleared: React.MutableRefObject<boolean>,
): void {
  const now = performance.now();
  if (pressed) {
    if (start.current === null) {
      start.current = now;
      cleared.current = false;
    } else if (!cleared.current && now - start.current >= WAYPOINT_HOLD_MS) {
      useGeoStore.getState().clearWaypoint();
      cleared.current = true; // fired once; wait for release
    }
  } else if (start.current !== null) {
    if (!cleared.current) dropWaypointAtDrone(); // short tap
    start.current = null;
    cleared.current = false;
  }
}

function dropWaypointAtDrone(): void {
  if (!localToLatLon(drone.position, _ll)) return; // tileset not anchored → ignore
  useGeoStore.getState().setWaypoint({ lat: _ll.lat, lon: _ll.lon });
}
