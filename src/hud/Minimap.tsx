// M3 minimap — a north-up MapLibre street map in the corner, expandable with M.
//
// LAZY-LOADED (see App.tsx): this module statically imports maplibre-gl, so the
// whole ~220 KB library lands in this lazy chunk and never bloats first paint.
//
// Everything geographic is absolute lat/lon, so the minimap is invariant to the
// local re-anchoring that teleport does — the drone's geo fix (from GeoPublisher)
// and the fixed roster pins just work. The map is driven IMPERATIVELY from the
// VANILLA useGeoStore.subscribe() (no React re-render at 12 Hz); only the expanded
// flag drives React (resize + overview fit).
import { useEffect, useRef } from "react";
import { Map as MlMap, Marker, LngLatBounds } from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./minimap.css";
import { useGeoStore } from "../world/useGeoStore";
import { useDroneStore } from "../drone/droneState";
import { LOCATIONS, teleportTo } from "../world/locations";
import { IS_TOUCH } from "../ui/device";

// One swappable config. Keyless OpenFreeMap vector by default; set VITE_MAP_STYLE_URL
// to a MapTiler/other style URL to upgrade. (Fallbacks if the host is unreachable:
// https://tiles.openfreemap.org/styles/{liberty,bright} — or a raster OSM style.)
const MAP_STYLE_URL =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined)?.trim() ||
  "https://tiles.openfreemap.org/styles/positron";

function makeDroneEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "ff-mm-drone";
  // neutral orientation points UP = north; setRotation(heading) aims it on a north-up map
  el.innerHTML =
    '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
    '<path d="M12 2 L19.5 21 L12 16.2 L4.5 21 Z" fill="#2bff8c" stroke="#06140d" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  return el;
}

function makePinEl(name: string, n: number): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ff-mm-pin";
  el.title = name;
  el.innerHTML = `<span class="ff-mm-pin-dot">${n}</span><span class="ff-mm-pin-label">${name}</span>`;
  return el;
}

// distinct yellow diamond, visually unlike the round green location pins
function makeWaypointEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "ff-mm-wp";
  el.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path d="M12 1.5 L22.5 12 L12 22.5 L1.5 12 Z" fill="#ffdd00" stroke="#2a2200" stroke-width="1.5"/></svg>';
  return el;
}

// GeoJSON LineString feature for the route line (drone → waypoint)
function routeData(lon1: number, lat1: number, lon2: number, lat2: number) {
  return {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: [[lon1, lat1], [lon2, lat2]] },
    properties: {},
  };
}
const EMPTY_ROUTE = { type: "FeatureCollection" as const, features: [] };

export default function Minimap() {
  const expanded = useGeoStore((s) => s.expanded);
  const paused = useDroneStore((s) => s.paused); // hidden during pause (clean capture)
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);

  // create the map once
  useEffect(() => {
    const mapDiv = hostRef.current?.querySelector<HTMLDivElement>(".ff-mm-map");
    if (!mapDiv) return;
    const start = LOCATIONS[useGeoStore.getState().activeIndex] ?? LOCATIONS[2];

    const map = new MlMap({
      container: mapDiv,
      style: MAP_STYLE_URL,
      center: [start.lon, start.lat],
      zoom: 14.5,
      bearing: 0, // north-up
      pitch: 0,
      attributionControl: { compact: true }, // OSM/OpenFreeMap credit (required)
      dragRotate: false,
      pitchWithRotate: false,
      fadeDuration: 0,
    });
    mapRef.current = map;
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disable(); // never steal number/WASD keys from flight

    // Waypoint: click empty map to place/move, right-click (or C) to clear. Pin
    // markers stopPropagation, so only empty-map clicks reach here.
    map.on("click", (e) =>
      useGeoStore.getState().setWaypoint({ lat: e.lngLat.lat, lon: e.lngLat.lng }),
    );
    map.on("contextmenu", () => useGeoStore.getState().clearWaypoint());

    // Yellow dashed route line (drone → waypoint); the source/layer need the style.
    const addRoute = () => {
      if (map.getSource("wp-route")) return;
      map.addSource("wp-route", { type: "geojson", data: EMPTY_ROUTE });
      map.addLayer({
        id: "wp-route",
        type: "line",
        source: "wp-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffdd00",
          "line-width": 3,
          "line-dasharray": [2, 1.5],
          "line-opacity": 0.9,
        },
      });
    };
    if (map.isStyleLoaded()) addRoute();
    else map.on("load", addRoute);

    const wpMarker = new Marker({ element: makeWaypointEl(), anchor: "center" });
    let wpAdded = false;

    const droneMarker = new Marker({ element: makeDroneEl(), rotationAlignment: "map" })
      .setLngLat([start.lon, start.lat])
      .addTo(map);

    LOCATIONS.forEach((L, i) => {
      const el = makePinEl(L.name, i + 1);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        teleportTo(i);
        useGeoStore.getState().setExpanded(false); // go there, drop back to the corner
      });
      new Marker({ element: el, anchor: "center" }).setLngLat([L.lon, L.lat]).addTo(map);
    });

    // imperative per-tick update — no React involved
    const unsub = useGeoStore.subscribe((s) => {
      if (!s.ready) return;
      droneMarker.setLngLat([s.lon, s.lat]);
      droneMarker.setRotation(s.heading);
      if (!s.expanded) map.setCenter([s.lon, s.lat]); // collapsed view follows the drone

      // waypoint marker + route line
      const wp = s.waypoint;
      const route = map.getSource("wp-route") as GeoJSONSource | undefined;
      if (wp) {
        wpMarker.setLngLat([wp.lon, wp.lat]);
        if (!wpAdded) {
          wpMarker.addTo(map);
          wpAdded = true;
        }
        route?.setData(routeData(s.lon, s.lat, wp.lon, wp.lat));
      } else if (wpAdded) {
        wpMarker.remove();
        wpAdded = false;
        route?.setData(EMPTY_ROUTE);
      }
    });

    return () => {
      unsub();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // expand / collapse: resize, then overview-fit (expanded) or recenter (collapsed)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = requestAnimationFrame(() => {
      map.resize();
      const g = useGeoStore.getState();
      if (expanded) {
        const b = new LngLatBounds();
        for (const L of LOCATIONS) b.extend([L.lon, L.lat]);
        if (g.ready) b.extend([g.lon, g.lat]);
        map.fitBounds(b, { padding: 56, duration: 300, maxZoom: 13 });
      } else {
        map.easeTo({
          center: g.ready ? [g.lon, g.lat] : map.getCenter(),
          zoom: 14.5,
          duration: 250,
        });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [expanded]);

  const hint = expanded
    ? IS_TOUCH
      ? "TAP A PIN · ✕ CLOSE"
      : "TAP A PIN · M / ESC CLOSE"
    : IS_TOUCH
      ? "TAP TO OPEN"
      : "M MAP";

  return (
    <div
      ref={hostRef}
      className={`ff-minimap${expanded ? " expanded" : ""}${paused ? " ff-minimap--hidden" : ""}${IS_TOUCH ? " is-touch" : ""}`}
    >
      <div className="ff-mm-map" />
      <div className="ff-mm-n">N</div>
      <div className="ff-mm-frame" />
      {/* touch: a tap anywhere on the collapsed pill opens it (so taps don't drop a
          waypoint); an explicit ✕ closes the expanded map (no ESC key on mobile). */}
      {IS_TOUCH && !expanded && (
        <button
          type="button"
          className="ff-mm-tap"
          aria-label="Open map"
          onClick={() => useGeoStore.getState().setExpanded(true)}
        />
      )}
      {IS_TOUCH && expanded && (
        <button
          type="button"
          className="ff-mm-close"
          aria-label="Close map"
          onClick={() => useGeoStore.getState().setExpanded(false)}
        >
          ✕
        </button>
      )}
      <div className="ff-mm-hint">{hint}</div>
    </div>
  );
}
