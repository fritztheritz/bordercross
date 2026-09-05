// BorderCross — game state machine and scoring.
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
    this.wrongGuesses = new Set(); // guesses that resolved to a real country, but aren't on any shortest path
    this.totalMoves = 0; // every guess that "costs" something: slot fills, wrong guesses, redundant alternates
    this.hintsUsed = 0;
    this.startedAt = null;
    this.finishedAt = null;
    this.status = "playing"; // "playing" | "won" | "gaveup"

    // Start and destination already directly connected — nothing to find.
    // totalMoves is still set to 1 (matching optimalMoves) so scoring and
    // the "perfect route" check stay consistent with every other case.
    if (this.slotCount === 0) {
      this.status = "won";
      this.totalMoves = 1;
      this.startedAt = this.finishedAt = Date.now();
    }
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

  /** Result shape varies by outcome — see call sites in main.js. The
   * destination is never a guess: the game recognizes the route as
   * complete automatically the moment the last intermediate slot fills.
   *
   * A wrong guess (a real country that isn't on any shortest path) still
   * costs a move, same as a redundant one — otherwise a run full of wild
   * guesses could still land "100% efficient" just by eventually finding
   * every step. Trivial slips (re-typing the start, guessing the
   * destination before it's reachable, repeating a find, or a typo that
   * doesn't resolve to any country) don't cost anything — they're not
   * really guesses about the puzzle. */
  attemptMove(rawInput) {
    if (this.status !== "playing") return { ok: false, reason: "not-playing" };
    if (this.startedAt == null) this.startedAt = Date.now();

    const country = resolveCountry(rawInput);
    if (!country) return { ok: false, reason: "unrecognized", input: rawInput };
    const code = country[0];

    if (code === this.startCode) return { ok: false, reason: "is-start", code };
    if (code === this.destCode) return { ok: false, reason: "is-dest", code };
    if (this.guessedCodes.has(code)) return { ok: false, reason: "already-found", code };

    const layer = this.layerOf(code);
    if (layer == null) {
      this.wrongGuesses.add(code);
      this.totalMoves += 1;
      return { ok: false, reason: "not-on-path", code };
    }

    this.guessedCodes.add(code);
    this.totalMoves += 1;
    const slotIndex = layer - 1;
    const isNewSlot = this.slots[slotIndex] == null;
    if (isNewSlot) this.slots[slotIndex] = code;

    if (this.allSlotsFilled) {
      // The final hop onto the destination is automatic, but still counts
      // as a move — otherwise a flawless run would tally one move short of
      // optimalMoves and never register as "perfect".
      this.totalMoves += 1;
      this.status = "won";
      this.finishedAt = Date.now();
      return { ok: true, code, slotIndex, isNewSlot, remaining: 0, won: true };
    }

    return { ok: true, code, slotIndex, isNewSlot, remaining: this.slotCount - this.slotsFilled };
  }

  /** A hint reveals the region of the earliest still-unfound step —
   * concrete enough to actually help, without naming the country. */
  hint() {
    if (this.status !== "playing") return null;
    this.hintsUsed += 1;
    const emptyIndex = this.slots.findIndex((s) => s == null);
    if (emptyIndex === -1) return { remaining: 0, hintsUsed: this.hintsUsed };
    const revealCode = this.optimalPath[emptyIndex + 1];
    const region = COUNTRY_BY_CODE.get(revealCode)[4];
    return {
      remaining: this.slotCount - this.slotsFilled,
      stepNumber: emptyIndex + 1,
      region,
      hintsUsed: this.hintsUsed,
    };
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
    const playerMoves = this.totalMoves;
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
