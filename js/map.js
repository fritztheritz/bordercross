// BorderCross — route map rendering, backed by Leaflet.
//
// The base layer is a physical/terrain basemap with no political borders
// or country labels baked in — on purpose, so the map itself never gives
// away which countries are adjacent. It's a real map (pan + zoom, powered
// by Leaflet), not a custom illustration; markers use the same centroid
// coordinates as the rest of the game (js/data.js).

import { COUNTRIES } from "./data.js";

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c[0], c]));

const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTRIBUTION =
  'Basemap &copy; <a href="https://www.esri.com">Esri</a> — World Physical Map (no political borders)';

function pinIcon(className) {
  return window.L.divIcon({
    className: `map-pin ${className}`,
    html: '<span class="map-pin-dot"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const ICONS = {
  start: pinIcon("pin-start"),
  visited: pinIcon("pin-visited"),
  destPending: pinIcon("pin-dest-pending"),
  destReached: pinIcon("pin-dest-reached"),
};

export class RouteMap {
  constructor(container) {
    const L = window.L;
    this.map = L.map(container, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 7,
      zoomSnap: 0.5,
    }).setView([15, 10], 2);

    L.tileLayer(TILE_URL, { maxZoom: 7, attribution: TILE_ATTRIBUTION }).addTo(this.map);

    this.lineLayer = L.layerGroup().addTo(this.map);
    this.markerLayer = L.layerGroup().addTo(this.map);
  }

  _latLng(code) {
    const [, , lat, lon] = COUNTRY_BY_CODE.get(code);
    return [lat, lon];
  }

  /** Frames the start/destination pair. Call once per new game — the
   * player is free to pan/zoom on their own after that. */
  frame(startCode, destCode) {
    const L = window.L;
    const bounds = L.latLngBounds([this._latLng(startCode), this._latLng(destCode)]);
    this.map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 5, duration: 0.6 });
  }

  /** Redraws markers + confirmed route segments from the current game state. */
  render(game) {
    const L = window.L;
    this.lineLayer.clearLayers();
    this.markerLayer.clearLayers();

    const sequence = game.displaySequence(); // [start, ...slots(nullable), dest]
    const won = game.status === "won";

    sequence.forEach((code, i) => {
      if (code == null) return;
      const isStart = i === 0;
      const isDest = i === sequence.length - 1;
      const icon = isStart
        ? ICONS.start
        : isDest
        ? won
          ? ICONS.destReached
          : ICONS.destPending
        : ICONS.visited;
      L.marker(this._latLng(code), { icon, keyboard: false })
        .bindTooltip(game.countryName(code), { direction: "top", offset: [0, -6] })
        .addTo(this.markerLayer);
    });

    // A solid gold line is only drawn between two points that are
    // adjacent *positions* in the route and both confirmed — an
    // undiscovered slot in between breaks the line rather than implying
    // two non-adjacent finds are directly connected.
    for (let i = 0; i < sequence.length - 1; i++) {
      const a = sequence[i];
      const b = sequence[i + 1];
      if (a == null || b == null) continue;
      L.polyline([this._latLng(a), this._latLng(b)], {
        color: "#d9a441",
        weight: 3,
        opacity: 0.9,
      }).addTo(this.lineLayer);
    }
  }
}
