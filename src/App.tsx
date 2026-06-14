// Canvas host + HTML overlays. The 3D scene, the OSD, and the leva tuning panel
// are siblings; the OSD/panel are HTML so the text stays crisp over the canvas.
// The minimap (M3) is lazy-loaded — and only in LA mode — so the ~220 KB MapLibre
// chunk never bloats first paint nor loads in the greybox sandbox.
import { lazy, Suspense } from "react";
import { Scene } from "./scene/Scene";
import { Osd } from "./hud/Osd";
import { TuningPanel } from "./tuning/TuningPanel";
import { LoadingOverlay } from "./world/LoadingOverlay";
import { useWorldStore } from "./world/useWorldStore";

const Minimap = lazy(() => import("./hud/Minimap"));

export default function App() {
  const mode = useWorldStore((s) => s.mode);
  return (
    <>
      <Scene />
      <Osd />
      <TuningPanel />
      <LoadingOverlay />
      {mode === "la" && (
        <Suspense fallback={null}>
          <Minimap />
        </Suspense>
      )}
    </>
  );
}
