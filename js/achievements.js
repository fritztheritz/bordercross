// BorderCross — achievements.
//
// No new gameplay tracking here: every definition just reads a snapshot
// of data that already exists — the persisted stats/streak, the Game
// instance just finished, and its result. Storage is only the set of
// unlocked ids.

const STORAGE_KEY = "bordercross.achievements.v1";

export const ACHIEVEMENTS = [
  {
    id: "first-win",
    icon: "🎉",
    title: "First Crossing",
    description: "Win your first route.",
    check: ({ stats }) => stats.gamesWon >= 1,
  },
  {
    id: "perfect-1",
    icon: "🏆",
    title: "Perfect Route",
    description: "Complete a route with zero wasted moves.",
    check: ({ result }) => result?.status === "won" && result.perfect,
  },
  {
    id: "perfect-10",
    icon: "🎯",
    title: "Precision Navigator",
    description: "Complete 10 perfect routes.",
    check: ({ stats }) => stats.perfectRoutes >= 10,
  },
  {
    id: "hard-win",
    icon: "🌍",
    title: "Globetrotter",
    description: "Win a Hard-difficulty route.",
    check: ({ game, result }) => result?.status === "won" && game?.difficulty === "Hard",
  },
  {
    id: "marathon",
    icon: "🥾",
    title: "Marathoner",
    description: "Complete a route of 10 or more moves.",
    check: ({ result }) => result?.status === "won" && result.playerMoves >= 10,
  },
  {
    id: "no-hints-hard",
    icon: "🧭",
    title: "Iron Will",
    description: "Win a Hard route without using a hint.",
    check: ({ game, result }) => result?.status === "won" && game?.difficulty === "Hard" && result.hintsUsed === 0,
  },
  {
    id: "restriction-win",
    icon: "🚧",
    title: "Detour Master",
    description: "Win a route with a restriction in play.",
    check: ({ game, result }) => result?.status === "won" && game?.restrictedCodes?.size > 0,
  },
  {
    id: "streak-3",
    icon: "🔥",
    title: "On a Roll",
    description: "Reach a 3-day streak.",
    check: ({ streak }) => (streak?.current ?? 0) >= 3,
  },
  {
    id: "streak-7",
    icon: "🔥",
    title: "Weekly Regular",
    description: "Reach a 7-day streak.",
    check: ({ streak }) => (streak?.max ?? 0) >= 7,
  },
  {
    id: "streak-30",
    icon: "🔥",
    title: "Creature of Habit",
    description: "Reach a 30-day streak.",
    check: ({ streak }) => (streak?.max ?? 0) >= 30,
  },
  {
    id: "dedicated",
    icon: "✈️",
    title: "Frequent Flyer",
    description: "Play 25 games.",
    check: ({ stats }) => stats.gamesPlayed >= 25,
  },
  {
    id: "century",
    icon: "🗺️",
    title: "World Traveler",
    description: "Play 100 games.",
    check: ({ stats }) => stats.gamesPlayed >= 100,
  },
];

export function loadUnlocked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveUnlocked(unlocked) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
  } catch {
    // Storage unavailable — unlocks just won't persist.
  }
}

/**
 * Runs every not-yet-unlocked definition against `ctx` — pass whatever's
 * relevant: `{ stats, streak, game, result }`. Persists and returns only
 * the achievements unlocked *by this call*, so a caller can show a "just
 * unlocked" toast without re-announcing ones from a previous game.
 */
export function checkAchievements(ctx) {
  const unlocked = loadUnlocked();
  const newlyUnlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (unlocked.has(achievement.id)) continue;
    if (achievement.check(ctx)) {
      unlocked.add(achievement.id);
      newlyUnlocked.push(achievement);
    }
  }
  if (newlyUnlocked.length > 0) saveUnlocked(unlocked);
  return newlyUnlocked;
}

export function resetAchievements() {
  saveUnlocked(new Set());
}
