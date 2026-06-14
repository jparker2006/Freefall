// FPV camera — parented to the drone rig at the drone origin (true first person).
//
// A fixed upward tilt (cameraUptilt) is baked into the camera's LOCAL rotation:
// level flight shows an upward-angled view, and pitching forward to accelerate
// brings the horizon level — authentic FPV behaviour. The uptilt is purely
// visual; thrust still acts along the drone body up (see useFlightModel).
import { useLayoutEffect, useRef } from "react";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { useTuning } from "../tuning/tuningStore";
import { useWorldStore } from "../world/useWorldStore";
import { DEG2RAD } from "../lib/mathUtils";

export function FpvCamera() {
  const ref = useRef<THREE.PerspectiveCamera>(null);
  const fov = useTuning((s) => s.fov);
  const uptilt = useTuning((s) => s.cameraUptilt);
  // M2: far plane = draw distance (we see km of city). near is 1m — we're always
  // airborne (free flight), so close clipping never bites and a larger near keeps
  // depth precision usable across the huge range without a log-depth buffer.
  const drawDistance = useWorldStore((s) => s.drawDistance);

  // Apply fov + uptilt + far live (leva edits) without remounting the camera.
  useLayoutEffect(() => {
    const cam = ref.current;
    if (!cam) return;
    cam.fov = fov;
    cam.far = drawDistance;
    cam.rotation.set(uptilt * DEG2RAD, 0, 0); // +X tilts the look up
    cam.updateProjectionMatrix();
  }, [fov, uptilt, drawDistance]);

  return (
    <PerspectiveCamera ref={ref} makeDefault near={1} far={drawDistance} position={[0, 0, 0]} />
  );
}
