// Bordercross — game state machine and scoring.
//
// This module has no DOM dependency: it only knows about the graph and
// the rules. ui.js drives it and renders the results.
//
// Rule: a guess is accepted if the country lies on *some* shortest path
// between the start and destination — not only if it's adjacent to
// wherever the player currently is. That membership test is the standard
// BFS one: `v` is on a shortest path iff
//   distFromStart(v) + distFromDest(v) === optimalMoves
// Guesses can therefore be made in any order — naming "Mexico" before
// "United States" for a Canada -> Guatemala run is just as valid as the
// reverse, as long as both are eventually found. Each accepted guess is
// slotted into its correct position (its distance from the start) so the
// displayed route is always shown in the right order regardless of the
// order it was discovered in.

import { COUNTRY_BY_CODE } from "./graph.js";
import { bfsPath, bfsDistances, difficultyFor } from "./graph.js";
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
    this.distFromStart = bfsDistances(this.graph, startCode);
    this.distFromDest = bfsDistances(this.graph, destCode);

    // One slot per intermediate step on the route (excludes start & dest).
    this.slotCount = Math.max(0, this.optimalMoves - 1);
    this.slots = new Array(this.slotCount).fill(null);
    this.guessedCodes = new Set();
    this.acceptedGuesses = 0; // slot fills + redundant valid alternates + the final dest entry
    this.hintsUsed = 0;
    this.startedAt = null;
    this.finishedAt = null;
    this.status = "playing"; // "playing" | "won" | "gaveup"
    return this;
  }

  get slotsFilled() {
    return this.slots.filter((s) => s != null).length;
  }

  get allSlotsFilled() {
    return this.slotsFilled === this.slotCount;
  }

  /** 1-indexed distance-from-start of `code` if it lies on some shortest
   * path, or null otherwise. */
  layerOf(code) {
    const ds = this.distFromStart.get(code);
    const dd = this.distFromDest.get(code);
    if (ds === undefined || dd === undefined) return null;
    if (ds + dd !== this.optimalMoves) return null;
    if (ds < 1 || ds > this.optimalMoves - 1) return null;
    return ds;
  }

  /** Result shape varies by outcome — see call sites in main.js. */
  attemptMove(rawInput) {
    if (this.status !== "playing") return { ok: false, reason: "not-playing" };
    if (this.startedAt == null) this.startedAt = Date.now();

    const country = resolveCountry(rawInput);
    if (!country) return { ok: false, reason: "unrecognized", input: rawInput };
    const code = country[0];

    if (code === this.startCode) return { ok: false, reason: "is-start", code };

    if (code === this.destCode) {
      if (!this.allSlotsFilled) {
        return { ok: false, reason: "too-early", code, remaining: this.slotCount - this.slotsFilled };
      }
      this.acceptedGuesses += 1;
      this.status = "won";
      this.finishedAt = Date.now();
      return { ok: true, code, won: true };
    }

    if (this.guessedCodes.has(code)) return { ok: false, reason: "already-found", code };

    const layer = this.layerOf(code);
    if (layer == null) return { ok: false, reason: "not-on-path", code };

    this.guessedCodes.add(code);
    this.acceptedGuesses += 1;
    const slotIndex = layer - 1;
    const isNewSlot = this.slots[slotIndex] == null;
    if (isNewSlot) this.slots[slotIndex] = code;

    return { ok: true, code, slotIndex, isNewSlot, remaining: this.slotCount - this.slotsFilled };
  }

  /** Cheap hint: how many countries are still unfound, without naming them. */
  hint() {
    if (this.status !== "playing") return null;
    this.hintsUsed += 1;
    return { remaining: this.slotCount - this.slotsFilled, hintsUsed: this.hintsUsed };
  }

  giveUp() {
    if (this.status !== "playing") return;
    this.status = "gaveup";
    this.finishedAt = Date.now();
  }

  /** [start, ...slots (nullable), dest] — always the right length/order. */
  displaySequence() {
    return [this.startCode, ...this.slots, this.destCode];
  }

  result() {
    const playerMoves = this.acceptedGuesses;
    const timeMs = this.startedAt && this.finishedAt ? this.finishedAt - this.startedAt : null;
    if (this.status === "won") {
      return {
        status: "won",
        route: this.displaySequence(),
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
      route: this.displaySequence().filter((code) => code != null),
      optimalMoves: this.optimalMoves,
      optimalPath: this.optimalPath,
    };
  }

  countryName(code) {
    return COUNTRY_BY_CODE.get(code)[1];
  }
}

/** Picks a random (start, destination) pair with a "fun" difficulty range. */
export function randomPair(graph, { minMoves = 2, maxMoves = 14 } = {}) {
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
