// The R3F canvas: world, drone rig (with the FPV camera as a child so it follows
// for free), the fixed-step physics driver, input wiring, and the postfx stack.
import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import * as THREE from "three";
import { World } from "../world/World";
import { WaypointGuide } from "../world/WaypointGuide";
import { FpvCamera } from "../camera/FpvCamera";
import { FlightModel } from "../drone/useFlightModel";
import { FreeCamController } from "./FreeCamController";
import { InputBridge } from "../input/useInput";
import { Effects } from "../postfx/Effects";
import { useDroneStore } from "../drone/droneState";
import { useWorldStore } from "../world/useWorldStore";

// Dev FPS panel — hidden during pause/free-look so capture footage stays clean.
function DevStats() {
  const paused = useDroneStore((s) => s.paused);
  return paused ? null : <Stats />;
}

// Surfaces a WebGL context loss (GPU out of memory from too-high tile detail) as a
// notice instead of a silent black screen. preventDefault lets the browser restore.
function ContextLossGuard(): null {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      useWorldStore.getState().setContextLost(true);
    };
    const onRestored = () => useWorldStore.getState().setContextLost(false);
    canvas.addEventListener("webglcontextlost", onLost as EventListener);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost as EventListener);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl]);
  return null;
}

// The drone mesh is invisible by default (true FPV). Toggle on for debugging via
// the leva Debug panel.
function DroneBody() {
  const show = useDroneStore((s) => s.showDroneBody);
  return (
    <mesh visible={show}>
      <boxGeometry args={[0.5, 0.16, 0.5]} />
      <meshStandardMaterial color="#1b1f24" roughness={0.6} />
    </mesh>
  );
}

export function Scene() {
  const droneRef = useRef<THREE.Group>(null);

  return (
    <Canvas
      // Cap pixel ratio at 1.5 (not 2): tile detail is screen-space-error based, so a
      // lower buffer resolution needs far fewer high-res tiles for the same detail —
      // big GPU-memory headroom on retina M-series, still crisp.
      dpr={[1, 1.5]}
      frameloop="always"
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      {/* FPV camera mounts first (makeDefault) so the tiles renderer in <World/>
          registers it, not the auto camera. World provides sky/lights/fog + the
          LA tiles or the greybox sandbox. */}
      <group ref={droneRef}>
        <FpvCamera />
        <DroneBody />
      </group>

      <World />
      <WaypointGuide />

      <FlightModel droneRef={droneRef} />
      <FreeCamController droneRef={droneRef} />
      <InputBridge />
      <ContextLossGuard />
      <Effects />
      <DevStats />
    </Canvas>
  );
}
