// Pure percentile math — no D1/Workers API in here on purpose, so it can
// be unit-tested with plain Node instead of needing a live Worker/DB to
// exercise it (see test/percentile.test.js at the repo root).

// Below this many total submissions for a day, "better than X%" is more
// noise than signal (one early player would otherwise see either 0% or a
// meaningless 100%) — the caller shows nothing until the sample grows.
export const MIN_SAMPLE = 5;

/** Given the full { score, count } histogram for a day (already including
 * the just-recorded submission) and that player's own effective score,
 * returns the total sample size and how many of them scored strictly
 * lower — a tie never counts against you. */
export function summarizeHistogram(rows, ownScore) {
  let total = 0;
  let lower = 0;
  for (const { score, count } of rows) {
    total += count;
    if (score < ownScore) lower += count;
  }
  return { total, lower };
}

/** "Better than X% of today's players", or null when the sample's too
 * small to mean anything yet. */
export function computePercentile(total, lower) {
  if (total < MIN_SAMPLE) return null;
  return Math.round((lower / total) * 100);
}
