// M3 geo bridge — converts the drone's LOCAL position (the recentered LA frame:
// +Y up, +Z geographic north, -X east; see anchor.ts) to/from geographic lat/lon
// using the LIVE 3d-tiles-renderer ellipsoid + the tileset group transform, plus
// nav bearing/distance and neighborhood point-in-polygon.
//
// Everything here is allocation-free (module scratch) — it runs in the ~12 Hz
// GeoPublisher tick. The minimap, the OSD readouts, and teleport all derive from
// these helpers, so they stay consistent with the tiles (same lesson as M2: use
// the library's ellipsoid, never a hand-rolled projection).
import * as THREE from "three";
import type { TilesRenderer } from "3d-tiles-renderer/three";
import type { ReorientationPlugin } from "3d-tiles-renderer/plugins";
import { RAD2DEG, DEG2RAD } from "../lib/mathUtils";

// The live tiles renderer + its ReorientationPlugin, published by GeoPublisher once
// the tileset mounts (the only place with TilesRendererContext). Plain functions
// (teleportTo) and the publisher read this; r3f nulls the renderer on unmount, so
// always go through bridgeReady() / the in-function guards before touching it.
export const worldBridge: {
  tiles: TilesRenderer | null;
  reorient: ReorientationPlugin | null;
} = { tiles: null, reorient: null };

// True once the tileset has loaded AND the ReorientationPlugin has recentered it
// (group gets a large ECEF-scale translation) — i.e. local↔geo is meaningful.
export function bridgeReady(): boolean {
  const t = worldBridge.tiles;
  return !!t && !!t.rootTileset && t.group.position.lengthSq() > 1 && !!worldBridge.reorient;
}

const _ecef = new THREE.Vector3();
const _cart = { lat: 0, lon: 0, height: 0 };
const _inv = new THREE.Matrix4();

// The tiles are ECEF-defined CHILDREN of tiles.group, so group.matrixWorld maps
// ECEF → scene-local (the ReorientationPlugin set group.matrix = inverse of the
// anchor's object frame). Hence: scene-local → ECEF uses the INVERSE, and
// ECEF → scene-local uses matrixWorld directly.

// Local (recentered) position → geographic. Writes lat/lon in DEGREES into `out`.
export function localToLatLon(local: THREE.Vector3, out: { lat: number; lon: number }): boolean {
  const t = worldBridge.tiles;
  if (!t || t.group.position.lengthSq() <= 1) return false;
  _inv.copy(t.group.matrixWorld).invert();
  _ecef.copy(local).applyMatrix4(_inv); // scene-local → ECEF
  const c = t.ellipsoid.getPositionToCartographic(_ecef, _cart);
  out.lat = c.lat * RAD2DEG;
  out.lon = c.lon * RAD2DEG;
  return true;
}

// Geographic (DEGREES) → local (recentered) position. Writes into `out`.
export function latLonToLocal(
  latDeg: number,
  lonDeg: number,
  heightM: number,
  out: THREE.Vector3,
): boolean {
  const t = worldBridge.tiles;
  if (!t || t.group.position.lengthSq() <= 1) return false;
  t.ellipsoid.getCartographicToPosition(latDeg * DEG2RAD, lonDeg * DEG2RAD, heightM, out); // → ECEF
  out.applyMatrix4(t.group.matrixWorld); // ECEF → scene-local
  return true;
}

// Horizontal bearing + distance from drone→target, both LOCAL meters. Bearing is a
// 0–360 compass heading in the north=+Z / east=−X frame (same convention as the M1
// heading formula). Distance is returned in MILES (US default, matching the OSD).
export function bearingDistanceMi(
  drone: THREE.Vector3,
  target: THREE.Vector3,
  out: { distanceMi: number; bearingDeg: number },
): void {
  const dx = target.x - drone.x;
  const dz = target.z - drone.z;
  let bearing = Math.atan2(-dx, dz) * RAD2DEG; // 0=N(+Z), 90=E(−X)
  if (bearing < 0) bearing += 360;
  out.bearingDeg = bearing;
  out.distanceMi = Math.hypot(dx, dz) * 0.000621371;
}

// --- Neighborhood point-in-polygon (local GeoJSON, lazily fetched) -----------
// GeoJSON coords are [lon, lat]. We normalize Polygon/MultiPolygon to a flat list
// of polygons-with-holes per feature, precompute a bbox for a cheap reject, then
// ray-cast. A few hundred features at 12 Hz is trivial with the bbox pre-check.
type Ring = number[][]; // [ [lon,lat], ... ]
type Poly = Ring[]; // [outerRing, ...holeRings]
type Feature = { name: string; polys: Poly[]; bbox: [number, number, number, number] };

let features: Feature[] | null = null;
let loadStarted = false;

const NAME_KEYS = ["name", "Name", "NAME", "neighborhood", "community", "label", "Neighborhood"];
function featureName(props: Record<string, unknown> | null): string {
  if (props) {
    for (const k of NAME_KEYS) {
      const v = props[k];
      if (typeof v === "string" && v.length > 0) return v.toUpperCase();
    }
  }
  return "LOS ANGELES";
}

function bboxOf(polys: Poly[]): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polys)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
  return [minX, minY, maxX, maxY];
}

// kicked off once by GeoPublisher; safe to call repeatedly.
export function loadNeighborhoods(): void {
  if (loadStarted) return;
  loadStarted = true;
  fetch("/la-neighborhoods.geojson")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((gj: { features?: Array<{ properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } }> }) => {
      const out: Feature[] = [];
      for (const f of gj.features ?? []) {
        const g = f.geometry;
        if (!g) continue;
        let polys: Poly[];
        if (g.type === "Polygon") polys = [g.coordinates as Poly];
        else if (g.type === "MultiPolygon") polys = g.coordinates as Poly[];
        else continue;
        out.push({ name: featureName(f.properties ?? null), polys, bbox: bboxOf(polys) });
      }
      features = out;
    })
    .catch(() => {
      features = []; // dataset unreachable → readouts fall back to "LOS ANGELES"
    });
}

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1],
      xj = ring[j][0],
      yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPoly(lon: number, lat: number, poly: Poly): boolean {
  if (!pointInRing(lon, lat, poly[0])) return false; // outside outer ring
  for (let h = 1; h < poly.length; h++) if (pointInRing(lon, lat, poly[h])) return false; // in a hole
  return true;
}

// Returns the neighborhood name at (lon,lat) in DEGREES, or null when outside the
// dataset (ocean / off-coverage) or before the data has loaded.
export function neighborhoodAt(lonDeg: number, latDeg: number): string | null {
  if (!features) return null;
  for (const f of features) {
    const b = f.bbox;
    if (lonDeg < b[0] || lonDeg > b[2] || latDeg < b[1] || latDeg > b[3]) continue;
    for (const poly of f.polys) if (pointInPoly(lonDeg, latDeg, poly)) return f.name;
  }
  return null;
}
