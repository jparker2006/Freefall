# Freefall

A browser-based, hyper-realistic **FPV drone simulator**. The end goal is a
first-person quad flown over photorealistic real-world Los Angeles with a live
minimap.

- **Milestone 1 — flight feel (done):** a tunable, cinematic-freestyle flight model
  in an instrumented greybox sandbox. See [`freefall-m1-spec.md`](./freefall-m1-spec.md).
- **Milestone 2 — real Los Angeles (done):** the M1 drone now flies over streaming
  Google Photorealistic 3D Tiles, georeferenced over Westwood / Beverly Hills. Free
  flight then (ground collision was added later — see below). Add an API key to see it ([below](#los-angeles-milestone-2));
  without one it falls back to the greybox sandbox so the app always runs. See
  [`freefall-m2-spec.md`](./freefall-m2-spec.md).
- **Milestone 3 — orientation (done):** a north-up street **minimap**, live
  **neighborhood** + **distance/bearing** readouts, and one-tap **teleport** to 9
  named LA locations (pins or number keys). See [`freefall-m3-spec.md`](./freefall-m3-spec.md).
- **Add-on — waypoint guidance + pause/free-look (done):** drop a yellow waypoint on
  the map for a 3D guide line + beacon + minimap route; **Space** to freeze and free-fly
  the camera for cinematic framing. See [`freefall-addon-spec.md`](./freefall-addon-spec.md).
- **Mobile / touch (done):** fully playable on phones — **dual virtual sticks** (FPV
  Mode 2, Angle default), a **landscape gate**, a reflowed minimal HUD, and a touch
  **settings sheet** — as one responsive codebase (the desktop keyboard+mouse experience
  is unchanged). See [`freefall-mobile-spec.md`](./freefall-mobile-spec.md).
- **Ground collision (done):** the drone now rests when it descends onto whatever's
  directly below it — a single **downward raycast** against the 3D tiles each frame finds
  the surface, and the drone stops on it. You still fly **freely through the city** (the
  photoreal mesh fuses ground + buildings into one surface, so downward-only IS "ground,
  not buildings" — building *sides* never block you; landing on a rooftop is expected).
  Throttle back up to lift off. The greybox sandbox clamps to its floor plane, and if no
  tiles have streamed in below yet the drone keeps flying (never trapped).
- **Gamepad / controller (done):** PS4 / PS5 / Xbox / any standard controller as one more
  auto-detected input source — dual analog sticks (FPV Mode 2), mapped buttons, and rumble
  on landing. Keyboard/mouse + touch stay live (last-active wins). See
  [Gamepad / controller](#gamepad--controller).

## Stack

Standalone, fully client-side WebGL SPA — **Vite + React + TypeScript**,
[@react-three/fiber](https://r3f.docs.pmnd.rs/) + drei + postprocessing,
[zustand](https://github.com/pmndrs/zustand) for state, [leva](https://github.com/pmndrs/leva)
for live tuning. No server, no SSR.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

## Los Angeles (Milestone 2)

Freefall streams **Google Photorealistic 3D Tiles** over Westwood / Beverly Hills.
This needs a Google Maps Platform API key — without one, it flies the greybox
sandbox instead (you'll see a notice), so the app always runs.

1. In the [Google Cloud Console](https://console.cloud.google.com/), on a
   billing-enabled project, **enable the "Map Tiles API"**.
2. Create an API key (APIs & Services → Credentials).
3. **Restrict it** (this is how a client-side key is secured — no server needed):
   - *Application restrictions* → **HTTP referrers**: `http://localhost:5173/*`
     (match your actual dev port) and your eventual `https://<app>.vercel.app/*`.
   - *API restrictions* → **Map Tiles API** only, and set a **daily quota cap**.
4. Copy `.env.example` to `.env.local` and paste the key:
   `VITE_GOOGLE_MAPS_API_KEY=your_key_here` (`.env.local` is gitignored).
5. Restart `npm run dev` (Vite reads env only at startup). You spawn airborne over
   Westwood; tiles stream in behind a brief loading screen.

The **World** folder in the tuning panel sets streaming **detail** (lower
errorTarget = sharper/heavier), **draw distance**, and toggles **LA ↔ sandbox**.
The tileset is anchored to the local origin with **+Y up, +Z north, −X east**, so
gravity is correct and the OSD compass reads true north.

## Orientation (Milestone 3)

A north-up **minimap** sits in the bottom-right corner: a dark street map with a
drone arrow that rotates to your heading, a roster of location pins, and an "N"
indicator. Press **M** to expand it to a full-screen overview and tap any pin;
**M** / **Esc** collapses it back.

The OSD also shows your **live neighborhood** (top-left, e.g. `▸ WESTWOOD` → `▸ BEVERLY HILLS`)
and the **distance + bearing** to a landmark (`→ THE GETTY · 2.4mi · 312°`). Cycle
the target with **G**.

**Teleport** to any of nine spots — Santa Monica Pier, Downtown LA, Westwood,
Beverly Hills, Griffith/Hollywood, Venice Beach, SoFi Stadium, The Getty, Dodger
Stadium — with **number keys 1–9** or by tapping a pin. Selecting one instantly
re-anchors the world and respawns you airborne over that spot (the loading screen
covers the new area streaming in).

The minimap uses a **keyless** OpenFreeMap vector basemap — no extra API key. To
swap it (e.g. a MapTiler style), set `VITE_MAP_STYLE_URL` in `.env.local`.
Neighborhood names come from a vendored local GeoJSON (`public/la-neighborhoods.geojson`),
so there's no geocoding API. The tuning panel now starts **hidden** (toggle with `` ` ``).

## Waypoint + pause (add-on)

**Waypoint:** expand the minimap (**M**) and click an empty spot to drop a **yellow
waypoint**. It becomes the nav target (`→ WAYPOINT · 1.7mi · 133°`), with a yellow
route line + marker on the minimap, a **3D guide line** that fades into the haze, a
**vertical beacon** at the mark, and a screen-edge **chevron** when it's off-screen.
Right-click the map or press **C** to clear it (teleporting or **G** clears it too).

**Pause / free-look:** press **Space** to freeze the drone in place and detach a
**free-fly camera** — mouse to look, WASD to move, Shift for speed (no collision).
The HUD drops to a `PAUSED` badge for clean capture while tiles keep streaming.
**Space** again returns to the drone's view and resumes flight with momentum intact.

## Mobile / touch

On a touchscreen Freefall switches to a touch scheme automatically (detected via a coarse
pointer) — the desktop keyboard+mouse build is byte-for-byte unchanged. It's **landscape
only**: portrait shows a rotate prompt (and locks to landscape where the browser allows;
iOS can't lock, so just turn the device). Append `?touch=1` / `?desktop=1` to force either
UI for testing.

- **Dual virtual sticks (FPV "Mode 2"):** left = vertical **throttle** (ratchets up from
  hover and holds where you lift) + horizontal **yaw**; right = **pitch / roll** (both
  self-center). Both float to where your thumb lands, and both thumbs work at once. Mobile
  defaults to **Angle** (self-leveling); switch to Acro with the mode button.
- **Button cluster** (top): pause, mode, respawn, nav target, HUD, and a **⚙ settings
  sheet** (the leva replacement) — flight mode, tile detail, draw distance, units.
- **Minimap** collapses to a tap-to-open pill (top-right) and expands near-full-screen
  with a ✕ to close.
- **Pause** freezes the drone for a free camera: **one finger** looks, **two fingers**
  dolly/truck. The HUD drops to a `PAUSED` badge for clean capture.
- **Performance:** crisp-first — detail stays near desktop; the pixel ratio is capped (the
  biggest mobile win) and tile memory is tightened, trading some fps for sharpness.

## Gamepad / controller

Plug in or pair a **PS4 / PS5 / Xbox / any standard controller** and press a button — the
HUD confirms with a 🎮 chip, and you fly with the two analog sticks (FPV **Mode 2**). It's
just another input source on the same pipeline: keyboard/mouse and touch stay live, and the
last one you touch wins. No drivers, no setup (uses the browser Gamepad API).

- **Sticks (Mode 2):** left = **throttle** (sticky/rate — push to change, holds when you
  let go; the analog version of W/S) + **yaw**; right = **pitch / roll**. A radial deadzone
  keeps resting drift out. Controller flying defaults to **Acro**.
- **Throttle feel:** a `ctrl throttle` toggle in the tuning panel's **Input** folder swaps
  between `sticky` (default) and `hover` (center-stick = hover, self-centering).
- **Buttons:** Options = pause/free-look · △ = mode · ○ = respawn · ✕ = drop waypoint (hold
  to clear) · □ = map · Share = HUD · L1/R1 = prev/next location · D-pad ◀▶ = cycle nav
  target · L2 = precision.
- **Paused:** the sticks fly the free camera (right = look, left = dolly/truck); Options
  resumes.
- **Haptics:** a subtle rumble on touchdown, scaled to how hard you land (Chrome/Edge;
  Safari/Firefox fly fine but may not rumble).

## Controls

| Input | Action |
|---|---|
| **Click canvas** | Lock mouse to fly (Esc releases) |
| **W / S** | Throttle up / down (persistent setpoint) |
| **A / D** | Yaw left / right |
| **Mouse** | Pitch (Y) / roll (X) — primary |
| **↑ ↓ ← →** | Pitch / roll — all-keyboard fallback |
| **Tab** / **T** | Toggle Acro ↔ Angle mode |
| **R** | Respawn / reset to hover (at the current location) |
| **Shift** (hold) | Precision mode (finer rates) |
| **M** | Expand / collapse the minimap (expanded = click pins) |
| **1 – 9** | Teleport to a named LA location |
| **G** | Cycle the nav target (auto-nearest → each location) |
| **Space** | Pause / free-look (freeze + free-fly camera; Space again resumes) |
| **(paused) Mouse / WASD** | Look around / move the free camera (**Shift** = faster) |
| **Click expanded map** | Place / move the yellow waypoint |
| **Right-click map** / **C** | Clear the waypoint |
| **H** | Toggle HUD · **`** Toggle tuning panel · **U** Toggle units |
| **Touch** | Auto-detected: dual virtual sticks + on-screen buttons — see [Mobile / touch](#mobile--touch) |
| **Gamepad** | Auto-detected: dual sticks (Mode 2) + mapped buttons + rumble — see [Gamepad / controller](#gamepad--controller) |

## Flight model

Fixed-timestep physics (1/120 s substeps, decoupled from render) in `src/drone/`.
Two modes: **Acro** (pure rate, holds attitude — the real FPV feel) and **Angle**
(self-leveling). World scale is 1 unit = 1 meter with real gravity. Thrust is
parametrized as thrust-to-weight ratio so the hover point is mass-independent.

## Tuning

The whole point of M1 is dialing the feel by flying. Open the leva panel (top-right,
toggle with `` ` ``) to adjust mass, TWR, max rates, rotational lag (`tauRot`), drag,
input ramping, FOV/uptilt, and the lens look — all live. Try the **Freestyle** and
**Cinematic** presets to feel the two extremes, then find your middle. Hit
**Export config** to dump the dialed-in JSON (console + clipboard + download) to
paste back into `src/constants.ts` `DEFAULTS`.

## Project structure

```
src/
  scene/     Scene (canvas, rig, driver) + Sandbox · FreeCamController (pause free-cam)
  drone/     droneState (store) · flightModes (acro/angle) · useFlightModel (the loop) · groundCollision (downward-only ground rest)
  input/     useInput (ramped axes, pointer lock, touch/gamepad seams) · controlConfig (keymap) ·
             gamepad (Gamepad-API helpers) · GamepadController (per-frame poll) · gamepadStore
  camera/    FpvCamera (parented, uptilt, wide FOV)
  hud/        Osd (retro green OSD) · osd-mobile.css (touch reflow) · StickIndicator · Minimap (MapLibre, lazy)
  ui/        device (touch + orientation detect) · VirtualSticks · TouchLookLayer · TouchButtons · TouchSettings · RotateGate · touch.css
  postfx/    Effects (fisheye + vignette + chroma + speed blur, one pass)
  world/     useWorldStore · World (LA⇄sandbox) · LaTiles (Google 3D Tiles) ·
             WorldEnvironment (mood) · moods · anchor (coordinate bridge) · LoadingOverlay ·
             geo (local↔lat/lon + PIP) · GeoPublisher · useGeoStore · locations (roster + teleport) ·
             WaypointGuide (3D guide line + beacon + chevron)
  tuning/    tuningStore · TuningPanel (leva) · levaBridge
  lib/       mathUtils  ·  constants.ts (world + DEFAULTS)
public/      draco/ + basis/ (tile decoders) · la-neighborhoods.geojson (place names)
```
