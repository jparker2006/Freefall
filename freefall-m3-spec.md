# Freefall — Milestone 3 Spec (Orientation: Minimap + Locations + HUD)

> Built on the completed M2 build (drone flying over photorealistic LA, georeferenced
> via `ReorientationPlugin`). M3 adds the orientation layer: a real 2D minimap, a menu
> of named LA spawn locations, and HUD readouts that make flying a real, named city
> legible. **The M1 flight model and the M2 world were not retuned.**

---

## 0. Orientation

M2 left us flying the M1-tuned drone over streaming Google Photorealistic 3D Tiles,
anchored at Westwood, spawning airborne ~350 m. M3 is the orientation milestone —
knowing where you are and getting to the good spots.

**Locked decisions:**
- **Minimap:** real street map, **north-up** (map follows the drone, the drone icon
  rotates, small "N" indicator).
- **HUD additions:** live **neighborhood / place-name** readout + **distance + bearing
  to a landmark** (miles + degrees). *(Not lat/long.)*
- **Location roster (9):** Santa Monica Pier, Downtown LA, Westwood (default), Beverly
  Hills, Griffith/Hollywood, Venice Beach, SoFi Stadium, The Getty, Dodger Stadium.
- **Teleport:** instant re-anchor + airborne spawn, reusing the M2 loading screen.
- **Menu UX:** clickable pins on the minimap, **press M** to expand, plus **number
  keys 1–9**.

**Carry-forward this milestone depends on:**
- Local frame **north = +Z, up = +Y, east = −X**. Heading/bearing = `atan2(-x, z)`.
- The tileset is recentered to the local origin by `ReorientationPlugin`. Re-anchoring
  to a new location = re-pointing that reorientation.
- Geographic position is derived from the renderer's **ellipsoid + the active group
  transform** (the library's blessed path), not a hand-rolled formula.

**Scope line:** M3 = minimap + locations + the two HUD readouts. **No collision, no
cinematic teleport, no heading-up mode, no mood-switcher UI, no reverse-geocode API,
no lat/long readout.**

---

## 1. New dependencies
- **`maplibre-gl@^5`** — the 2D street minimap (lazy-loaded so its ~220 KB chunk never
  bloats first paint, and only in LA mode).
- **No PIP dependency** — a hand-rolled ray-casting point-in-polygon (Polygon /
  MultiPolygon + holes, with a per-feature bbox pre-check).
- **LA neighborhoods GeoJSON** vendored to `public/la-neighborhoods.geojson` (LA Times
  "Mapping L.A." county set, 272 features, `name` property; stripped to `name` +
  coordinates rounded to ~1 m to shrink it to ~184 KB).

---

## 2–7. (see the original brief)

Minimap (north-up, drone marker rotated to heading, location pins, expand with M);
neighborhood readout (local GeoJSON + PIP, with a `LOS ANGELES` off-dataset fallback);
distance + bearing to the nearest/selected landmark; the 9-location roster + teleport
(re-anchor + airborne spawn + the M2 loading screen); the location menu (pins + number
keys + expand); and a HUD layout pass so nothing collides.

---

## 11. Definition of done (M3) — all met
- [x] North-up street minimap with live position (rotating drone marker) + roster pins,
      expandable with **M** (pointer lock released on expand, re-captured on collapse).
- [x] Live neighborhood readout via local polygons, with an off-dataset fallback.
- [x] Distance + bearing to a selectable landmark (miles + degrees), cycle with **G**.
- [x] 9 roster locations via pins or number keys; selecting re-anchors + spawns airborne
      with the loading screen; minimap + readouts update.
- [x] Minimap position derived from the library ellipsoid + reorientation (north=+Z);
      throttled (~12 Hz) and smooth.
- [x] All M1/M2 systems intact; HUD layout pass done; Google + map attribution shown.
- [x] Keyless map basemap (OpenFreeMap); optional `VITE_MAP_STYLE_URL` override.

---

## Implementation notes (as built)

- **Coordinate direction (the one real gotcha).** The tiles are ECEF-defined CHILDREN
  of `tiles.group`, and `ReorientationPlugin` sets `group.matrix = inverse(anchor object
  frame)`, so **`group.matrixWorld` maps ECEF → scene-local**, not the reverse. Therefore
  scene-local → geo uses the **inverse** of `matrixWorld`, and geo → scene-local uses
  `matrixWorld` directly. (Getting this backwards yields ECEF-scale garbage — distances in
  the thousands of miles.) Lives in `src/world/geo.ts` (`localToLatLon` / `latLonToLocal`),
  both allocation-free. Ellipsoid methods: `getPositionToCartographic` (radians) and
  `getCartographicToPosition`.

- **Reaching the ReorientationPlugin for teleport.** `getPluginByName('ReorientationPlugin')`
  returns `null` (the plugin sets no `name`). The instance is captured via a **`ref` on
  `<TilesPlugin>`** — but the r3f wrapper creates the instance in a layout effect and
  forwards the ref a render later, so the mount-effect capture can be null. `GeoPublisher`
  **self-heals** in its tick: `if (!worldBridge.reorient && reorientRef.current) …`. The
  r3f `TilesPlugin` ref type declares the constructor though it forwards the instance, so
  the ref is cast through `unknown`.

- **GeoPublisher** (child of `<TilesRenderer>`, the only place with `TilesRendererContext`)
  publishes `{lat, lon, heading, neighborhood, target}` to `useGeoStore` at **~12 Hz**.
  The minimap consumes it via the **vanilla `useGeoStore.subscribe()`** and updates its
  MapLibre marker imperatively (no React re-render at 12 Hz); the OSD reads display fields
  with selectors. `worldBridge` (in `geo.ts`) is the module singleton bridging the in-Canvas
  renderer to the plain `teleportTo` function; it's cleared on unmount (HMR-safe).

- **Teleport loading gate.** `load-tileset` only fires for the first root, so the gate
  (in `LaTiles`) re-arms on a `loadEpoch` bump (`useWorldStore.beginTeleportLoad`) and keys
  off **`tiles-load-start` → `tiles-load-end`** + a 450 ms settle (LOD cascade) + a
  "nothing-to-load" fast path (`!sawStart && loadProgress ≥ 0.95` after a 700 ms grace —
  re-anchoring to a region whose coarse tiles are already cached emits no start) + a 20 s
  failsafe. Measured ~1.1 s on a far teleport; never hangs.

- **Per-location ground height.** Each roster entry carries `groundHeightM` (ellipsoidal,
  ≈ MSL − 35 m LA geoid) passed to `transformLatLonHeightToOrigin`, so the anchor lands at
  ground and the altimeter (`drone.position.y`) reads ≈ AGL even at hilly spots (Griffith
  ≈ 1247 ft, Dodger ≈ 1050 ft). Approximate — tunable.

- **`spawnAt(altitude, yawDeg)`** parameterizes the old `resetFlight` (which now delegates),
  tracks the active spawn (so **R** returns to the current location), and `teleportTo`
  pre-charges thrust to live hover (mirrors the R-key path) so there's **no post-teleport
  sink**. Spawn yaw → compass heading is `H = (180 − facingDeg) mod 360`.

- **Basemap = keyless OpenFreeMap** "positron" vector style, dark-filtered on the GL canvas
  only (markers/controls stay crisp green). `MAP_STYLE_URL` is one swappable config
  (`VITE_MAP_STYLE_URL`); OSM/OpenFreeMap attribution is shown on the minimap frame.
  Collapsed minimap = `pointer-events:none` (flight clicks pass through); expanded =
  pointer-events on, `fitBounds` over all pins, pin labels shown, pin click → teleport +
  collapse.

- **Layout pass.** Minimap → bottom-right; both stick indicators → clustered bottom-left;
  the Google `TilesAttributionOverlay` lifted above them (`style` prop); neighborhood + nav
  readouts → top-left (below the dev FPS panel); "N" on the minimap frame. The **leva
  tuning panel now starts hidden** (one `` ` `` keystroke away) so the minimap and flight
  view are unobstructed.

- **Deviation from the plan:** target local positions are recomputed **every tick** (9 cheap
  conversions) rather than cached + recomputed-on-teleport — it sidesteps all anchor-change
  timing and is negligible at 12 Hz.
