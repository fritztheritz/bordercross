import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, bfsPath } from "../js/graph.js";
import { todayKey, puzzleNumber, addDays, dailyPair } from "../js/daily.js";
import { installLocalStorageStub } from "./helpers/localStorageStub.js";

const graph = buildGraph();

beforeEach(() => installLocalStorageStub());

describe("todayKey", () => {
  test("formats as YYYY-MM-DD", () => {
    assert.equal(todayKey(new Date(2026, 8, 5)), "2026-09-05"); // month is 0-indexed
  });
});

describe("addDays", () => {
  test("shifts forward and backward across a month boundary", () => {
    assert.equal(addDays("2026-09-30", 1), "2026-10-01");
    assert.equal(addDays("2026-10-01", -1), "2026-09-30");
  });
});

describe("puzzleNumber", () => {
  test("EPOCH itself is puzzle #0, the next day is #1", () => {
    assert.equal(puzzleNumber("2026-09-05"), 0);
    assert.equal(puzzleNumber("2026-09-06"), 1);
  });

  test("before EPOCH is negative", () => {
    assert.ok(puzzleNumber("2026-09-04") < 0);
  });
});

describe("dailyPair", () => {
  test("is deterministic for the same date key", () => {
    const a = dailyPair(graph, "2026-11-01");
    const b = dailyPair(graph, "2026-11-01");
    assert.deepEqual(a, b);
  });

  test("every pair is a real, distinct, reachable pair", () => {
    for (let i = 0; i < 30; i++) {
      const key = addDays("2026-09-05", i);
      const [start, dest] = dailyPair(graph, key);
      assert.notEqual(start, dest);
      assert.ok(graph.has(start) && graph.has(dest));
    }
  });

  test("already-published days (before the difficulty-tier cutover) are frozen exactly as they shipped", () => {
    // These are the actual live values as of the 2026-09-06 tier change —
    // pinned here specifically so a future edit can't accidentally
    // change a day that already went out to players.
    assert.deepEqual(dailyPair(graph, "2026-09-05"), ["UA", "HT"]);
    assert.deepEqual(dailyPair(graph, "2026-09-06"), ["LK", "PK"]);
  });

  test("every day from the cutover onward is at least 4 moves (3 countries in between)", () => {
    for (let i = 0; i < 120; i++) {
      const key = addDays("2026-09-07", i);
      const [start, dest] = dailyPair(graph, key);
      const moves = bfsPath(graph, start, dest).length - 1;
      assert.ok(moves >= 4, `${key} (${start}->${dest}) was only ${moves} moves`);
    }
  });

  test("no unordered pair repeats within a trailing 30-day window", () => {
    const WINDOW = 30;
    const DAYS = 120;
    const pairs = [];
    for (let i = 0; i < DAYS; i++) {
      const key = addDays("2026-09-05", i);
      pairs.push(dailyPair(graph, key));
    }
    const setKey = ([a, b]) => [a, b].sort().join("|");
    for (let i = 0; i < pairs.length; i++) {
      for (let j = Math.max(0, i - WINDOW); j < i; j++) {
        assert.notEqual(
          setKey(pairs[i]),
          setKey(pairs[j]),
          `day ${i} repeats day ${j}'s pair within the ${WINDOW}-day window`
        );
      }
    }
  });
});
