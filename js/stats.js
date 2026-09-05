// Bordercross — local statistics tracking.
//
// Stored entirely in localStorage; no account required. The shape here is
// deliberately flat so a future accounts/database layer can sync the same
// fields without a migration.

const STORAGE_KEY = "bordercross.stats.v1";
const STREAK_KEY = "bordercross.streak.v1";

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
  };
}

function emptyStreak() {
  return { current: 0, max: 0, lastCompletedDate: null };
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStats();
    return { ...emptyStats(), ...JSON.parse(raw) };
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
    if (result.timeMs != null) {
      stats.fastestTimeMs =
        stats.fastestTimeMs == null ? result.timeMs : Math.min(stats.fastestTimeMs, result.timeMs);
    }
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
    return raw ? { ...emptyStreak(), ...JSON.parse(raw) } : emptyStreak();
  } catch {
    return emptyStreak();
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

function daysBetween(earlierDateKey, laterDateKey) {
  const a = new Date(`${earlierDateKey}T00:00:00`);
  const b = new Date(`${laterDateKey}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

/**
 * Records the outcome of a single day's Classic challenge. Call exactly
 * once per completion (win or give-up) — calling it again for a date
 * that's already recorded is a no-op, so restoring an already-finished
 * day on reload never double-counts.
 */
export function recordDailyOutcome(dateKey, won) {
  const streak = loadStreak();
  if (streak.lastCompletedDate === dateKey) return streak;

  if (won) {
    const gapDays = streak.lastCompletedDate ? daysBetween(streak.lastCompletedDate, dateKey) : null;
    streak.current = gapDays === 1 ? streak.current + 1 : 1;
    streak.max = Math.max(streak.max, streak.current);
  } else {
    streak.current = 0;
  }
  streak.lastCompletedDate = dateKey;

  saveStreak(streak);
  return streak;
}
