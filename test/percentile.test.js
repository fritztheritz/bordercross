import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { summarizeHistogram, computePercentile, MIN_SAMPLE } from "../worker/src/percentile.js";

describe("summarizeHistogram", () => {
  test("counts total players and how many scored strictly lower", () => {
    const rows = [
      { score: 60, count: 2 },
      { score: 80, count: 3 },
      { score: 100, count: 1 },
    ];
    assert.deepEqual(summarizeHistogram(rows, 80), { total: 6, lower: 2 });
  });

  test("a tie never counts against you", () => {
    const rows = [
      { score: 100, count: 4 },
      { score: 90, count: 1 },
    ];
    assert.deepEqual(summarizeHistogram(rows, 100), { total: 5, lower: 1 });
  });
});

describe("computePercentile", () => {
  test("returns null below MIN_SAMPLE, even if you'd otherwise beat everyone", () => {
    assert.equal(computePercentile(MIN_SAMPLE - 1, MIN_SAMPLE - 1), null);
  });

  test("rounds to the nearest whole percent once the sample is large enough", () => {
    assert.equal(computePercentile(MIN_SAMPLE, 3), 60);
    assert.equal(computePercentile(3, 1), null); // still below MIN_SAMPLE
  });

  test("beating no one (lowest score of the day) is 0%, not null, once the sample qualifies", () => {
    assert.equal(computePercentile(MIN_SAMPLE, 0), 0);
  });
});
