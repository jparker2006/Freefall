// In-Canvas publisher: the bridge between the live tileset and the DOM minimap/OSD.
// Mounted as a child of <TilesRenderer> (the only place with TilesRendererContext),
// it captures the renderer + its ReorientationPlugin into `worldBridge`, then on a
// throttled ~12 Hz tick converts the drone's local position → geographic lat/lon +
// heading, resolves the current neighborhood (PIP) and the nav target distance +
// bearing, and writes them to useGeoStore. Allocation-free hot path.
import { useContext, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TilesRendererContext } from "3d-tiles-renderer/r3f";
import type { ReorientationPlugin } from "3d-tiles-renderer/plugins";
import { RAD2DEG } from "../lib/mathUtils";
import { drone } from "../drone/droneState";
import { useGeoStore } from "./useGeoStore";
import { LOCATIONS } from "./locations";
import { worldBridge, localToLatLon, latLonToLocal, bearingDistanceMi, loadNeighborhoods, neighborhoodAt } from "./geo";

const TICK = 1 / 12; // ~12 Hz: smooth for a minimap marker, far cheaper than per-frame

// module scratch — the tick is single-threaded, so reuse keeps it allocation-free
const _fwd = new THREE.Vector3();
const _ll = { lat: 0, lon: 0 };
const _tl = new THREE.Vector3();
const _best = new THREE.Vector3();
const _nav = { distanceMi: 0, bearingDeg: 0 };

export function GeoPublisher({
  reorientRef,
}: {
  reorientRef: RefObject<ReorientationPlugin | null>;
}): null {
  const tiles = useContext(TilesRendererContext);
  const accum = useRef(0);

  useEffect(() => {
    if (!tiles) return;
    worldBridge.tiles = tiles;
    worldBridge.reorient = reorientRef.current;
    loadNeighborhoods();
    return () => {
      // r3f nulls the renderer on unmount/HMR — clear the singleton so a stale
      // reference can never be used by teleportTo or the tick.
      if (worldBridge.tiles === tiles) {
        worldBridge.tiles = null;
        worldBridge.reorient = null;
      }
    };
  }, [tiles, reorientRef]);

  useFrame((_s, delta) => {
    if (!worldBridge.tiles) return;
    // self-heal: the plugin instance attaches to the ref a render or two after this
    // component mounts, so capture it here once it exists (teleport needs it).
    if (!worldBridge.reorient && reorientRef.current) worldBridge.reorient = reorientRef.current;
    accum.current += delta;
    if (accum.current < TICK) return;
    accum.current = 0;

    if (!localToLatLon(drone.position, _ll)) return; // tileset not anchored yet

    // heading: true-north from body forward, same convention as flight telemetry
    _fwd.set(0, 0, -1).applyQuaternion(drone.orientation);
    let heading = Math.atan2(-_fwd.x, _fwd.z) * RAD2DEG;
    if (heading < 0) heading += 360;

    const hood = neighborhoodAt(_ll.lon, _ll.lat) ?? "LOS ANGELES";

    // nav target — a custom WAYPOINT overrides everything; otherwise auto-nearest
    // (targetSel<0) or a chosen roster slot. Target local positions are recomputed
    // each tick so they track the current anchor without teleport-timing bookkeeping.
    const st = useGeoStore.getState();
    let targetName = "";
    const wp = st.waypoint;
    if (wp) {
      const gh = LOCATIONS[st.activeIndex]?.groundHeightM ?? 0;
      if (latLonToLocal(wp.lat, wp.lon, gh, _best)) targetName = "WAYPOINT";
    } else {
      const sel = st.targetSel;
      let idx = sel;
      if (sel < 0) {
        let bestD = Infinity;
        for (let i = 0; i < LOCATIONS.length; i++) {
          const L = LOCATIONS[i];
          if (!latLonToLocal(L.lat, L.lon, L.groundHeightM, _tl)) continue;
          const dx = _tl.x - drone.position.x;
          const dz = _tl.z - drone.position.z;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            idx = i;
            _best.copy(_tl);
          }
        }
      } else {
        latLonToLocal(LOCATIONS[sel].lat, LOCATIONS[sel].lon, LOCATIONS[sel].groundHeightM, _best);
      }
      if (idx >= 0) targetName = LOCATIONS[idx].name;
    }
    if (!targetName) return; // no target resolvable yet
    bearingDistanceMi(drone.position, _best, _nav);

    st.publish({
      lat: _ll.lat,
      lon: _ll.lon,
      heading,
      neighborhood: hood,
      targetName,
      targetDistanceMi: Math.round(_nav.distanceMi * 10) / 10,
      targetBearingDeg: Math.round(_nav.bearingDeg),
    });
  });

  return null;
}
