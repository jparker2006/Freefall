// LA geo-anchor for M2 (the coordinate bridge).
//
// The drone flies in a clean local Y-up meters frame whose ORIGIN is pinned to
// the lat/lon below. We do this with 3d-tiles-renderer's ReorientationPlugin
// (`recenter: true` + lat/lon): on load it transforms Google's giant ECEF tileset
// so the anchor lands at (0,0,0). The recentered frame the plugin produces is:
//
//     +Y = up        -X = geographic East        +Z = geographic North
//     (i.e. X = West, Y = Up, Z = North — right-handed)
//
// Consequences that keep the M1 flight model untouched:
//   • Gravity stays (0, -g*mass, 0) — local +Y is true "up" at the anchor.
//   • Physics runs near the origin in meters (no ECEF mega-coordinate float jitter).
//   • The OSD compass reads TRUE north via heading = atan2(-fwd.x, fwd.z)
//     (see publishTelemetry in useFlightModel.ts).
//
// Hero location: Westwood / Beverly Hills (the Westside). Approximate — fine-tune
// live by flying to a recognizable spot and reading the position. Height is metres
// above the WGS84 ellipsoid: Westwood ground ≈ 90 m MSL and the LA geoid undulation
// is ≈ -35 m, so ellipsoidal ≈ 55 m → local y≈0 sits near street level and the
// altimeter reads ≈ AGL near spawn (it is anchor-relative, not true terrain AGL).
//
// lat/lon feed the plugin in RADIANS.
import { DEG2RAD } from "../lib/mathUtils";

export const ANCHOR_LAT_DEG = 34.063;
export const ANCHOR_LON_DEG = -118.43;
export const ANCHOR_HEIGHT_M = 55;

export const ANCHOR_LAT_RAD = ANCHOR_LAT_DEG * DEG2RAD;
export const ANCHOR_LON_RAD = ANCHOR_LON_DEG * DEG2RAD;
