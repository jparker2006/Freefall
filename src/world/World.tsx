// Picks the world: real Los Angeles (Google tiles) when a key is present and LA
// mode is selected, otherwise the M1 greybox sandbox. WorldEnvironment (sky/lights/
// fog) renders for both. Mounted inside <Canvas>, after the drone rig so the FPV
// camera is already the default when the tiles renderer registers it.
import { Sandbox } from "../scene/Sandbox";
import { WorldEnvironment } from "./WorldEnvironment";
import { LaTiles } from "./LaTiles";
import { GOOGLE_API_KEY, useWorldStore } from "./useWorldStore";

export function World() {
  const mode = useWorldStore((s) => s.mode);
  const showLA = mode === "la" && GOOGLE_API_KEY.length > 0;

  return (
    <>
      <WorldEnvironment />
      {showLA ? <LaTiles /> : <Sandbox />}
    </>
  );
}
