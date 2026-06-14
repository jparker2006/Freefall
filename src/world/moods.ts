// Atmosphere presets ("mood"). M2 ships clean daylight only, but the shape is a
// swappable config so golden-hour etc. + a user-facing selector are a later config
// addition, not a rewrite. Applied by <WorldEnvironment> to sky, fill light, fog.
//
// IMPORTANT: Google's photorealistic tiles already bake real capture lighting into
// their textures, so we DON'T relight them hard — the directional sun is gentle on
// purpose (a strong one double-lights and flattens the photogrammetry). The greybox
// sandbox shares the same rig; it just reads a touch flatter, fine for a tuning aid.
//
// fog "far" is NOT stored here — <WorldEnvironment> derives it from the live
// drawDistance so haze and draw distance stay coherent (tune the trio together).

export type MoodName = "daylight";

export type MoodConfig = {
  background: string; // fallback behind the sky
  sky: { sunPosition: [number, number, number]; turbidity: number; rayleigh: number };
  sun: { position: [number, number, number]; intensity: number; color: string };
  hemi: { sky: string; ground: string; intensity: number };
  ambient: number;
  fog: { color: string; near: number }; // far derived from drawDistance
};

export const MOODS: Record<MoodName, MoodConfig> = {
  daylight: {
    background: "#aec4dc",
    sky: { sunPosition: [-120, 90, 80], turbidity: 4, rayleigh: 1.1 },
    sun: { position: [-120, 160, 80], intensity: 0.9, color: "#fff4e6" },
    hemi: { sky: "#cfe0f2", ground: "#6a685f", intensity: 0.55 },
    ambient: 0.5,
    fog: { color: "#c2cedb", near: 700 },
  },
};
