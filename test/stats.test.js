import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadStats,
  recordResult,
  resetStats,
  recordDailyOutcome,
  loadStreakStats,
  distributionBucket,
  averageMoves,
} from "../js/stats.js";
import { installLocalStorageStub } from "./helpers/localStorageStub.js";

beforeEach(() => installLocalStorageStub());

function winResult(overrides = {}) {
  return {
    status: "won",
    route: ["CA", "US", "MX", "GT"],
    playerMoves: 3,
    optimalMoves: 3,
    efficiency: 100,
    perfect: true,
    score: 100,
    timeMs: 5000,
    ...overrides,
  };
}

describe("recordResult", () => {
  test("a win updates the core counters, distribution, and exploredCodes", () => {
    const stats = recordResult(winResult());
    assert.equal(stats.gamesPlayed, 1);
    assert.equal(stats.gamesWon, 1);
    assert.equal(stats.bestScore, 100);
    assert.equal(stats.perfectRoutes, 1);
    assert.equal(stats.moveDistribution["0"], 1);
    assert.deepEqual([...stats.exploredCodes].sort(), ["CA", "GT", "MX", "US"]);
    assert.equal(stats.recentGames.length, 1);
    assert.equal(stats.recentGames[0].efficiency, 100);
  });

  test("exploredCodes accumulates as a union across multiple wins", () => {
    recordResult(winResult({ route: ["CA", "US", "MX", "GT"] }));
    const stats = recordResult(winResult({ route: ["US", "MX", "BZ"], playerMoves: 2, optimalMoves: 2 }));
    assert.deepEqual([...stats.exploredCodes].sort(), ["BZ", "CA", "GT", "MX", "US"]);
  });

  test("recentGames is capped at TREND_HISTORY_LIMIT (20)", () => {
    let stats;
    for (let i = 0; i < 25; i++) stats = recordResult(winResult({ route: ["CA", "US"], optimalMoves: 1, playerMoves: 1 }));
    assert.equal(stats.recentGames.length, 20);
  });

  test("a give-up only increments gamesPlayed/gamesGivenUp, nothing else", () => {
    const stats = recordResult({ status: "gaveup" });
    assert.equal(stats.gamesPlayed, 1);
    assert.equal(stats.gamesGivenUp, 1);
    assert.equal(stats.gamesWon, 0);
    assert.deepEqual(stats.exploredCodes, []);
  });

  test("distributionBucket folds 4+ extra moves into one bucket", () => {
    assert.equal(distributionBucket(0), "0");
    assert.equal(distributionBucket(3), "3");
    assert.equal(distributionBucket(4), "4+");
    assert.equal(distributionBucket(20), "4+");
  });
});

describe("resetStats", () => {
  test("clears both stats and the streak", () => {
    recordResult(winResult());
    recordDailyOutcome("2026-09-05", true);
    resetStats();
    const stats = loadStats();
    assert.equal(stats.gamesPlayed, 0);
    assert.equal(loadStreakStats().current, 0);
  });
});

describe("recordDailyOutcome", () => {
  test("consecutive days extend the streak; a gap resets it to 1", () => {
    recordDailyOutcome("2026-09-05", true);
    let streak = recordDailyOutcome("2026-09-06", true);
    assert.equal(streak.current, 2);
    streak = recordDailyOutcome("2026-09-10", true); // gap
    assert.equal(streak.current, 1);
  });

  test("a loss resets the current streak to 0 but keeps the max", () => {
    recordDailyOutcome("2026-09-05", true);
    recordDailyOutcome("2026-09-06", true);
    const streak = recordDailyOutcome("2026-09-07", false);
    assert.equal(streak.current, 0);
    assert.equal(streak.max, 2);
  });

  test("calling it again for the same date is a no-op", () => {
    recordDailyOutcome("2026-09-05", true);
    const before = loadStreakStats();
    recordDailyOutcome("2026-09-05", false); // should be ignored
    assert.deepEqual(loadStreakStats(), before);
  });

  test("catching up on an earlier missed day, played *after* a later day, still bridges the streak", () => {
    // Day 0 won, day 1 skipped, day 2 ("today") played and won first —
    // only afterward does the player use catch-up to go back and win the
    // missed day 1. The streak should end up recognizing four unbroken
    // days (0-3), not get stuck at 1 forever because day 1 was recorded
    // out of calendar order.
    recordDailyOutcome("2026-09-05", true); // day 0
    let streak = recordDailyOutcome("2026-09-07", true); // day 2, "today" — day 1 still missing
    assert.equal(streak.current, 1);

    streak = recordDailyOutcome("2026-09-06", true); // catch-up on day 1, played last
    assert.equal(streak.current, 3); // day 0, 1, 2 are now a contiguous win streak
    assert.equal(streak.max, 3);

    streak = recordDailyOutcome("2026-09-08", true); // day 3, played normally
    assert.equal(streak.current, 4);
    assert.equal(streak.max, 4);
  });

  test("a catch-up win can't bridge across a day that was actually lost", () => {
    recordDailyOutcome("2026-09-05", true); // day 0: won
    recordDailyOutcome("2026-09-06", false); // day 1: lost (e.g. gave up)
    let streak = recordDailyOutcome("2026-09-07", true); // day 2 ("today"): won
    assert.equal(streak.current, 1); // day 1's loss already breaks the chain

    // Catching up on day 1 isn't offered once it's already finished (see
    // canReplayYesterday in main.js), but recordDailyOutcome itself must
    // still treat an already-recorded date as a no-op rather than let a
    // second call flip day 1 from lost to won.
    streak = recordDailyOutcome("2026-09-06", true);
    assert.equal(streak.current, 1);
  });

  test("pre-existing saves without a `completed` record migrate cleanly", () => {
    // Simulates a save written by the old streak logic, before the
    // out-of-order fix — no per-day record, just the running counters.
    localStorage.setItem(
      "bordercross.streak.v1",
      JSON.stringify({ current: 3, max: 5, lastCompletedDate: "2026-09-07" })
    );
    const streak = loadStreakStats();
    assert.equal(streak.current, 3);
    assert.equal(streak.max, 5);
    // The next real day should extend the migrated streak, not reset it.
    const next = recordDailyOutcome("2026-09-08", true);
    assert.equal(next.current, 4);
    assert.equal(next.max, 5);
  });
});

describe("averageMoves", () => {
  test("shows an em dash before any win, a real average after", () => {
    assert.equal(averageMoves({ gamesWon: 0, totalMoves: 0 }), "—");
    assert.equal(averageMoves({ gamesWon: 2, totalMoves: 7 }), "3.5");
  });
});
