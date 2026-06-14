// 3D waypoint guidance (world space): a glowing yellow guide line from the drone to
// the waypoint that fades into the M2 fog at distance, a vertical beacon at the mark,
// and an off-screen HUD chevron (computed here where the camera lives, published to
// useGeoStore for the OSD to render). Only active when a waypoint is set, in LA, and
// not paused. Allocation-free hot path; the waypoint local position is recomputed
// each frame (one ellipsoid conversion) so it tracks the active anchor.
import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import { useGeoStore } from "./useGeoStore";
import type { Chevron } from "./useGeoStore";
import { useWorldStore } from "./useWorldStore";
import { drone, useDroneStore } from "../drone/droneState";
import { LOCATIONS } from "./locations";
import { latLonToLocal } from "./geo";
import { RAD2DEG } from "../lib/mathUtils";

const BEACON_H = 600; // m — tall enough to spot, fades into fog at range
const CHEV_MARGIN = 60; // px inset from the screen edge
const INIT_POINTS: [number, number, number][] = [
  [0, 0, 0],
  [0, 0, 1],
];
const OFF: Chevron = { visible: false, x: 0, y: 0, angle: 0 };

// minimal structural type for drei's fat Line (avoids a three-stdlib type import)
type FatLine = {
  geometry: { setPositions: (a: ArrayLike<number>) => void };
  material: { fog: boolean; needsUpdate: boolean };
};

// module scratch — single-threaded useFrame
const _wp = new THREE.Vector3();
const _view = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _arr = new Float32Array(6);

function updateChevron(camera: THREE.Camera, w: number, h: number): void {
  _view.copy(_wp).applyMatrix4(camera.matrixWorldInverse); // view space (look down −z)
  const inFront = _view.z < 0;
  let onScreen = false;
  if (inFront) {
    _ndc.copy(_wp).project(camera);
    onScreen = _ndc.x >= -1 && _ndc.x <= 1 && _ndc.y >= -1 && _ndc.y <= 1;
  }
  const store = useGeoStore.getState();
  if (onScreen) {
    if (store.chevron.visible) store.setChevron(OFF); // on screen → beacon is visible, no chevron
    return;
  }
  // direction toward the target in the camera's right/up plane (valid in front AND
  // behind — sidesteps the project() sign flip for points behind the camera)
  let dx = _view.x;
  let dy = _view.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) {
    dx = 0;
    dy = -1;
  } else {
    dx /= len;
    dy /= len;
  }
  const cx = w / 2;
  const cy = h / 2;
  const sdx = dx; // screen x (right)
  const sdy = -dy; // screen y is DOWN
  const scale = Math.min((cx - CHEV_MARGIN) / (Math.abs(sdx) || 1e-3), (cy - CHEV_MARGIN) / (Math.abs(sdy) || 1e-3));
  store.setChevron({
    visible: true,
    x: cx + sdx * scale,
    y: cy + sdy * scale,
    angle: Math.atan2(sdx, -sdy) * RAD2DEG, // rotate an up-pointing glyph to face the target
  });
}

export function WaypointGuide() {
  const waypoint = useGeoStore((s) => s.waypoint);
  const worldMode = useWorldStore((s) => s.mode);
  const paused = useDroneStore((s) => s.paused);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const lineRef = useRef<FatLine | null>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const chevAccum = useRef(0);

  const active = !!waypoint && worldMode === "la" && !paused;

  // drei's Line never sets fog; enable it + force the shader recompile so the line
  // fades into the scene fog like the rest of the world.
  useLayoutEffect(() => {
    const m = lineRef.current?.material;
    if (m) {
      m.fog = true;
      m.needsUpdate = true;
    }
  }, [active]);

  useFrame((_s, delta) => {
    const wp = useGeoStore.getState().waypoint;
    if (!active || !wp) {
      if (useGeoStore.getState().chevron.visible) useGeoStore.getState().setChevron(OFF);
      return;
    }
    const gh = LOCATIONS[useGeoStore.getState().activeIndex]?.groundHeightM ?? 0;
    if (!latLonToLocal(wp.lat, wp.lon, gh, _wp)) return;

    const ln = lineRef.current;
    if (ln) {
      _arr[0] = drone.position.x;
      _arr[1] = drone.position.y;
      _arr[2] = drone.position.z;
      _arr[3] = _wp.x;
      _arr[4] = _wp.y;
      _arr[5] = _wp.z;
      ln.geometry.setPositions(_arr);
    }
    if (beaconRef.current) beaconRef.current.position.set(_wp.x, _wp.y + BEACON_H / 2, _wp.z);

    chevAccum.current += delta;
    if (chevAccum.current >= 0.05) {
      chevAccum.current = 0;
      updateChevron(camera, size.width, size.height);
    }
  });

  if (!active) return null;
  return (
    <group>
      <Line
        ref={(o) => {
          lineRef.current = (o as unknown as FatLine) ?? null;
        }}
        points={INIT_POINTS}
        color="#ffdd00"
        lineWidth={2.5}
        transparent
        opacity={0.95}
      />
      <mesh ref={beaconRef}>
        <cylinderGeometry args={[6, 6, BEACON_H, 12, 1, true]} />
        <meshBasicMaterial
          color="#ffdd00"
          transparent
          opacity={0.25}
          depthWrite={false}
          side={THREE.DoubleSide}
          fog
        />
      </mesh>
    </group>
  );
}
