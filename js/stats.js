// Bordercross — local statistics tracking.
//
// Stored entirely in localStorage; no account required. The shape here is
// deliberately flat so a future accounts/database layer can sync the same
// fields without a migration.

const STORAGE_KEY = "bordercross.stats.v1";

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
  return emptyStats();
}
