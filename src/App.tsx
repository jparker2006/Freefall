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
import { IS_TOUCH } from "./ui/device";
import { VirtualSticks } from "./ui/VirtualSticks";
import { TouchLookLayer } from "./ui/TouchLookLayer";
import { TouchButtons } from "./ui/TouchButtons";
import { TouchSettings } from "./ui/TouchSettings";
import { RotateGate } from "./ui/RotateGate";
import { GamepadIndicator } from "./ui/GamepadIndicator";

const Minimap = lazy(() => import("./hud/Minimap"));

export default function App() {
  const mode = useWorldStore((s) => s.mode);
  return (
    <>
      <Scene />
      <Osd />
      <TuningPanel />
      <LoadingOverlay />
      {/* Controller presence chip (auto-detected; works alongside keyboard/mouse + touch). */}
      <GamepadIndicator />
      {mode === "la" && (
        <Suspense fallback={null}>
          <Minimap />
        </Suspense>
      )}
      {/* Touch UI — never mounts on desktop, so the keyboard+mouse path is unchanged. */}
      {IS_TOUCH && <VirtualSticks />}
      {IS_TOUCH && <TouchLookLayer />}
      {IS_TOUCH && <TouchButtons />}
      {IS_TOUCH && <TouchSettings />}
      {IS_TOUCH && <RotateGate />}
    </>
  );
}
