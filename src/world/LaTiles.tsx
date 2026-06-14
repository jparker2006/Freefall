// Los Angeles — Google Photorealistic 3D Tiles, georeferenced under the unchanged
// M1 flight model. The coordinate bridge is the ReorientationPlugin (recenters the
// anchor lat/lon to the local origin, +Y up, +Z north — see anchor.ts), so physics
// stay in clean local meters near the origin.
//
// Plugins:
//   GoogleCloudAuthPlugin — auth + resolves Google's root tileset URL.
//   GLTFExtensionsPlugin  — DRACO + KTX2 decoders (Google tiles are compressed).
//   ReorientationPlugin   — pins anchor lat/lon to the origin, Y-up (the bridge).
//   TileCompressionPlugin — shrinks GPU memory.
//   UnloadTilesPlugin     — frees offscreen tiles (bounded memory on long flights).
//   TilesFadePlugin       — cross-fades LOD transitions instead of hard pop-in.
//
// <TilesAttributionOverlay> is REQUIRED by Google's ToS (visible, dynamic credits).
import { useContext, useEffect, useMemo, useRef } from "react";
import type { Ref } from "react";
import { useThree } from "@react-three/fiber";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import {
  TilesRenderer,
  TilesPlugin,
  TilesAttributionOverlay,
  TilesRendererContext,
} from "3d-tiles-renderer/r3f";
import {
  GoogleCloudAuthPlugin,
  GLTFExtensionsPlugin,
  ReorientationPlugin,
  TileCompressionPlugin,
  UnloadTilesPlugin,
  TilesFadePlugin,
} from "3d-tiles-renderer/plugins";
import { GOOGLE_API_KEY, useWorldStore } from "./useWorldStore";
import { ANCHOR_LAT_RAD, ANCHOR_LON_RAD, ANCHOR_HEIGHT_M } from "./anchor";
import { GeoPublisher } from "./GeoPublisher";
import { IS_TOUCH } from "../ui/device";

const GIGABYTE = 1024 ** 3;

// Tighten the tile LRU byte budget so offscreen tiles unload sooner. Kept behind a function
// boundary (taking the instance as a plain object) so it reads as configuring the renderer,
// not mutating React state.
function applyMobileTileBudget(tilesInstance: object): void {
  const cache = (tilesInstance as { lruCache?: { minBytesSize: number; maxBytesSize: number } })
    .lruCache;
  if (cache) {
    cache.minBytesSize = 0.1 * GIGABYTE; // ~107 MB
    cache.maxBytesSize = 0.2 * GIGABYTE; // ~215 MB — full → unload kicks in
  }
}

// Touch-only: mobile GPUs have far less memory than the M-series desktops the defaults
// (0.3/0.4 GB) target. The dpr cap is the primary headroom lever (see Scene); this is
// belt-and-suspenders.
function MobileTileBudget(): null {
  const tiles = useContext(TilesRendererContext);
  useEffect(() => {
    if (tiles) applyMobileTileBudget(tiles);
  }, [tiles]);
  return null;
}

// Flips the loading overlay off once tiles settle — for BOTH the initial load and
// every M3 teleport (re-anchor). It re-arms whenever `loadEpoch` changes (teleport
// bumps it). The initial load (epoch 0) additionally falls back to the sandbox on a
// root/auth failure (bad key, quota). Teleport can't use load-tileset (it only ever
// fires for the first root), so the gate keys off tiles-load-start/-end + a settle
// debounce for the LOD cascade + a "nothing-to-load" fast path (already-cached
// region emits no start) + a 20 s failsafe.
function TilesLoadingTracker(): null {
  const tiles = useContext(TilesRendererContext);
  const loadEpoch = useWorldStore((s) => s.loadEpoch);
  useEffect(() => {
    if (!tiles) return;
    const initial = loadEpoch === 0;
    let rootOk = false;
    let sawStart = false;
    let done = false;
    let settleTimer = 0;
    let poll = 0;
    let failsafe = 0;

    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(settleTimer);
      window.clearTimeout(failsafe);
      window.clearInterval(poll);
      useWorldStore.getState().setLoading(false);
    };
    const armSettle = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(finish, 450); // let the coarse→fine cascade quiet
    };
    const onTileset = () => {
      rootOk = true;
    };
    const onStart = () => {
      sawStart = true;
      window.clearTimeout(settleTimer);
    };
    const onEnd = () => {
      if (initial || sawStart) armSettle();
    };
    const onError = () => {
      if (initial && !rootOk) {
        // auth/quota before the first root ever loads ⇒ sandbox. Teleport-time
        // errors (root already up) are transient and ignored.
        useWorldStore.getState().reportTileError();
        finish();
      }
    };

    tiles.addEventListener("load-tileset", onTileset);
    tiles.addEventListener("tiles-load-start", onStart);
    tiles.addEventListener("tiles-load-end", onEnd);
    tiles.addEventListener("load-error", onError);

    const startedAt = performance.now();
    poll = window.setInterval(() => {
      if (done) return;
      if (!sawStart && performance.now() - startedAt > 700 && tiles.loadProgress >= 0.95) finish();
    }, 150);
    failsafe = window.setTimeout(finish, 20000); // never trap the overlay

    return () => {
      tiles.removeEventListener("load-tileset", onTileset);
      tiles.removeEventListener("tiles-load-start", onStart);
      tiles.removeEventListener("tiles-load-end", onEnd);
      tiles.removeEventListener("load-error", onError);
      window.clearTimeout(settleTimer);
      window.clearTimeout(failsafe);
      window.clearInterval(poll);
    };
  }, [tiles, loadEpoch]);
  return null;
}

export function LaTiles() {
  const gl = useThree((s) => s.gl);
  const errorTarget = useWorldStore((s) => s.errorTarget);
  // Captured plugin instance — its name field is unset so getPluginByName() can't
  // find it; the ref is the supported way to reach transformLatLonHeightToOrigin()
  // for teleport (see GeoPublisher → worldBridge → locations.teleportTo).
  const reorientRef = useRef<ReorientationPlugin>(null);

  // Decoders for the compressed Google glTF tiles. KTX2 needs the WebGL renderer
  // to detect transcoder support, so this lives inside the Canvas. Paths point at
  // the transcoders vendored into /public (see public/draco, public/basis).
  const { dracoLoader, ktx2Loader } = useMemo(() => {
    const draco = new DRACOLoader().setDecoderPath("/draco/");
    const ktx2 = new KTX2Loader().setTranscoderPath("/basis/");
    ktx2.detectSupport(gl);
    return { dracoLoader: draco, ktx2Loader: ktx2 };
  }, [gl]);

  useEffect(
    () => () => {
      dracoLoader.dispose();
      ktx2Loader.dispose();
    },
    [dracoLoader, ktx2Loader],
  );

  return (
    <TilesRenderer errorTarget={errorTarget}>
      <TilesPlugin plugin={GoogleCloudAuthPlugin} args={[{ apiToken: GOOGLE_API_KEY }]} />
      <TilesPlugin
        plugin={GLTFExtensionsPlugin}
        args={[{ dracoLoader, ktxLoader: ktx2Loader }]}
      />
      <TilesPlugin
        // The r3f wrapper forwards the plugin INSTANCE to the ref, but its types
        // declare the constructor — cast through unknown so reorientRef holds the
        // instance (whose transformLatLonHeightToOrigin teleport calls).
        ref={reorientRef as unknown as Ref<typeof ReorientationPlugin>}
        plugin={ReorientationPlugin}
        args={[
          { lat: ANCHOR_LAT_RAD, lon: ANCHOR_LON_RAD, height: ANCHOR_HEIGHT_M, recenter: true },
        ]}
      />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UnloadTilesPlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      {/* Google credit (ToS, must stay visible). Desktop: bottom-left above the stick
          cluster. Touch: bottom-center, clear of the bottom-corner thumb zones. */}
      <TilesAttributionOverlay
        style={
          IS_TOUCH
            ? { left: "50%", bottom: 4, right: "auto", transform: "translateX(-50%)" }
            : { left: 12, bottom: 128, right: "auto" }
        }
      />
      {IS_TOUCH && <MobileTileBudget />}
      <TilesLoadingTracker />
      <GeoPublisher reorientRef={reorientRef} />
    </TilesRenderer>
  );
}
