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
import { GamepadController } from "../input/GamepadController";
import { Effects } from "../postfx/Effects";
import { useDroneStore } from "../drone/droneState";
import { useWorldStore } from "../world/useWorldStore";
import { IS_TOUCH } from "../ui/device";

// Dev FPS panel — hidden during pause/free-look (clean capture) and on touch (it would
// overlap the reflowed top-left readouts; perf is tuned via the settings sheet there).
function DevStats() {
  const paused = useDroneStore((s) => s.paused);
  if (IS_TOUCH || paused) return null;
  return <Stats />;
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

// Dev-only: expose the live camera/scene on window.__freefall for console + test
// inspection (the free-look camera detaches from the drone rig during pause, so it's
// otherwise unreachable). Compiled out of production via import.meta.env.DEV.
function DevBridge(): null {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    const ff = (w.__freefall as Record<string, unknown> | undefined) ?? {};
    ff.camera = camera;
    ff.scene = scene;
    w.__freefall = ff;
  }, [camera, scene]);
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
      // Cap pixel ratio: tile detail is screen-space-error based, so a lower buffer
      // resolution needs far fewer high-res tiles for the same detail — big GPU-memory
      // headroom, still crisp. 1.5 on desktop (retina M-series); 1.25 on touch, where
      // phones report dpr 2.5–3 natively — this is the single biggest mobile perf win and
      // the lever that keeps "crisp-first" detail from exhausting weaker mobile GPUs.
      dpr={IS_TOUCH ? [1, 1.25] : [1, 1.5]}
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

      {/* Mounted before FlightModel so its per-frame axis writes precede advanceInput. */}
      <GamepadController />
      <FlightModel droneRef={droneRef} />
      <FreeCamController droneRef={droneRef} />
      <InputBridge />
      <ContextLossGuard />
      <DevBridge />
      <Effects />
      <DevStats />
    </Canvas>
  );
}
