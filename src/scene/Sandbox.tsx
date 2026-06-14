// Instrumented greybox sandbox. A clean grey blockout — but deliberately
// instrumented so the pilot can FEEL speed, altitude and rotation: a gridded
// floor, a clear sky horizon, a field of known-height pillars for parallax,
// gates to thread, and one tall dive tower for the "Freefall" plunge.
import { useMemo } from "react";
import { Grid, Instances, Instance } from "@react-three/drei";

const GREY = "#9aa0a8";
const ACCENT = "#39d0d8"; // subtle cyan so gates read against the grey

const PILLAR_HEIGHT = 20;
const PILLAR_SPACING = 40;
const PILLAR_HALF = 4; // grid extent: (2*4+1)^2 columns

type Vec3 = [number, number, number];

// Gates at varying heights along the -Z flight path (torus lies in XY → hole on Z).
const GATES: { pos: Vec3; r: number }[] = [
  { pos: [0, 9, -22], r: 4.5 },
  { pos: [-14, 14, -58], r: 4 },
  { pos: [16, 22, -96], r: 5 },
  { pos: [-6, 32, -140], r: 4 },
  { pos: [4, 12, -185], r: 6 },
];

function Pillars() {
  const positions = useMemo<Vec3[]>(() => {
    const out: Vec3[] = [];
    for (let i = -PILLAR_HALF; i <= PILLAR_HALF; i++) {
      for (let j = -PILLAR_HALF; j <= PILLAR_HALF; j++) {
        const x = i * PILLAR_SPACING;
        const z = j * PILLAR_SPACING;
        if (Math.abs(x) < 1 && Math.abs(z) < 1) continue; // keep origin clear
        out.push([x, PILLAR_HEIGHT / 2, z]);
      }
    }
    return out;
  }, []);

  return (
    <Instances limit={positions.length} range={positions.length} castShadow={false}>
      <boxGeometry args={[2, PILLAR_HEIGHT, 2]} />
      <meshStandardMaterial color={GREY} roughness={0.92} metalness={0} />
      {positions.map((p, i) => (
        <Instance key={i} position={p} />
      ))}
    </Instances>
  );
}

function Gates() {
  return (
    <>
      {GATES.map((g, i) => (
        <mesh key={i} position={g.pos}>
          <torusGeometry args={[g.r, 0.35, 12, 36]} />
          <meshStandardMaterial
            color="#2a3338"
            emissive={ACCENT}
            emissiveIntensity={0.5}
            roughness={0.5}
          />
        </mesh>
      ))}
    </>
  );
}

function DiveTower() {
  // ~180m tower with a flat launch platform. Placed off the pillar grid so it
  // never overlaps a column. Launch from the top, dive straight down.
  return (
    <group position={[30, 0, -30]}>
      <mesh position={[0, 90, 0]}>
        <boxGeometry args={[14, 180, 14]} />
        <meshStandardMaterial color="#7d848c" roughness={0.85} />
      </mesh>
      {/* flat top platform */}
      <mesh position={[0, 180.6, 0]}>
        <boxGeometry args={[20, 1.2, 20]} />
        <meshStandardMaterial color="#aeb6bf" roughness={0.7} />
      </mesh>
      {/* accent ring near the top so the launch point reads from a distance */}
      <mesh position={[0, 176, 0]}>
        <boxGeometry args={[15, 0.6, 15]} />
        <meshStandardMaterial color="#1f262b" emissive={ACCENT} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

export function Sandbox() {
  return (
    <>
      {/* sky + lights now come from <WorldEnvironment> (shared with LA mode). */}
      {/* solid floor under the grid so looking down isn't a void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[6000, 6000]} />
        <meshStandardMaterial color="#161a1f" roughness={1} />
      </mesh>

      <Grid
        position={[0, 0.0, 0]}
        infiniteGrid
        cellSize={2}
        cellThickness={0.6}
        sectionSize={20}
        sectionThickness={1.2}
        cellColor="#3a4350"
        sectionColor="#6b7686"
        fadeDistance={650}
        fadeStrength={1.5}
        followCamera={false}
      />

      <Pillars />
      <Gates />
      <DiveTower />
    </>
  );
}
