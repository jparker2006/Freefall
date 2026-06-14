# Freefall — Milestone 2 Spec (Real Los Angeles)

> Build M2 on top of the completed M1 sandbox. M2 replaces the greybox world with
> streaming **photorealistic Los Angeles** and georeferences the drone so the
> M1-tuned flight model now flies over the real city. **The flight feel from M1 must
> survive untouched.**

---

## 0. Orientation

M1 gave us a tuned FPV drone flying in a local-meters greybox (1 unit = 1 m, gravity
−Y, ENU-ish local frame, keyboard+mouse, fisheye camera, retro OSD, leva tuning).

**M2 has one job: swap the greybox for real, streaming photorealistic LA,
georeferenced correctly, and keep the flight feel intact.**

The two genuinely hard parts:
1. **The coordinate bridge.** Google's tiles live in a giant Earth-centered frame
   (ECEF / EPSG:4978) where coordinates are millions of meters and "up" is radial.
   Our physics live in clean local meters with up = +Y. We anchor the scene at an LA
   origin so the drone flies in a sane local frame while the tiles sit correctly
   underneath — this also fixes the float-precision jitter at ECEF scale.
2. **Streaming.** Fast flight can outrun tile loading. We tune detail, fade, and
   unloading so flying doesn't dump you into ungenerated space or blow up memory.

**Decisions locked (from planning):**
- **Hero location:** Westwood / Beverly Hills (the Westside).
- **Collision:** none — **free flight / phase through everything.** (Deferred.)
- **Visual mood:** **clean daylight**, architected as a swappable mood config.
- **Fidelity:** **balanced** — good detail, smooth flight (live slider).
- **Spawn:** **airborne** — spawn mid-air already flying.

**Scope line:** M2 = "LA is in, georeferenced, and it flies, from one hero spot."
The **minimap, spawn-point menu, and finished HUD are M3.**

---

## 1. New dependencies

- **`3d-tiles-renderer`** (NASA-AMMOS) — tile streaming engine + r3f wrappers + plugins.
  - From `3d-tiles-renderer/r3f`: `TilesRenderer`, `TilesPlugin`, `TilesAttributionOverlay`.
  - From `3d-tiles-renderer/plugins`: `GoogleCloudAuthPlugin`, `TileCompressionPlugin`,
    `UnloadTilesPlugin`, `TilesFadePlugin` (+ `DebugTilesPlugin` in dev).
  - Ellipsoid helpers for anchoring.
- **DRACO + KTX2/Basis transcoders** — Google's tiles are compressed.

Everything else stays on the M1 stack (Vite + React + TS + r3f + drei + postprocessing
+ zustand + leva).

---

## 2. The LA tileset

- Mount a `TilesRenderer` for the Google root tileset, authenticated with
  **`GoogleCloudAuthPlugin`** (`apiToken` = referrer-restricted key, §8).
- Configure the **DRACO + Basis decoders**.
- Add **`TilesAttributionOverlay`** — **non-negotiable: Google's ToS requires the
  copyright attribution on screen.**
- The renderer's `.update()` must run each frame **after** the camera world matrix is
  current.
- Enable handling for the huge depth range (a few meters to the whole basin).

---

## 3. Anchoring at Westwood / Beverly Hills (the coordinate bridge)

Pin a chosen LA lat/lon to the world origin in a **Y-up East-North-Up frame** so
physics stays clean.

- **Anchor (approximate — tune live):** `≈ 34.063° N, −118.430° W`.
- **Result:** the drone flies in local meters near the origin (no ECEF jitter),
  gravity stays `(0, −9.81·mass, 0)`, and the world has **real cardinal directions**
  so the OSD compass becomes meaningful. Update the heading readout from the drone's
  forward vector projected onto the horizontal (north/east) plane.
- **Spawn:** airborne at the anchor, `≈ 350 m`, hovering, oriented toward a good view.
  `R` returns here. Spawn altitude + facing are tunable constants.

---

## 4. Streaming + performance ("balanced")

- **`TilesFadePlugin`** — fade tiles in instead of hard pop.
- **`UnloadTilesPlugin`** — release out-of-view tiles (bounded memory).
- **`TileCompressionPlugin`** — keep GPU memory down.
- **Detail = screen-space error target.** A **balanced** default `errorTarget`,
  exposed as a live leva slider in a "World" group, with a **draw-distance** control.
- **Camera far plane:** large enough for the skyline.
- Expect: at high speed you may briefly outrun the loader; fade + a sane error target
  soften it. Tunable, not a bug.

---

## 5. Free flight (no collision)

- **No collision detection.** Remove the M1 ground plane + clamp/crash. The drone
  phases through terrain and buildings.
- **Altitude readout:** altitude ≈ `drone.y` (height above the anchor). Good for M2.
- Everything else in the flight model is byte-for-byte the M1 model. Do not retune it.

---

## 6. Mood / atmosphere — clean daylight (swappable)

The tiles carry baked-in capture lighting — we build atmosphere around them, not
relight the mesh.

- **Clean daylight preset:** daytime sky + a directional sun roughly matching LA
  midday + light distance haze/fog so the far basin fades naturally.
- **Architect as a `MoodConfig`** object with `daylight` as the only active preset.
  **Do not build the selector UI in M2** — daylight only.

---

## 7. What carries over from M1 + what's added

**Untouched (must keep working):** flight model, keyboard+mouse controls + ramping,
fisheye FPV camera, retro OSD (now reading real altitude/speed/heading over LA), leva
tuning panel, Acro/Angle toggle, respawn.

**Added in M2:** the LA tileset + anchor + attribution; a "World" leva group
(`errorTarget` + draw distance); `MoodConfig` (daylight); a startup loading state;
**optional** sandbox ↔ LA toggle.

---

## 8. API key handling

- Store the key in an env var (`VITE_GOOGLE_MAPS_API_KEY`); **never commit it.**
- In Google Cloud, **restrict the key by HTTP referrer** and scope it to the **Map
  Tiles API**. Set a **daily quota cap**.

---

## 9. Startup / loading UX

Show a clean **loading overlay** (on-brand with the OSD) until the renderer reports
sufficient load progress, then reveal the scene.

---

## 10. Build order

1. Render LA at all (TilesRenderer + auth + DRACO/Basis + attribution).
2. Anchor at Westwood/BH → anchor at origin, +Y up.
3. Drop in the M1 drone + camera, spawn airborne; confirm feel intact.
4. Remove greybox/ground; set far plane; confirm skyline renders without z-fighting.
5. Streaming polish — fade + unload + compression; tune `errorTarget`; add World sliders.
6. Mood — daylight sky + sun + haze as a `MoodConfig`.
7. Loading state + attribution placement.
8. (Optional) sandbox ↔ LA toggle.

After step 3, verify the M1 feel didn't regress.

---

## 11. Definition of done (M2)

- [x] The M1-tuned drone flies over photorealistic Westwood / Beverly Hills, airborne.
- [x] Georeferenced via a Y-up ENU anchor — gravity correct, no jitter, true-north compass.
- [x] Google tiles stream at balanced detail with fade-in, memory unloading, attribution.
- [x] Clean daylight sky + light haze; mood is a swappable `MoodConfig` (no selector).
- [x] Free flight — no collision.
- [x] All M1 systems intact; World leva group added; sandbox↔LA toggle present.
- [x] Loading state until initial tiles are in.
- [x] Key is an env var, referrer-restricted, not committed; daily quota cap (user step).

---

## 12. Non-goals (M2 scope guard)

- ❌ No minimap (M3). ❌ No spawn-point menu (M3). ❌ No collision (deferred).
- ❌ No mood-switcher UI — daylight only. ❌ No retuning the M1 flight model.
- ❌ No mobile-specific optimization, no recording/replay.

---

## Implementation notes (as built)

- **Coordinate bridge** = `3d-tiles-renderer`'s **`ReorientationPlugin`** (`{ lat, lon,
  height, recenter: true }`), the library's blessed path — it recenters the tileset to
  the origin on `load-root-tileset`. Its frame is **X = West, Y = Up, Z = North**, so:
  **+Y up, +Z geographic north, −X east**. The M1 heading formula became
  `atan2(-fwd.x, fwd.z)` (true north) — a deliberate one-line deviation from the spec's
  literal "+X north" so gravity/forward stay exactly as M1. `anchorHeight ≈ 55 m`
  (ellipsoidal) so the altimeter reads ≈ AGL near spawn.
- **Decoders** = **`GLTFExtensionsPlugin`** with DRACO + KTX2 loaders; transcoders are
  vendored into `public/draco` + `public/basis` (no CDN dependency). KTX2 support is
  detected against the WebGL renderer, so decoder setup lives inside the Canvas.
- **No `logarithmicDepthBuffer`** — three's `Sky` shader has no log-depth support and
  would render wrong. Instead: camera `near = 1` (always airborne) + far = draw
  distance, with fog hiding the far skyline. Tune fog far / draw distance / errorTarget
  as a coherent trio.
- **Graceful fallback:** no/empty `VITE_GOOGLE_MAPS_API_KEY` → greybox sandbox + notice;
  a Google auth/quota failure (bad key) → sandbox + an error notice (never a blank sky).
- World/mood/streaming state lives in `useWorldStore` (separate from the flight-tuning
  store, so the tuning export stays flight-only).
