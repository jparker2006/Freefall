// The FPV "lens" — one custom postprocessing effect that does the whole GoPro/
// analog-goggle look in a single pass, with every knob driven live from the
// tuning store (and speed blur folded in from the live ground speed):
//   • barrel / fisheye distortion (samples inward near the edges → bulge)
//   • chromatic aberration (radial channel split, stronger toward the edges)
//   • vignette (dark corners)
//   • optional radial speed blur (off at motionBlur = 0)
//
// Instantiated once and mounted via <primitive> so the EffectComposer collects
// it; uniforms are updated in useFrame, so the pass is never rebuilt.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { Effect, BlendFunction } from "postprocessing";
import { Uniform } from "three";
import { useTuning } from "../tuning/tuningStore";
import { drone } from "../drone/droneState";

const fragment = /* glsl */ `
uniform float barrel;
uniform float chroma;
uniform float vignette;
uniform float speedBlur;

// Sample the scene with an optional cheap radial blur along 'dir'.
vec3 sampleScene(in vec2 p, in vec2 dir, in float sb) {
  vec3 acc = texture2D(inputBuffer, p).rgb;
  if (sb <= 0.001) return acc;
  float total = 1.0;
  for (int i = 1; i <= 4; i++) {
    float t = float(i) / 4.0 * sb * 0.06;
    acc += texture2D(inputBuffer, p - dir * t).rgb;
    acc += texture2D(inputBuffer, p + dir * t).rgb;
    total += 2.0;
  }
  return acc / total;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);

  // barrel: pull samples toward center near the edges → fisheye bulge
  vec2 baseUv = 0.5 + c * (1.0 - barrel * r2);

  // chromatic aberration: split channels radially, growing toward the edges
  vec2 caOff = c * chroma * (0.5 + r2) * 3.0;
  vec3 col;
  col.r = sampleScene(baseUv + caOff, c, speedBlur).r;
  col.g = sampleScene(baseUv, c, speedBlur).g;
  col.b = sampleScene(baseUv - caOff, c, speedBlur).b;

  // vignette: darken the corners
  float vig = 1.0 - vignette * smoothstep(0.15, 0.5, r2);

  outputColor = vec4(col * vig, inputColor.a);
}
`;

class FpvLensEffectImpl extends Effect {
  constructor() {
    super("FpvLensEffect", fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform<number>>([
        ["barrel", new Uniform(0.3)],
        ["chroma", new Uniform(0.0008)],
        ["vignette", new Uniform(0.5)],
        ["speedBlur", new Uniform(0.0)],
      ]),
    });
  }
}

export function Effects() {
  const { effect, u } = useMemo(() => {
    const e = new FpvLensEffectImpl();
    return {
      effect: e,
      u: {
        barrel: e.uniforms.get("barrel")!,
        chroma: e.uniforms.get("chroma")!,
        vignette: e.uniforms.get("vignette")!,
        speedBlur: e.uniforms.get("speedBlur")!,
      },
    };
  }, []);

  useFrame(() => {
    const p = useTuning.getState();
    // Writing shader-uniform values every frame is the intended r3f pattern; the
    // react-hooks immutability rule doesn't model GPU uniforms, so opt out here.
    /* eslint-disable react-hooks/immutability */
    u.barrel.value = p.barrel;
    u.chroma.value = p.chroma;
    u.vignette.value = p.vignette;
    const gs = Math.hypot(drone.velocity.x, drone.velocity.z);
    u.speedBlur.value = p.motionBlur * Math.min(gs / 35, 1);
    /* eslint-enable react-hooks/immutability */
  });

  return (
    <EffectComposer>
      <primitive object={effect} />
    </EffectComposer>
  );
}
