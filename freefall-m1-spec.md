# Freefall — Milestone 1 Spec (Flight Feel)

> A prompt/brief for Claude Code. Build M1 as specified below. Everything here is scoped to **flight feel in an instrumented dev sandbox** — there is **no Los Angeles, no map data, no minimap** in M1. Those are later milestones. Do not pull them forward.

---

## 0. Orientation

**Freefall** is a browser-based, hyper-realistic FPV drone simulator. The end state (later milestones) is a first-person quad you fly over photorealistic real-world Los Angeles with a live minimap. This is the capstone of a series of Three.js sims (Neon City, Space Coaster, Surf), so it lives in the same React/Three ecosystem.

**Milestone 1 has exactly one job: make the drone *feel* like flying a real FPV quad.** Specifically, a **"cinematic freestyle"** feel — snappy and responsive enough to whip around, but with real weight so it leans and glides instead of twitching. Nothing else in M1 matters if the flight feel isn't right.

Because "the right blend" is subjective and lives between two extremes, **M1 must ship with live on-screen tuning sliders.** The deliverable is not a single magic set of numbers — it's a tunable flight model the pilot can dial by feel in minutes of flying, plus the ability to export the dialed-in values as the new defaults.

**Prime directive:** a cube that flies *correctly and feels good on keyboard+mouse* beats a beautiful scene that flies wrong. Build the physics first.

---

## 1. Tech stack

Freefall M1 is a **standalone, fully client-side WebGL single-page app** — no Next.js, no SSR, no routing, and no server. Everything runs in the browser.

- **Vite + React + TypeScript** — the committed stack for the tight physics-tuning loop.
- **@react-three/fiber** (r3f) for the scene + render loop.
- **@react-three/drei** for helpers (Grid, Sky, PerspectiveCamera, Stats).
- **@react-three/postprocessing** for the fisheye / vignette / chromatic-aberration camera pipeline.
- **zustand** for shared flight + input state (so HUD and physics read the same source without prop-drilling).
- **leva** for the on-screen tuning panel (purpose-built for exactly this; minimal setup).
- **three** (peer dep).

**Why standalone client-side (no Next/SSR):**
- M1 is pure client-side feel-tuning — there is nothing for a server to do.
- The tuning loop runs through leva at runtime (live state), so SSR/HMR differences are irrelevant to the core work.
- M2's Google Photorealistic 3D Tiles also run client-side: the `3d-tiles-renderer` `GoogleCloudAuthPlugin` takes the API token in the browser, secured by an HTTP-referrer restriction on the key in Google Cloud — no server proxy needed.
- Deploy stays on Vercel (it ships a Vite static build fine; serverless functions remain available alongside it later if ever wanted).

---

## 2. Project structure

```
freefall/
  src/
    main.tsx
    App.tsx                  // canvas host + HUD/tuning overlays
    scene/
      Scene.tsx              // <Canvas>, world, drone rig, camera, fixed-step driver
      Sandbox.tsx            // greybox world: grid, pillars, gates, dive tower, lights, sky
    drone/
      droneState.ts          // zustand store: pos, vel, quaternion, rates, throttle, mode
      useFlightModel.ts      // THE flight model — fixed-timestep physics
      flightModes.ts         // acro (rate) + angle (self-level) setpoint logic
    input/
      useInput.ts            // raw key/mouse -> ramped virtual axes (4 channels)
      controlConfig.ts       // keymap, sensitivities, invert flags
    camera/
      FpvCamera.tsx          // camera parented to drone, uptilt
    hud/
      Osd.tsx                // retro green FPV OSD (HTML/CSS overlay)
      StickIndicator.tsx     // virtual gimbal visualizers (great for keyboard)
    postfx/
      Effects.tsx            // fisheye/barrel, vignette, chromatic aberration, (mild) motion blur
    tuning/
      tuningStore.ts         // all tunable params + presets + export
      TuningPanel.tsx        // leva bindings
    lib/
      mathUtils.ts           // quaternion-from-rates, expo, ramp, damp helpers
    constants.ts             // world scale, gravity, defaults
```

---

## 3. The flight model (the core)

**World scale:** `1 three.js unit = 1 meter`. Gravity `g = 9.81 m/s²`. All speeds/heights are real-world meaningful.

**Body-frame convention (state it explicitly in code):**
- Drone local axes: **forward = −Z, up = +Y, right = +X** (matches the three.js camera, since the FPV camera *is* the drone's view).
- **Pitch** = rotation about local **X**, **Roll** = about local **Z**, **Yaw** = about local **Y**.
- **Thrust** acts along the body **up** vector: `thrustDir = quaternion · (0, 1, 0)`.

**State (in the zustand store):**
- `position: Vector3` (world)
- `velocity: Vector3` (world)
- `orientation: Quaternion`
- `bodyRates: Vector3` (current actual angular velocity, rad/s, body frame)
- `throttle: number` (0..1, a held setpoint — see controls)

**Fixed-timestep loop** (critical for stable, consistent feel): in `useFrame`, accumulate elapsed time and step the physics in fixed substeps of `dt = 1/120 s` (drain the accumulator each frame; cap max substeps to avoid spiral-of-death). Do **not** integrate physics on the raw variable frame delta.

**Per substep:**

1. **Read virtual axes** from the input layer (already ramped/smoothed, see §5): `throttleSetpoint ∈ [0,1]`, `yawIn, pitchIn, rollIn ∈ [−1,1]`.
2. **Apply expo** to the rate inputs (softer near center for fine control): `expo(x, e) = (1−e)·x + e·x³`.
3. **Map to commanded body rates** via per-axis max rates (tunable): `cmdRate = expo(in) · maxRate_axis` (deg/s → rad/s).
4. **Flight mode** (see §4):
   - **Acro:** commanded rates pass straight through.
   - **Angle:** an outer P-controller overrides roll/pitch commanded rates to drive the drone toward a target bank/pitch angle proportional to stick deflection (self-leveling). Yaw and throttle behave the same as acro.
5. **Rotational inertia / smoothing** (the *weight* knob): ease actual `bodyRates` toward `cmdRate` with a first-order lag of time constant `tauRot`:
   `bodyRates += (cmdRate − bodyRates) · (1 − exp(−dt / tauRot))`.
   Small `tauRot` = instant/snappy (freestyle). Larger `tauRot` = weighty/smooth (cinematic). This is one of the main blend levers.
6. **Integrate orientation:** build a delta quaternion from `bodyRates · dt` (axis = normalized rates, angle = `|rates|·dt`), apply in body frame: `orientation = orientation · dq`, then normalize.
7. **Thrust:** parametrize power as **thrust-to-weight ratio (TWR)** so hover point is mass-independent. `maxThrust = TWR · mass · g`. `thrustMag = throttle · maxThrust`. Optionally low-pass `thrustMag` with `tauThrottle` (mild motor-response lag — adds weight). `thrustVec = (orientation · (0,1,0)) · thrustMag`.
8. **Forces:**
   - Gravity: `(0, −g·mass, 0)`.
   - Drag (quadratic dominant + small linear settle term): `dragForce = −velocity · (cQuad·|velocity| + cLinear)`. Lower drag = more glide/float (cinematic); higher = tighter stops (freestyle). Blend lever.
   - Sum: `F = thrustVec + gravity + dragForce`.
9. **Integrate:** `velocity += (F / mass) · dt`; `position += velocity · dt`.
10. **Ground + collision** (see §7 / §8): clamp `position.y` to ground; trigger crash behavior on hard impact.

After the substeps, write the final transform to the drone rig (the camera follows it, §6).

---

## 4. Flight modes

- **Acro (default)** — pure rate mode, no self-leveling. The drone holds whatever attitude you leave it in. This is the soul of the feel and what makes it read as real FPV.
- **Angle (toggle)** — a thin layer on the same physics: an outer proportional (optionally PD) controller maps stick deflection to a target bank/pitch angle and computes the rates to get there, so releasing the sticks levels the drone. Doubles as a forgiving cruise mode for later cinematic flying.
- Toggle live with **Tab** (or **T**). Show the active mode in the OSD.

---

## 5. Controls — keyboard + mouse

The pilot has **no gamepad**. The whole trick is making digital keys feel analog. Two gimbals, mapped to two hands:

**Left stick → left hand (WASD):**
- **W / S** → **throttle up / down**, as a **persistent setpoint** (0–100%). Tapping nudges it; it **holds** when released (like a real throttle gimbal). Not momentary.
- **A / D** → **yaw** left / right (rate).

**Right stick → mouse (primary):**
- **Mouse X** → **roll** rate. **Mouse Y** → **pitch** rate. Pointer-lock on canvas click; **Esc** releases.
- This is rate-based: mouse motion deflects the stick, stopping holds the attitude — correct acro behavior and FPS-native muscle memory.
- `invertPitch` flag (tunable). **Default non-inverted** (mouse up = nose up, FPS-style). `mouseSensitivity` tunable.

**Right stick → arrow keys (all-keyboard fallback):**
- **↑ / ↓** → pitch, **← / →** → roll.

**The critical feel layer — input ramping:** every binary key drives a *virtual analog axis*. On press, the axis eases toward its target (±1) over `inputRampTime` (~100–120ms default); on release, rate axes decay back to 0 (so the drone holds attitude in acro), while **throttle persists** at its current value. Without this, keyboard FPV is unflyable. `inputRampTime` is a live slider.

**Utility keys:**
- **Tab / T** — toggle Acro / Angle
- **R** — respawn / reset (see §8)
- **Shift (hold)** — precision mode: temporarily scale rates + mouse sensitivity down for fine moves
- **H** — toggle HUD
- **` (backtick)** — toggle tuning panel
- **Esc** — release pointer lock

Render the two **virtual gimbal positions** in the OSD corners (§7) — essential feedback when flying on keyboard, since there are no physical sticks to look at.

---

## 6. Camera — full fisheye FPV

- Camera **parented to the drone transform**, at the drone origin (drone mesh is invisible — true FPV, no third-person by default; a debug chase cam is optional and off by default).
- **Fixed upward tilt** (`cameraUptilt`, default **30°**) relative to the body: level flight shows an upward-angled view, and pitching forward to accelerate brings the horizon level — authentic FPV behavior. Tunable.
- **Wide FOV** (`fov`, default **120°**, tunable to ~150).
- **Postprocessing pipeline** (`postfx/Effects.tsx`):
  - **Barrel / fisheye distortion** (the signature GoPro-cam warp) — custom shader pass or distortion effect.
  - **Vignette** (analog-cam dark corners).
  - **Subtle chromatic aberration** at the edges (lens feel).
  - **Mild motion blur** on fast translation — *optional, low default* (adds speed sensation; don't let it hurt readability). Tunable, can default off.
- Net target: looks like real FPV DVR footage.

---

## 7. HUD — retro FPV OSD

An HTML/CSS overlay absolutely-positioned over the canvas (crisper text than in-3D), driven by the drone store. Aesthetic: **Betaflight-style green monospace OSD** — semi-transparent green pixel/mono font, the analog-goggle look.

**Elements:**
- Center **crosshair** reticle.
- **Artificial horizon** line that rolls + pitches with the drone (the key acro reference).
- **Altitude** (default ft, metric toggle).
- **Speed** — ground speed (default mph, metric toggle).
- **Throttle %** bar + readout.
- **Heading** (compass degrees).
- **Flight timer** (mm:ss).
- **Flight mode** indicator (ACRO / ANGLE).
- **Two virtual stick indicators** (bottom corners) showing current gimbal deflection — see §5.
- **Scanlines + very subtle flicker/static** overlay for the analog-video feel (CSS).

US units by default (ft / mph) given the eventual LA setting; metric toggle available.

---

## 8. The sandbox world (instrumented greybox)

Keep the **clean gray dev aesthetic** — this is a blockout, not a real environment. But it must be **instrumented** so the pilot can actually *feel* speed, altitude, and rotation (a pure empty void gives no parallax or scale and makes feel-tuning impossible).

- **Ground grid** — large, with major/minor lines (drei `<Grid>` or custom). The floor reference.
- **Sky** — simple gradient or drei `<Sky>`, readable, with a clear **horizon** (so the artificial horizon means something).
- **Reference pillars** — vertical columns of known height (~20m) on a regular spacing (~30–50m) across a region. These provide the parallax/scale to feel motion. Optional height ticks.
- **Gates / hoops** — a handful of frames (torus or square) at varying heights to thread; good for precision-feel testing. Subtle color accent so they read against the grey.
- **Dive tower** — one prominent tall structure (~150–200m) with a flat top to launch from and dive down. Directly exercises the **Freefall** identity and tests vertical speed / throttle / drag feel.
- **Lighting** — directional sun + hemisphere/ambient for clean readable shading. Soft shadows optional (watch perf).
- Materials: neutral grey blockout throughout.

**Crash / reset behavior:** on hard ground/obstacle impact, kill velocity and either bonk-and-settle or briefly tumble, then allow quick recovery; **R** respawns to a spawn point (or to a stable hover above origin). Ground collision is required; pillar/tower/gate collisions can be simple sphere-vs-AABB and are a nice-to-have for M1, not a blocker.

---

## 9. Tunable parameters + presets

All exposed in the leva panel, live (no reload), grouped. Defaults below target the **cinematic-freestyle** blend out of the box — they are **starting points**; the real values come from the pilot flying and dialing.

| Param | Default | What it does (blend effect) |
|---|---|---|
| `mass` (kg) | 0.7 | Inertia/weight. Higher = more cinematic. |
| `twr` (thrust:weight) | 2.2 | Power/punch. Higher = snappier climbs. |
| `maxRateRollPitch` (°/s) | 420 | Top rotation speed. Higher = more freestyle. |
| `maxRateYaw` (°/s) | 250 | Yaw authority. |
| `tauRot` (ms) | 90 | Rotational smoothing/weight. Low = snappy, high = glidey. |
| `rateExpo` (0–1) | 0.30 | Center softness for fine control. |
| `cQuad` (drag) | tune | Quadratic drag → glide vs tight stops. Start so terminal feels like a fast quad (~25–35 m/s); dial live. |
| `cLinear` (drag) | small | Low-speed settle. |
| `tauThrottle` (ms) | 60 | Motor response lag (adds weight). |
| `inputRampTime` (ms) | 120 | Key→full-deflection ease. The keyboard-feel knob. |
| `mouseSensitivity` | tune | Mouse→rate gain. |
| `invertPitch` | false | Mouse Y direction. |
| `fov` (°) | 120 | Camera field of view. |
| `cameraUptilt` (°) | 30 | FPV cam upward mount angle. |
| `barrel`, `vignette`, `chroma`, `motionBlur` | moderate / low | Lens look. |

**Presets** (buttons): **Cinematic Freestyle** (default middle), **Freestyle** (light mass, low `tauRot`, higher rates, lower drag), **Cinematic** (heavier, higher `tauRot`, more drag/glide). Flying the two extremes makes finding the personal middle fast.

> **Implementation note (drag direction):** §3 defines the physical lever as *lower drag = more glide/float (cinematic), higher drag = tighter stops (freestyle)*. The Cinematic/Freestyle presets follow that physical definition — **Cinematic = lower `cQuad` (float), Freestyle = higher `cQuad` (tight stops)** — which is the authoritative reading. All values are live-tunable starting points regardless.

**Config export:** a button (or console dump) that serializes the current tuning to JSON, so once the blend is dialed it can be pasted back as the new defaults in `constants.ts`. This closes the loop on the whole milestone.

---

## 10. Suggested build order

1. Scaffold (Vite + r3f + TS + zustand + leva), empty `<Canvas>`, grid + sky + a temporary **visible cube** as the drone.
2. Fixed-timestep driver + flight model (§3) in **Acro** only — get the cube flying with gravity, thrust, drag, rate control.
3. Input layer (§5) with ramping — WASD throttle/yaw + mouse pitch/roll + arrow fallback. Tune `inputRampTime` until keyboard feels analog.
4. FPV camera rig (§6) — parent to drone, uptilt, wide FOV. Hide the cube (go true first-person).
5. Sandbox instrumentation (§8) — pillars, gates, dive tower, lighting.
6. Retro OSD (§7) + stick indicators.
7. Postfx (§6) — fisheye, vignette, chroma.
8. Angle mode (§4) + mode toggle.
9. leva tuning panel + presets + config export (§9).
10. Crash/reset polish (§8).

Commit per subsystem. Keep the physics loop isolated and testable.

---

## 11. Definition of done (M1)

- [ ] Drone flies in **Acro** on **keyboard + mouse** with a controllable **cinematic-freestyle** feel — weight + glide, not twitchy.
- [ ] WASD throttle (held) / yaw, mouse pitch/roll (+ arrow fallback), all with ramped analog-feeling input.
- [ ] **Angle** mode toggle self-levels.
- [ ] **Full-fisheye** FPV camera: uptilt, wide FOV, vignette, barrel distortion — reads as real FPV.
- [ ] **Retro green OSD**: crosshair, artificial horizon, altitude, speed, throttle, heading, timer, mode, dual stick indicators, scanlines.
- [ ] **Instrumented greybox sandbox** (grid, pillars, gates, dive tower) gives clear speed/altitude reference.
- [ ] **Live leva tuning panel** adjusts feel in real time; **Freestyle/Cinematic presets**; **config export**.
- [ ] **Fixed-timestep** physics, decoupled from render; smooth ~60fps.

---

## 12. Explicit non-goals (M1 scope guard)

- ❌ No Google Photorealistic 3D Tiles / Los Angeles / any real-world geo data (**M2**).
- ❌ No minimap (**M3**).
- ❌ No spawn-point/location menu, no named LA spots (**M3**).
- ❌ No multiplayer, no flight recording/replay, no mobile-specific work.
- ❌ No advanced aerodynamics beyond the tunable rotation/throttle lag — keep the model clean and tunable, not a full blade-element sim.

Stay in the sandbox. M1 is feel, and only feel.
