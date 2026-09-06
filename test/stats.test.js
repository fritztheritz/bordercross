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
});

describe("averageMoves", () => {
  test("shows an em dash before any win, a real average after", () => {
    assert.equal(averageMoves({ gamesWon: 0, totalMoves: 0 }), "—");
    assert.equal(averageMoves({ gamesWon: 2, totalMoves: 7 }), "3.5");
  });
});
