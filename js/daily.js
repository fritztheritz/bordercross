// BorderCross — the daily challenge.
//
// Classic mode is a single, fixed puzzle per calendar day (in the
// player's own local timezone), the same for every player on that day —
// same idea as Wordle. The puzzle is derived deterministically from the
// date string itself (no server, no fetch): a seeded PRNG means anyone
// opening the app on the same day, anywhere, computes the same start and
// destination independently.

import { bfsDistances } from "./graph.js";
import { pickRestrictions } from "./game.js";

const STORAGE_PREFIX = "bordercross.daily.";
const KEEP_DAYS = 30; // how much history to retain in localStorage

// Day 1 of the daily challenge. Only used to number puzzles ("#1", "#2", ...).
const EPOCH = "2026-01-01";

// Weighted difficulty mix for the daily pick — skews toward Medium so most
// days feel substantial without every day being a slog.
const DIFFICULTY_TIERS = [
  { minMoves: 2, maxMoves: 4, weight: 0.25 }, // Easy
  { minMoves: 5, maxMoves: 9, weight: 0.5 }, // Medium
  { minMoves: 10, maxMoves: 20, weight: 0.25 }, // Hard
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// mulberry32 — small, fast, deterministic PRNG from a 32-bit seed.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickTier(rng) {
  const r = rng();
  let cumulative = 0;
  for (const tier of DIFFICULTY_TIERS) {
    cumulative += tier.weight;
    if (r < cumulative) return tier;
  }
  return DIFFICULTY_TIERS[DIFFICULTY_TIERS.length - 1];
}

/** Today's date key in the player's local timezone, e.g. "2026-09-05". */
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function puzzleNumber(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const epoch = new Date(`${EPOCH}T00:00:00`);
  const day = new Date(y, m - 1, d);
  return Math.round((day - epoch) / 86400000) + 1;
}

export function msUntilNextMidnight(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next.getTime() - date.getTime());
}

export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Deterministic (start, destination) pair for a given date key — every
 * player computing this for the same day gets the same puzzle. Mirrors
 * randomPair()'s candidate-range logic in game.js, but seeded, and picks
 * its move-count range from the weighted Easy/Medium/Hard mix above
 * instead of one fixed range. */
export function dailyPair(graph, dateKey) {
  const rng = mulberry32(hashString(dateKey));
  const tier = pickTier(rng);
  const codes = [...graph.keys()].sort();

  for (let attempt = 0; attempt < 60; attempt++) {
    const start = codes[Math.floor(rng() * codes.length)];
    const distances = bfsDistances(graph, start);
    const candidates = codes.filter((c) => {
      const d = distances.get(c);
      return d !== undefined && d >= tier.minMoves && d <= tier.maxMoves;
    });
    if (candidates.length > 0) {
      const dest = candidates[Math.floor(rng() * candidates.length)];
      return [start, dest];
    }
  }
  // Fallback: any reachable pair (the graph is fully connected, so this
  // only triggers if the range above was pathologically narrow).
  const start = codes[Math.floor(rng() * codes.length)];
  const distances = bfsDistances(graph, start);
  const reachable = codes.filter((c) => c !== start && distances.has(c));
  const dest = reachable[Math.floor(rng() * reachable.length)];
  return [start, dest];
}

/** Deterministic restrictions for the day's pair — seeded independently of
 * dailyPair() (a different hash input) so tweaking one never perturbs the
 * other's random sequence. Same 35% chance / up to 2 countries as any
 * other mode; see pickRestrictions() in game.js for the actual rule. */
export function dailyRestrictions(graph, dateKey, startCode, destCode) {
  const rng = mulberry32(hashString(dateKey + ":restrictions"));
  return pickRestrictions(graph, startCode, destCode, rng);
}

export function loadDailyState(dateKey) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + dateKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDailyState(dateKey, state) {
  try {
    localStorage.setItem(STORAGE_PREFIX + dateKey, JSON.stringify(state));
  } catch {
    // Storage unavailable — progress just won't survive a reload.
  }
  pruneOldDailyStates(dateKey);
}

function pruneOldDailyStates(currentKey) {
  try {
    const cutoff = new Date(currentKey);
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(STORAGE_PREFIX)) continue;
      const dateKey = key.slice(STORAGE_PREFIX.length);
      const date = new Date(dateKey);
      if (!Number.isNaN(date.getTime()) && date < cutoff) localStorage.removeItem(key);
    }
  } catch {
    // Non-fatal housekeeping — skip silently if localStorage enumeration fails.
  }
}
