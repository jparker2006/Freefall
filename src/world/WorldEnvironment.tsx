// Atmosphere for both worlds (LA + sandbox): sky, sun + fill light, and fog/bg
// from the active MoodConfig. Lives inside <Canvas>. Centralizing this here is why
// Sandbox.tsx no longer carries its own Sky/lights.
//
// fog far is derived from the live draw distance so the far city fades into haze
// right before the far plane (this is what hides distant-tile z-fighting — we
// deliberately do NOT use a logarithmic depth buffer because three's Sky shader
// has no log-depth support and would render wrong).
import { Sky } from "@react-three/drei";
import { useWorldStore } from "./useWorldStore";
import { MOODS } from "./moods";

export function WorldEnvironment() {
  const moodName = useWorldStore((s) => s.mood);
  const drawDistance = useWorldStore((s) => s.drawDistance);
  const m = MOODS[moodName];
  const fogFar = Math.max(m.fog.near + 400, drawDistance * 0.95);

  return (
    <>
      <color attach="background" args={[m.background]} />
      <fog attach="fog" args={[m.fog.color, m.fog.near, fogFar]} />
      <Sky
        sunPosition={m.sky.sunPosition}
        turbidity={m.sky.turbidity}
        rayleigh={m.sky.rayleigh}
      />
      <hemisphereLight args={[m.hemi.sky, m.hemi.ground, m.hemi.intensity]} />
      <ambientLight intensity={m.ambient} />
      <directionalLight
        position={m.sun.position}
        intensity={m.sun.intensity}
        color={m.sun.color}
      />
    </>
  );
}
