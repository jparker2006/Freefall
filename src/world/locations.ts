// M3 roster — the nine named LA spawn points + the teleport mechanic.
//
// Teleport = INSTANT re-anchor + airborne respawn (no cinematic fly-across; the
// tiles can't stream miles fast enough). We move the WORLD: re-point the
// ReorientationPlugin so the chosen lat/lon sits at the local origin, then reset
// the drone to origin + spawn altitude, facing the vista, holding hover. The M2
// loading screen covers the new region streaming in.
//
// `facingDeg` is the spawn YAW about +Y (same units as SPAWN_YAW_DEG). In the LA
// frame the compass heading it produces is H = (180 − facingDeg) mod 360. All
// values are approximate starting points — fine-tune the anchor + vista by flying.
import { DEG2RAD, clamp } from "../lib/mathUtils";
import { G } from "../constants";
import { drone, spawnAt } from "../drone/droneState";
import { useTuning } from "../tuning/tuningStore";
import { input } from "../input/useInput";
import { worldBridge, bridgeReady } from "./geo";
import { useWorldStore } from "./useWorldStore";
import { useGeoStore } from "./useGeoStore";

export type Location = {
  id: string;
  name: string;
  lat: number; // deg
  lon: number; // deg
  spawnAltitude: number; // m above the anchor (≈ AGL)
  facingDeg: number; // spawn yaw about +Y
  groundHeightM: number; // ellipsoidal ground height (≈ MSL − 35 m LA geoid) so altitude ≈ AGL
};

// Index 2 = Westwood, the M2 default spawn (see useGeoStore.activeIndex). Number
// keys 1–9 map to indices 0–8.
export const LOCATIONS: readonly Location[] = [
  { id: "smpier", name: "SANTA MONICA PIER", lat: 34.008, lon: -118.502, spawnAltitude: 280, facingDeg: 90, groundHeightM: -34 },
  { id: "dtla", name: "DOWNTOWN LA", lat: 34.049, lon: -118.252, spawnAltitude: 360, facingDeg: 135, groundHeightM: 55 },
  { id: "westwood", name: "WESTWOOD", lat: 34.063, lon: -118.43, spawnAltitude: 350, facingDeg: 45, groundHeightM: 55 },
  { id: "beverlyhills", name: "BEVERLY HILLS", lat: 34.067, lon: -118.4, spawnAltitude: 320, facingDeg: 45, groundHeightM: 45 },
  { id: "griffith", name: "GRIFFITH / HOLLYWOOD", lat: 34.1184, lon: -118.3004, spawnAltitude: 380, facingDeg: 225, groundHeightM: 310 },
  { id: "venice", name: "VENICE BEACH", lat: 33.985, lon: -118.469, spawnAltitude: 260, facingDeg: 100, groundHeightM: -32 },
  { id: "sofi", name: "SOFI STADIUM", lat: 33.9535, lon: -118.339, spawnAltitude: 320, facingDeg: 190, groundHeightM: -5 },
  { id: "getty", name: "THE GETTY", lat: 34.078, lon: -118.475, spawnAltitude: 360, facingDeg: 45, groundHeightM: 235 },
  { id: "dodger", name: "DODGER STADIUM", lat: 34.0739, lon: -118.24, spawnAltitude: 320, facingDeg: 0, groundHeightM: 115 },
];

// Re-anchor + airborne spawn over a roster location. No-ops (gracefully) until the
// tiles + ReorientationPlugin are live, and if the renderer was disposed (HMR).
export function teleportTo(index: number): void {
  if (index < 0 || index >= LOCATIONS.length) return;
  if (!bridgeReady()) return;
  const L = LOCATIONS[index];

  // 1. move the world so this spot is the new local origin (ground at y≈0). The
  //    plugin updates group.matrixWorld synchronously; the per-frame tiles.update()
  //    re-traverses + streams the new region (old tiles unload).
  worldBridge.reorient!.transformLatLonHeightToOrigin(L.lat * DEG2RAD, L.lon * DEG2RAD, L.groundHeightM);

  // 2. reset the drone to spawn, then pre-charge thrust to LIVE hover so it holds
  //    altitude instead of sinking for a beat (mirrors the R-key path in useInput).
  spawnAt(L.spawnAltitude, L.facingDeg);
  const tu = useTuning.getState();
  input.axes.throttle = clamp(1 / tu.twr, 0, 1);
  drone.thrustMag = tu.mass * G;

  // 3. re-arm the loading gate (epoch bump) so the overlay shows until the new
  //    region streams in, and update orientation UI state.
  useWorldStore.getState().beginTeleportLoad();
  const geo = useGeoStore.getState();
  geo.setActiveIndex(index);
  geo.setTargetSel(-1); // resume auto-nearest after arriving
  geo.clearWaypoint(); // a mark near the old anchor is meaningless after teleporting
}

// Cycle the nav target: auto-nearest (−1) → each roster slot → back to auto. If a
// custom waypoint is active, it's cleared first (reverting to the landmark cycle).
// `dir` defaults to +1 so the keyboard G path is unchanged; the controller D-pad passes
// −1 for reverse. Range is [-1 .. LOCATIONS.length-1] (−1 = auto-nearest), wrapping.
export function cycleTarget(dir: 1 | -1 = 1): void {
  const geo = useGeoStore.getState();
  if (geo.waypoint) {
    geo.clearWaypoint();
    return;
  }
  const n = LOCATIONS.length;
  let next = geo.targetSel + dir;
  if (next >= n) next = -1;
  else if (next < -1) next = n - 1;
  geo.setTargetSel(next);
}
