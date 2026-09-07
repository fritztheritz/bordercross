// BorderCross — local statistics tracking.
//
// Stored entirely in localStorage; no account required. The shape here is
// deliberately flat so a future accounts/database layer can sync the same
// fields without a migration.

import { addDays } from "./daily.js";

const STORAGE_KEY = "bordercross.stats.v1";
const STREAK_KEY = "bordercross.streak.v1";

// How many of the most recently-completed calendar days the streak keeps a
// per-day win/loss record for (see `completed` in emptyStreak() below).
// Bounded so a long-time player's save file can't grow forever — generous
// enough that no realistic real streak's trailing chain ever gets truncated.
const COMPLETED_HISTORY_LIMIT = 1000;

// Buckets extra moves beyond optimal for the distribution chart — "0" is
// a perfect run, "4+" folds in everything from 4 extra moves up so a
// single wild game can't stretch the chart indefinitely.
export const DISTRIBUTION_BUCKETS = ["0", "1", "2", "3", "4+"];

// How many of the most recent wins the trend chart keeps around. Bounded so
// the stats blob (and the chart itself) can't grow indefinitely for a
// long-time player.
export const TREND_HISTORY_LIMIT = 20;

function emptyDistribution() {
  return Object.fromEntries(DISTRIBUTION_BUCKETS.map((b) => [b, 0]));
}

function emptyStats() {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    gamesGivenUp: 0,
    bestScore: 0,
    totalMoves: 0,
    totalOptimalMoves: 0,
    totalEfficiency: 0,
    perfectRoutes: 0,
    longestRouteCompleted: 0,
    fastestTimeMs: null,
    moveDistribution: emptyDistribution(),
    lastBucket: null,
    exploredCodes: [], // every country that's appeared in a completed (won) route, ever
    recentGames: [], // last TREND_HISTORY_LIMIT wins: { efficiency, ts } — oldest first, for the trend chart
  };
}

export function distributionBucket(extraMoves) {
  return extraMoves >= 4 ? "4+" : String(extraMoves);
}

function emptyStreak() {
  // `completed` is a { [dateKey]: won } record of recently-decided daily
  // challenges — the source of truth `current`/`lastCompletedDate` are
  // recomputed from on every write (see recordDailyOutcome), rather than
  // incrementally trusting whatever order completions happened to arrive
  // in. That matters because of catch-up (main.js): a player can finish
  // *today's* puzzle, then go back and finish an earlier missed day
  // afterward, recording that earlier date's outcome out of calendar
  // order — trusting call order there would treat the earlier win as a
  // "gap" and wrongly reset the streak instead of bridging it in.
  return { current: 0, max: 0, lastCompletedDate: null, completed: {} };
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw);
    return {
      ...emptyStats(),
      ...parsed,
      moveDistribution: { ...emptyDistribution(), ...(parsed.moveDistribution || {}) },
    };
  } catch {
    return emptyStats();
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — stats just won't persist.
  }
}

/** Records a finished game (won or given up) and returns the updated stats. */
export function recordResult(result) {
  const stats = loadStats();
  stats.gamesPlayed += 1;

  if (result.status === "won") {
    stats.gamesWon += 1;
    stats.bestScore = Math.max(stats.bestScore, result.score);
    stats.totalMoves += result.playerMoves;
    stats.totalOptimalMoves += result.optimalMoves;
    stats.totalEfficiency += result.efficiency;
    if (result.perfect) stats.perfectRoutes += 1;
    stats.longestRouteCompleted = Math.max(stats.longestRouteCompleted, result.playerMoves);
    const bucket = distributionBucket(Math.max(0, result.playerMoves - result.optimalMoves));
    stats.moveDistribution[bucket] = (stats.moveDistribution[bucket] || 0) + 1;
    stats.lastBucket = bucket;
    if (result.timeMs != null) {
      stats.fastestTimeMs =
        stats.fastestTimeMs == null ? result.timeMs : Math.min(stats.fastestTimeMs, result.timeMs);
    }

    const explored = new Set(stats.exploredCodes || []);
    for (const code of result.route) explored.add(code);
    stats.exploredCodes = [...explored];

    stats.recentGames = [...(stats.recentGames || []), { efficiency: result.efficiency, ts: Date.now() }].slice(
      -TREND_HISTORY_LIMIT
    );
  } else {
    stats.gamesGivenUp += 1;
  }

  saveStats(stats);
  return stats;
}

export function averageMoves(stats) {
  return stats.gamesWon ? (stats.totalMoves / stats.gamesWon).toFixed(1) : "—";
}

export function averageEfficiency(stats) {
  return stats.gamesWon ? Math.round(stats.totalEfficiency / stats.gamesWon) + "%" : "—";
}

export function formatTime(ms) {
  if (ms == null) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function resetStats() {
  saveStats(emptyStats());
  saveStreak(emptyStreak());
  return emptyStats();
}

// ---------- Daily streak ----------
//
// Tracked separately from the general stats above because it only makes
// sense for the daily challenge (Classic mode) — Unlimited/Custom games
// don't advance or break it.

function loadStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return emptyStreak();
    const streak = { ...emptyStreak(), ...JSON.parse(raw) };
    streak.completed = { ...(streak.completed || {}) };

    // Migration for saves from before `completed` existed: back-fill it
    // from exactly what `current`/`lastCompletedDate` already mean — the
    // `current` most recent calendar days up to and including
    // lastCompletedDate were wins (and, if the streak was already broken,
    // lastCompletedDate itself was a loss) — so future out-of-order
    // catch-up completions still recompute correctly without needing this
    // player's actual full history.
    if (streak.lastCompletedDate && Object.keys(streak.completed).length === 0) {
      if (streak.current > 0) {
        for (let i = 0; i < streak.current; i++) {
          streak.completed[addDays(streak.lastCompletedDate, -i)] = true;
        }
      } else {
        streak.completed[streak.lastCompletedDate] = false;
      }
    }
    return streak;
  } catch {
    return emptyStreak();
  }
}

/** Keeps the per-day record from growing forever — trims the oldest dates
 * once it exceeds COMPLETED_HISTORY_LIMIT entries. */
function pruneCompletedHistory(streak) {
  const dates = Object.keys(streak.completed);
  if (dates.length <= COMPLETED_HISTORY_LIMIT) return;
  dates.sort();
  for (const date of dates.slice(0, dates.length - COMPLETED_HISTORY_LIMIT)) {
    delete streak.completed[date];
  }
}

function saveStreak(streak) {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  } catch {
    // Storage unavailable — streak just won't persist.
  }
}

export function loadStreakStats() {
  return loadStreak();
}

/**
 * Records the outcome of a single day's Classic challenge. Call exactly
 * once per completion (win or give-up) — calling it again for a date
 * that's already recorded is a no-op, so restoring an already-finished
 * day on reload never double-counts.
 *
 * `current` is recomputed from the per-day `completed` record every call,
 * walking backward one calendar day at a time from whichever recorded date
 * is chronologically most recent, rather than incrementally extending
 * whatever the previous call left behind. That recomputation (instead of a
 * `daysBetween(lastCompletedDate, dateKey) === 1` check) is what makes an
 * out-of-order catch-up completion — finishing today's puzzle, then going
 * back for an earlier missed day — land in the right place: the earlier
 * win gets slotted in by its own date, and the chain through today is
 * re-walked from scratch instead of having already been (wrongly) decided
 * when today was recorded first.
 */
export function recordDailyOutcome(dateKey, won) {
  const streak = loadStreak();
  if (Object.prototype.hasOwnProperty.call(streak.completed, dateKey)) return streak;

  streak.completed[dateKey] = won;
  pruneCompletedHistory(streak);

  const mostRecent = Object.keys(streak.completed).sort().pop();
  let current = 0;
  let cursor = mostRecent;
  while (streak.completed[cursor]) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  streak.current = current;
  streak.max = Math.max(streak.max, current);
  streak.lastCompletedDate = mostRecent;

  saveStreak(streak);
  return streak;
}
