// Bordercross — route map rendering.
//
// This is a stylized cartogram, not a political map: it plots each
// country's approximate centroid on an equirectangular grid and draws the
// player's route between them. It intentionally does not ship full country
// polygon/coastline data (see README), so it favors a clean "flight path"
// look over literal borders.

import { COUNTRIES } from "./data.js";

const VB_W = 720;
const VB_H = 360;

const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function project(lat, lon) {
  const x = ((lon + 180) / 360) * VB_W;
  const y = ((90 - lat) / 180) * VB_H;
  return [x, y];
}

export class RouteMap {
  constructor(svg) {
    this.svg = svg;
    svg.setAttribute("viewBox", `0 0 ${VB_W} ${VB_H}`);
    svg.innerHTML = "";

    this.svg.appendChild(this._graticule());

    this.dotsLayer = el("g", { class: "map-dots" });
    for (const [code, , lat, lon] of COUNTRIES) {
      const [x, y] = project(lat, lon);
      const dot = el("circle", { cx: x, cy: y, r: 1.5, class: "map-bg-dot", "data-code": code });
      this.dotsLayer.appendChild(dot);
    }
    this.svg.appendChild(this.dotsLayer);

    this.pathLayer = el("g", { class: "map-path" });
    this.svg.appendChild(this.pathLayer);

    this.markerLayer = el("g", { class: "map-markers" });
    this.svg.appendChild(this.markerLayer);
  }

  _graticule() {
    const g = el("g", { class: "map-graticule" });
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x] = project(0, lon);
      g.appendChild(el("line", { x1: x, y1: 0, x2: x, y2: VB_H }));
    }
    for (let lat = -90; lat <= 90; lat += 30) {
      const [, y] = project(lat, 0);
      g.appendChild(el("line", { x1: 0, y1: y, x2: VB_W, y2: y }));
    }
    return g;
  }

  _coordsFor(code) {
    const entry = COUNTRIES.find((c) => c[0] === code);
    return project(entry[2], entry[3]);
  }

  /**
   * Renders the current route.
   * @param {string[]} route - visited codes in order (start..current)
   * @param {string} destCode
   */
  render(route, destCode) {
    this.pathLayer.innerHTML = "";
    this.markerLayer.innerHTML = "";

    const points = route.map((c) => this._coordsFor(c));
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      this.pathLayer.appendChild(el("line", { x1, y1, x2, y2, class: "route-line" }));
    }

    const destPoint = this._coordsFor(destCode);
    if (!route.includes(destCode)) {
      const [x1, y1] = points[points.length - 1];
      this.pathLayer.appendChild(
        el("line", { x1, y1, x2: destPoint[0], y2: destPoint[1], class: "route-line route-line-pending" })
      );
    }

    route.forEach((code, i) => {
      const [x, y] = points[i];
      const isStart = i === 0;
      const isCurrent = i === route.length - 1 && code !== destCode;
      const isDoneDest = code === destCode;
      let cls = "map-marker visited";
      if (isStart) cls = "map-marker start";
      if (isCurrent) cls = "map-marker current";
      if (isDoneDest) cls = "map-marker dest reached";
      this.markerLayer.appendChild(el("circle", { cx: x, cy: y, r: isCurrent ? 5 : 4, class: cls }));
    });

    if (!route.includes(destCode)) {
      const [x, y] = destPoint;
      this.markerLayer.appendChild(el("circle", { cx: x, cy: y, r: 5, class: "map-marker dest" }));
    }
  }
}
