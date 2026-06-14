// M3 orientation state — the live geographic fix + the minimap/nav UI state, kept
// separate from useWorldStore (streaming) and useTuning (flight). Written by the
// in-Canvas GeoPublisher (~12 Hz) and read two ways:
//   • the minimap subscribes with the VANILLA useGeoStore.subscribe() and updates
//     its marker imperatively — no React re-render at 12 Hz.
//   • the OSD reads the display fields with selectors, so its readouts re-render
//     only when a shown value actually changes.
import { create } from "zustand";

export type GeoSnapshot = {
  lat: number; // deg — current drone position
  lon: number; // deg
  heading: number; // deg, 0..360 true-north
  neighborhood: string; // current place name (already upper-cased)
  targetName: string; // nav target
  targetDistanceMi: number; // miles (rounded to 0.1)
  targetBearingDeg: number; // deg (rounded)
};

export type Waypoint = { lat: number; lon: number };
export type Chevron = { visible: boolean; x: number; y: number; angle: number };

type GeoStore = GeoSnapshot & {
  ready: boolean; // first valid geo fix obtained (LA tiles anchored)
  expanded: boolean; // minimap expanded to the large tap-friendly view
  activeIndex: number; // roster index of the current spawn (R returns here)
  targetSel: number; // -1 = auto/nearest, else a roster index
  waypoint: Waypoint | null; // custom guide mark (overrides the nav target when set)
  chevron: Chevron; // off-screen waypoint pointer (screen px + rotation), driven by WaypointGuide
  publish: (s: GeoSnapshot) => void;
  setExpanded: (v: boolean) => void;
  toggleExpanded: () => void;
  setActiveIndex: (i: number) => void;
  setTargetSel: (i: number) => void;
  setWaypoint: (w: Waypoint) => void;
  clearWaypoint: () => void;
  setChevron: (c: Chevron) => void;
};

export const useGeoStore = create<GeoStore>((set) => ({
  lat: 0,
  lon: 0,
  heading: 0,
  neighborhood: "LOS ANGELES",
  targetName: "",
  targetDistanceMi: 0,
  targetBearingDeg: 0,
  ready: false,
  expanded: false,
  activeIndex: 2, // Westwood — the M2 default spawn (LOCATIONS[2])
  targetSel: -1,
  waypoint: null,
  chevron: { visible: false, x: 0, y: 0, angle: 0 },
  publish: (s) => set({ ...s, ready: true }),
  setExpanded: (v) => set({ expanded: v }),
  toggleExpanded: () => set((st) => ({ expanded: !st.expanded })),
  setActiveIndex: (i) => set({ activeIndex: i }),
  setTargetSel: (i) => set({ targetSel: i }),
  setWaypoint: (w) => set({ waypoint: w }),
  clearWaypoint: () => set({ waypoint: null }),
  setChevron: (c) => set({ chevron: c }),
}));
