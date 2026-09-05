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
//
// A run can optionally carry `restrictedCodes` — countries the shortest
// path is not allowed to pass through at all. When present, every
// distance/path computation below runs against a graph with those
// countries (and every edge touching them) removed, so "optimal" always
// means "optimal given the restriction," never a route that cheats past it.

import { COUNTRY_BY_CODE } from "./graph.js";
import { bfsPath, bfsDistances, difficultyFor, graphExcluding } from "./graph.js";
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

  /** Starts a new run between two country codes. `restrictedCodes` (if
   * given) are off-limits for the whole route — every distance and path
   * below is computed against the graph with those countries removed. */
  start(startCode, destCode, { restrictedCodes = [] } = {}) {
    this.restrictedCodes = new Set(restrictedCodes);
    const effectiveGraph = this.restrictedCodes.size > 0 ? graphExcluding(this.graph, this.restrictedCodes) : this.graph;

    const optimalPath = bfsPath(effectiveGraph, startCode, destCode);
    this.startCode = startCode;
    this.destCode = destCode;
    this.optimalPath = optimalPath;
    this.optimalMoves = optimalPath.length - 1;
    this.difficulty = difficultyFor(this.optimalMoves);
    this.distFromStart = bfsDistances(effectiveGraph, startCode);
    this.distFromDest = bfsDistances(effectiveGraph, destCode);

    // One slot per intermediate step on the route (excludes start & dest).
    this.slotCount = Math.max(0, this.optimalMoves - 1);
    this.slots = new Array(this.slotCount).fill(null);
    this.guessedCodes = new Set();
    this.wrongGuesses = new Set(); // guesses that resolved to a real country, but aren't on any shortest path
    this.guessLog = []; // every move-costing guess in order made: { result: "correct"|"redundant"|"wrong"|"arrival", code }
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
      this.guessLog.push({ result: "arrival", code: destCode });
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

    if (this.restrictedCodes.has(code)) {
      this.wrongGuesses.add(code);
      this.totalMoves += 1;
      this.guessLog.push({ result: "wrong", code });
      return { ok: false, reason: "restricted", code };
    }

    const layer = this.layerOf(code);
    if (layer == null) {
      this.wrongGuesses.add(code);
      this.totalMoves += 1;
      this.guessLog.push({ result: "wrong", code });
      return { ok: false, reason: "not-on-path", code };
    }

    this.guessedCodes.add(code);
    this.totalMoves += 1;
    const slotIndex = layer - 1;
    const isNewSlot = this.slots[slotIndex] == null;
    if (isNewSlot) this.slots[slotIndex] = code;
    this.guessLog.push({ result: isNewSlot ? "correct" : "redundant", code });

    if (this.allSlotsFilled) {
      // The final hop onto the destination is automatic, but still counts
      // as a move — otherwise a flawless run would tally one move short of
      // optimalMoves and never register as "perfect".
      this.totalMoves += 1;
      this.guessLog.push({ result: "arrival", code: this.destCode });
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

  /** Ordered 🟩/🟨 (and, for a given-up run, trailing ⬛) squares built
   * from the actual guess sequence — wrong/redundant guesses show up
   * exactly where they happened, not lumped at the end. */
  shareSquares() {
    const squares = this.guessLog.map((entry) => (entry.result === "correct" || entry.result === "arrival" ? "🟩" : "🟨")).join("");
    if (this.status === "won") return squares;
    return squares + "⬛".repeat(this.slotCount - this.slotsFilled);
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

/**
 * Rolls whether this run gets a "restrictions" twist and, if so, which
 * countries are off-limits. Candidates are drawn only from the *unrestricted*
 * shortest path's own intermediate steps, so a restriction always forces a
 * real detour rather than banning some country the route wouldn't have
 * touched anyway. Falls back to no restriction if every attempt would blow
 * the route up past `maxExtraMoves` (some countries are load-bearing enough
 * — Panama, say — that banning them makes the "shortest" path absurd), or
 * if the base route falls outside [minBaseMoves, maxBaseMoves]: a very long
 * route (say, one crossing continents via the Bering Strait) is already
 * abstract enough that banning one more country along it reads as random
 * rather than as a real detour a player can reason about, so restrictions
 * are scoped to routes short enough that the twist stays graspable.
 *
 * @param {() => number} rng - a 0..1 random source; pass a seeded one for
 *   deterministic challenges (the daily), or Math.random for one-off runs.
 */
export function pickRestrictions(graph, startCode, destCode, rng = Math.random, opts = {}) {
  const { chance = 0.35, maxCount = 2, maxExtraMoves = 4, minBaseMoves = 3, maxBaseMoves = 6 } = opts;

  const basePath = bfsPath(graph, startCode, destCode);
  if (!basePath) return [];
  const baseMoves = basePath.length - 1;
  if (baseMoves < minBaseMoves || baseMoves > maxBaseMoves) return [];
  const intermediates = basePath.slice(1, -1);
  if (intermediates.length === 0) return []; // start/dest already adjacent — nothing to ban

  if (rng() >= chance) return [];

  for (let attempt = 0; attempt < 6; attempt++) {
    const count = Math.min(maxCount, intermediates.length, 1 + Math.floor(rng() * maxCount));
    const pool = [...intermediates];
    const picked = [];
    for (let i = 0; i < count && pool.length; i++) {
      picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }

    const restrictedGraph = graphExcluding(graph, picked);
    const newPath = bfsPath(restrictedGraph, startCode, destCode);
    if (newPath && newPath.length - 1 <= baseMoves + maxExtraMoves) {
      return picked;
    }
  }
  return []; // couldn't find a reasonable restriction set for this pair — play it straight
}
