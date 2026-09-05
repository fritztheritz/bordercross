// BorderCross — connection graph + shortest-path logic
//
// The graph is built once from data.js and is the single source of truth
// both for validating a player's moves and for computing the "optimal"
// route — so the two can never disagree.

import { COUNTRIES, LAND_EDGES, SEA_EDGES } from "./data.js";

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c[0], c]));

function haversineKm(a, b) {
  const [, , lat1, lon1] = a;
  const [, , lat2, lon2] = b;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function addEdge(map, a, b, type) {
  if (!map.has(a)) map.set(a, new Map());
  if (!map.has(b)) map.set(b, new Map());
  if (!map.get(a).has(b)) map.get(a).set(b, type);
  if (!map.get(b).has(a)) map.get(b).set(a, type);
}

/**
 * Builds the adjacency graph: Map<code, Map<neighborCode, "land"|"sea">>.
 * Guarantees every country has at least one edge: any country left with
 * zero connections after land + curated sea edges are applied is linked
 * to its single geographically nearest neighbor (a documented, fixed
 * fallback rule — not a way to silently connect everything to everything).
 */
export function buildGraph() {
  const graph = new Map();
  for (const [code] of COUNTRIES) graph.set(code, new Map());

  for (const [a, b] of LAND_EDGES) addEdge(graph, a, b, "land");
  for (const [a, b] of SEA_EDGES) addEdge(graph, a, b, "sea");

  for (const country of COUNTRIES) {
    const code = country[0];
    if (graph.get(code).size > 0) continue;
    let nearest = null;
    let nearestDist = Infinity;
    for (const other of COUNTRIES) {
      if (other[0] === code) continue;
      const d = haversineKm(country, other);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = other[0];
      }
    }
    if (nearest) addEdge(graph, code, nearest, "sea");
  }

  return graph;
}

/** Breadth-first shortest path. Returns an array of codes, or null. */
export function bfsPath(graph, start, end) {
  if (start === end) return [start];
  const prev = new Map([[start, null]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    if (current === end) break;
    for (const neighbor of graph.get(current).keys()) {
      if (!prev.has(neighbor)) {
        prev.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }
  if (!prev.has(end)) return null;
  const path = [];
  let node = end;
  while (node !== null) {
    path.unshift(node);
    node = prev.get(node);
  }
  return path;
}

/** Breadth-first distances from `start` to every reachable country. */
export function bfsDistances(graph, start) {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const neighbor of graph.get(current).keys()) {
      if (!dist.has(neighbor)) {
        dist.set(neighbor, dist.get(current) + 1);
        queue.push(neighbor);
      }
    }
  }
  return dist;
}

/** Returns a copy of `graph` with `excludedCodes` (and every edge touching
 * them) removed — the basis for "restricted" challenges, where a shortest
 * path has to route around a handful of off-limits countries. */
export function graphExcluding(graph, excludedCodes) {
  const excluded = new Set(excludedCodes);
  const filtered = new Map();
  for (const [code, edges] of graph) {
    if (excluded.has(code)) continue;
    const filteredEdges = new Map();
    for (const [neighbor, type] of edges) {
      if (!excluded.has(neighbor)) filteredEdges.set(neighbor, type);
    }
    filtered.set(code, filteredEdges);
  }
  return filtered;
}

export function connectionType(graph, a, b) {
  const edges = graph.get(a);
  return edges ? edges.get(b) ?? null : null;
}

export function difficultyFor(optimalMoves) {
  if (optimalMoves <= 4) return "Easy";
  if (optimalMoves <= 9) return "Medium";
  return "Hard";
}

// Coarse practice-region groupings for Unlimited mode's region filter,
// built from each country's finer `region` field (js/data.js) — which
// stays granular (22 values, e.g. "Southeastern Europe") because that's
// what makes a good hint. A dropdown wants far fewer, broader choices, so
// they're bucketed here into one extra layer rather than exposing all 22.
export const REGION_GROUPS = {
  americas: { label: "Americas", regions: ["North America", "Central America", "Caribbean", "South America"] },
  europe: {
    label: "Europe",
    regions: ["Northern Europe", "Southern Europe", "Western Europe", "Eastern Europe", "Southeastern Europe"],
  },
  middleEastCaucasus: { label: "Middle East & Caucasus", regions: ["Middle East", "Caucasus"] },
  africa: {
    label: "Africa",
    regions: ["North Africa", "West Africa", "Central Africa", "East Africa", "Southern Africa", "Indian Ocean Islands"],
  },
  asia: { label: "Asia", regions: ["Central Asia", "South Asia", "East Asia", "Southeast Asia"] },
  oceania: { label: "Oceania", regions: ["Oceania"] },
};

/** Country codes belonging to a REGION_GROUPS key, or null for an unknown
 * key — callers treat null the same as "no filter". */
export function codesInRegionGroup(groupKey) {
  const group = REGION_GROUPS[groupKey];
  if (!group) return null;
  const regionSet = new Set(group.regions);
  const codes = new Set();
  for (const country of COUNTRIES) {
    if (regionSet.has(country[4])) codes.add(country[0]);
  }
  return codes;
}
