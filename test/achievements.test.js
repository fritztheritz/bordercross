import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ACHIEVEMENTS, checkAchievements, resetAchievements, loadUnlocked } from "../js/achievements.js";
import { installLocalStorageStub } from "./helpers/localStorageStub.js";

beforeEach(() => installLocalStorageStub());

describe("checkAchievements", () => {
  test("unlocks 'first-win' the moment gamesWon reaches 1, and only reports it once", () => {
    const stats = { gamesWon: 1, gamesPlayed: 1 };
    const firstCall = checkAchievements({ stats });
    assert.ok(firstCall.some((a) => a.id === "first-win"));

    const secondCall = checkAchievements({ stats }); // same stats, already unlocked
    assert.ok(!secondCall.some((a) => a.id === "first-win"));
    assert.ok(loadUnlocked().has("first-win"));
  });

  test("explorer thresholds read stats.exploredCodes.length", () => {
    const few = checkAchievements({ stats: { exploredCodes: new Array(10).fill("x") } });
    assert.ok(!few.some((a) => a.id === "explorer-50"));

    const many = checkAchievements({ stats: { exploredCodes: new Array(50).fill("x") } });
    assert.ok(many.some((a) => a.id === "explorer-50"));
    assert.ok(!many.some((a) => a.id === "explorer-150"));

    const most = checkAchievements({ stats: { exploredCodes: new Array(150).fill("x") } });
    assert.ok(most.some((a) => a.id === "explorer-150"));
  });

  test("every achievement id is unique", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("resetAchievements", () => {
  test("clears every unlocked id", () => {
    checkAchievements({ stats: { gamesWon: 1, gamesPlayed: 1 } });
    assert.ok(loadUnlocked().size > 0);
    resetAchievements();
    assert.equal(loadUnlocked().size, 0);
  });
});
