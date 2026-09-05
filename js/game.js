// Bordercross — game state machine and scoring.
//
// This module has no DOM dependency: it only knows about the graph and
// the rules. ui.js drives it and renders the results.

import { COUNTRY_BY_CODE } from "./graph.js";
import { bfsPath, bfsDistances, connectionType, difficultyFor } from "./graph.js";
import { resolveCountry } from "./lookup.js";

const HINT_PENALTY = 15;

/** Score for a completed run. Tune here — nothing else depends on the shape. */
export function scoreFor({ optimalMoves, playerMoves, hintsUsed }) {
  const extraMoves = Math.max(0, playerMoves - optimalMoves);
  const base = Math.max(0, 100 - extraMoves * 10);
  return Math.max(0, base - hintsUsed * HINT_PENALTY);
}

export function efficiencyFor({ optimalMoves, playerMoves }) {
  return Math.round((optimalMoves / playerMoves) * 100);
}

export class Game {
  constructor(graph) {
    this.graph = graph;
  }

  /** Starts a new run between two country codes. */
  start(startCode, destCode) {
    const optimalPath = bfsPath(this.graph, startCode, destCode);
    this.startCode = startCode;
    this.destCode = destCode;
    this.optimalPath = optimalPath;
    this.optimalMoves = optimalPath.length - 1;
    this.difficulty = difficultyFor(this.optimalMoves);
    this.route = [startCode];
    this.visited = new Set([startCode]);
    this.current = startCode;
    this.hintsUsed = 0;
    this.startedAt = null;
    this.finishedAt = null;
    this.status = "playing"; // "playing" | "won" | "gaveup"
    return this;
  }

  /** Result shape: { ok, reason?, code?, connection?, won? } */
  attemptMove(rawInput) {
    if (this.status !== "playing") return { ok: false, reason: "not-playing" };
    if (this.startedAt == null) this.startedAt = Date.now();

    const country = resolveCountry(rawInput);
    if (!country) return { ok: false, reason: "unrecognized", input: rawInput };

    const code = country[0];
    if (code === this.current) return { ok: false, reason: "current", code };
    if (this.visited.has(code)) return { ok: false, reason: "visited", code };

    const connection = connectionType(this.graph, this.current, code);
    if (!connection) return { ok: false, reason: "not-connected", code, from: this.current };

    this.route.push(code);
    this.visited.add(code);
    this.current = code;

    if (code === this.destCode) {
      this.status = "won";
      this.finishedAt = Date.now();
      return { ok: true, code, connection, won: true };
    }
    return { ok: true, code, connection, won: false };
  }

  /** Cheap hint: whether the next move must be a land or sea link is not
   * revealed — only how many countries remain on the *optimal* route from
   * here, without naming them. */
  hint() {
    if (this.status !== "playing") return null;
    this.hintsUsed += 1;
    const remaining = bfsDistances(this.graph, this.current).get(this.destCode);
    return { remaining, hintsUsed: this.hintsUsed };
  }

  giveUp() {
    if (this.status !== "playing") return;
    this.status = "gaveup";
    this.finishedAt = Date.now();
  }

  result() {
    const playerMoves = this.route.length - 1;
    const timeMs = this.startedAt && this.finishedAt ? this.finishedAt - this.startedAt : null;
    if (this.status === "won") {
      return {
        status: "won",
        route: this.route,
        playerMoves,
        optimalMoves: this.optimalMoves,
        optimalPath: this.optimalPath,
        hintsUsed: this.hintsUsed,
        score: scoreFor({ optimalMoves: this.optimalMoves, playerMoves, hintsUsed: this.hintsUsed }),
        efficiency: efficiencyFor({ optimalMoves: this.optimalMoves, playerMoves }),
        perfect: playerMoves === this.optimalMoves,
        timeMs,
      };
    }
    return {
      status: "gaveup",
      route: this.route,
      optimalMoves: this.optimalMoves,
      optimalPath: this.optimalPath,
    };
  }

  countryName(code) {
    return COUNTRY_BY_CODE.get(code)[1];
  }
}

/** Picks a random (start, destination) pair with a "fun" difficulty range. */
export function randomPair(graph, { minMoves = 2, maxMoves = 8 } = {}) {
  const codes = [...graph.keys()];
  for (let attempt = 0; attempt < 40; attempt++) {
    const start = codes[Math.floor(Math.random() * codes.length)];
    const distances = bfsDistances(graph, start);
    const candidates = codes.filter((c) => {
      const d = distances.get(c);
      return d !== undefined && d >= minMoves && d <= maxMoves;
    });
    if (candidates.length > 0) {
      const dest = candidates[Math.floor(Math.random() * candidates.length)];
      return [start, dest];
    }
  }
  // Fallback: any reachable pair at all (graph is fully connected, so this
  // only triggers if the range above was pathologically narrow).
  const start = codes[Math.floor(Math.random() * codes.length)];
  const distances = bfsDistances(graph, start);
  const reachable = codes.filter((c) => c !== start && distances.has(c));
  const dest = reachable[Math.floor(Math.random() * reachable.length)];
  return [start, dest];
}
