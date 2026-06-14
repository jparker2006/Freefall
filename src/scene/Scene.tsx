// The R3F canvas: world, drone rig (with the FPV camera as a child so it follows
// for free), the fixed-step physics driver, input wiring, and the postfx stack.
import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
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

// Dev FPS panel — hidden during pause/free-look so capture footage stays clean.
function DevStats() {
  const paused = useDroneStore((s) => s.paused);
  return paused ? null : <Stats />;
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
      dpr={[1, 2]}
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
      <Effects />
      <DevStats />
    </Canvas>
  );
}
