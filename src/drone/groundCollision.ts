// Ground collision — the ONLY collision in Freefall. A single downward raycast per
// frame finds the surface directly beneath the drone; the physics step then rests the
// drone on it. You keep flying *freely through the city* and only stop when you descend
// onto whatever is directly below you.
//
// Why downward-only IS "ground, not buildings": Google's photoreal tiles fuse terrain
// and buildings into ONE mesh — there is no separate "ground" layer to test against. A
// ray cast straight down can only ever hit a surface below the drone, so building *sides*
// never block you (you phase through them horizontally as before); the one expected side
// effect is that descending onto a rooftop rests you on the roof. That's the deal, and
// it's fine.
//
// Fail-safe: if the ray finds nothing — e.g. tiles for this area haven't streamed in yet
// — we report "no ground" and the step skips the clamp, so the drone is never trapped or
// snapped to a wrong height; it just keeps flying as it did before this feature existed.
import * as THREE from "three";
import { drone } from "./droneState";
import { worldBridge } from "../world/geo";
import { useWorldStore } from "../world/useWorldStore";

// `firstHitOnly` is read by 3d-tiles-renderer's raycast for early-out BVH traversal,
// but it isn't part of three's Raycaster type — declare it locally.
type FirstHitRaycaster = THREE.Raycaster & { firstHitOnly?: boolean };

// Drone "footprint" offset: the body center rests this far above the surface so the FPV
// camera sits just above ground (the photoreal mesh is bumpy — a meter-plus of margin
// keeps the view from dipping under it). Spec: "a small radius offset (a meter or two)".
export const GROUND_OFFSET = 1.5;

// Greybox sandbox (M1): the floor plane + grid sit at y = 0.
const SANDBOX_GROUND_Y = 0;

// module scratch — single-threaded useFrame, allocation-free hot path
const _raycaster: FirstHitRaycaster = new THREE.Raycaster();
_raycaster.firstHitOnly = true; // nearest surface only → early-out traversal
_raycaster.ray.direction.set(0, -1, 0); // straight down; never changes
const _hits: THREE.Intersection[] = [];

// Per-frame ground sample, shared with the fixed-step clamp below.
let groundActive = false; // false ⇒ no known surface ⇒ free flight (skip the clamp)
let groundY = 0; // world-Y of the surface directly beneath the drone

// Touchdown edge tracking for haptics: capture the descent speed at the moment the drone
// first contacts the surface (airborne → grounded), so the controller can rumble scaled to
// how hard the landing was. Purely observational — does not affect the clamp.
let wasGrounded = false;
let pendingImpact: number | null = null;

// Cast straight down from the drone and cache the surface height. Call ONCE per rendered
// frame — NOT per 120 Hz substep: the ground doesn't move and the drone travels < ~1 m a
// frame, so one ray is plenty and ~8× cheaper than sampling every substep. The cached
// value then feeds every substep's clamp.
export function sampleGroundUnderDrone(): void {
  // Sandbox (incl. the LA→sandbox fallback on a missing/invalid key): a flat ground plane.
  if (useWorldStore.getState().mode === "sandbox") {
    groundActive = true;
    groundY = SANDBOX_GROUND_Y;
    return;
  }

  // LA mode: raycast the live 3D tiles. Until the tileset is anchored (the group is given
  // its ECEF-scale translation — same readiness check the geo helpers use), or if nothing
  // is loaded directly below, treat it as "no ground" → free flight.
  const tiles = worldBridge.tiles;
  if (!tiles || tiles.group.position.lengthSq() <= 1) {
    groundActive = false;
    return;
  }

  // Origin AT the drone center (not above it). A downward ray from here can only hit
  // surfaces below, so flying *under* a roof never snaps us up onto it. The sample is taken
  // while the drone is still above ground (start of frame), so the substep clamp catches
  // the descent before it can penetrate — the origin never ends up below the surface.
  _raycaster.ray.origin.copy(drone.position);
  _hits.length = 0;
  // group.raycast delegates to the renderer's optimized first-hit traversal (and returns
  // before three recurses into the tile children) — see TilesGroup.raycast.
  tiles.group.raycast(_raycaster, _hits);

  if (_hits.length > 0) {
    groundActive = true;
    groundY = _hits[0].point.y;
  } else {
    groundActive = false; // nothing streamed in below → keep flying (fail-safe)
  }
  _hits.length = 0;
}

// Rest the drone on the sampled surface. Called at the end of each fixed substep, AFTER
// position integration. When the body center descends within GROUND_OFFSET of the surface,
// pin it there and zero velocity so it simply stops and rests. Throttling back up makes
// thrust > gravity → the integrated position rises above the rest height → the clamp no
// longer fires → normal lift-off, with no extra take-off logic.
export function clampToGround(): void {
  if (!groundActive) {
    wasGrounded = false;
    return;
  }
  const restY = groundY + GROUND_OFFSET;
  if (drone.position.y < restY) {
    if (!wasGrounded) {
      // fresh touchdown: record the downward speed (−vy) before we zero it, for haptics.
      const descent = -drone.velocity.y;
      if (descent > 0) pendingImpact = descent;
      wasGrounded = true;
    }
    drone.position.y = restY;
    drone.velocity.set(0, 0, 0);
  } else {
    wasGrounded = false; // back in the air → re-arm the next touchdown
  }
}

// Returns the descent speed (m/s) of the most recent fresh touchdown exactly once, then
// null. Polled by the gamepad layer to fire rumble scaled to landing force; ignored
// (drained harmlessly) when no controller is present.
export function consumeGroundImpact(): number | null {
  const v = pendingImpact;
  pendingImpact = null;
  return v;
}
