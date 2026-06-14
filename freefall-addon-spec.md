# Freefall — Add-on Spec: Waypoint Guidance + Pause / Free-Look

> Two additive features on the completed M1–M3 build (tuned FPV drone, photoreal LA,
> minimap + locations + HUD). **All additive — M1 flight, M2 world, M3 orientation
> stay untouched.**

---

## Features (locked decisions)

1. **Waypoint guidance** — click the (M-expanded) minimap to drop a single **yellow
   waypoint**; it becomes the active nav target. Guidance = **both** a 3D world guide
   line (fades into fog) **and** a minimap route line, plus a vertical **beacon** at
   the mark and an off-screen **HUD chevron**. Right-click / `C` clears it (teleport
   or `G` clears it too).
2. **Pause / free-look** — **Space** freezes the drone in place (physics paused,
   position + orientation held, velocity stored) and detaches a **free-fly camera**
   (mouse look + WASD move + Shift faster, no collision). Space again returns to the
   drone's forward view and resumes flight with momentum preserved. During pause,
   **hide everything** (OSD → small `PAUSED` badge; minimap + 3D guide hidden) for a
   clean capture — tiles keep streaming.

Non-goals: no multi-leg routes, no persistence, no collision, no flight/world/M3
retuning, no mobile.

---

## Implementation notes (as built)

- **Pause camera = single-camera reparent (not a two-camera swap).** `FpvCamera` stays
  the only `makeDefault` camera. On the pause edge (`FreeCamController`, `useLayoutEffect`
  so it lands before the next frame): `scene.attach(cam)` detaches it from the frozen
  drone group (preserving world pose); a gated `useFrame` then free-flies it (yaw/pitch
  scalars → `Euler('YXZ')`, clamp pitch, zero roll; WASD along forward/right, Shift ×4).
  On resume: `droneRef.current.attach(cam)` + restore the FPV local pose (`position 0`,
  `rotation(uptilt)`, `updateMatrixWorld`) — `FpvCamera`'s uptilt layout effect won't
  re-fire. **Why not a `makeDefault` swap:** that rebuilds the postprocessing
  `EffectComposer` twice per pause cycle and risks a drei two-camera race. Reparenting
  keeps the same camera object, so tiles `setCamera` + the composer never re-run; the
  renderer's own per-frame `camera.updateMatrixWorld()` keeps tiles culling against the
  moving free cam. Verified: free cam moved 120 m in 2 s while the drone stayed frozen;
  on resume the cam snapped back to the drone (0 m) with velocity preserved.
- **Physics freeze**: `FlightModel`'s useFrame early-returns at the very top when
  `useDroneStore.paused` — *before* `accumulator += delta`, so there's no backlog and
  `drone.velocity` is untouched → momentum resumes verbatim. `frameloop="always"` stays
  (tiles keep streaming).
- **Input routing**: `useInput` exports `isDown(code)` + `consumeLook()`; `FlightModel`
  skips `advanceInput` while paused, so the free cam is the only mouse/keys consumer
  (no double-drain). Mouse delta is zeroed on the Space toggle edge. Pointer lock is
  requested **inside the Space `onKeyDown`** (a user gesture). Pausing collapses an
  expanded map first so the cursor/lock go to free-look.
- **Waypoint nav override** in the `GeoPublisher` tick (the sole nav writer), *before*
  the `targetSel` logic: a set waypoint → `latLonToLocal` (height = current location's
  `groundHeightM`) → `bearingDistanceMi` → `targetName:"WAYPOINT"`. The M3 OSD nav row
  renders it unchanged.
- **3D guide line** = drei `<Line>` (yellow) with `material.fog = true; needsUpdate = true`
  (drei never sets fog) so it fades into the M2 fog; updated each frame via
  `geometry.setPositions(reusedFloat32Array(6))` (drone→waypoint) — **not** the `points`
  prop (that reallocs the geometry). **Beacon** = a thin tall cylinder, `MeshBasicMaterial`
  (fog default true), `depthWrite:false`. Both render only when `waypoint && LA && !paused`.
- **HUD chevron** (`WaypointGuide`, throttled ~20 Hz → `useGeoStore.chevron`, OSD renders
  the div): projects the waypoint into **view space** (`matrixWorldInverse`); if `z ≥ 0`
  it's behind the camera → treat as off-screen and take the edge direction from view
  x/y (sidesteps the `project()` behind-camera sign flip). On-screen → chevron hidden
  (the beacon is visible). Far waypoints (beyond draw distance) still read correct
  distance/bearing in the OSD even though the beacon fades out — correct degradation.
- **Minimap waypoint**: `map.on('click')` → `setWaypoint(e.lngLat)` (pins
  `stopPropagation`, so only empty-map clicks place); `map.on('contextmenu')` → clear.
  A yellow dashed GeoJSON **route line** (source + layer added in `map.on('load')`,
  updated via `getSource('wp-route').setData` in the vanilla-subscribe tick) and a
  distinct **yellow diamond marker** (created on set, removed on clear). Placement works
  only when expanded (collapsed = `pointer-events:none`) and does **not** auto-close the
  map (so you can adjust). Teleport (`locations.teleportTo`) and `G` (`cycleTarget`)
  clear the waypoint.
- **Pause HUD**: `Osd` early-returns a minimal `PAUSED` badge + controls hint when
  paused (after the `!hudVisible` check); the minimap hides via a CSS class (kept
  mounted so MapLibre isn't recreated); the dev FPS panel (`DevStats`) and the 3D guide
  unmount while paused. The Google `TilesAttributionOverlay` stays (ToS).

All verified end-to-end with Playwright (real key, localhost:5173): freeze + momentum,
free-cam move + snap-back, waypoint place (store + real map click) → nav override +
route line + marker + 3D line + beacon + chevron, clear via C / right-click / teleport
/ G, clean pause HUD. `npm run build` + `eslint` clean; MapLibre stays code-split.
