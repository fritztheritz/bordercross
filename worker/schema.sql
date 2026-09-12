-- BorderCross daily-score backend.
--
-- Two tables, deliberately not "one row per play forever":
--
-- `submissions` exists only to answer "has this browser already counted
-- itself for this day?" — one row per (date_key, anon_id), so a retry, a
-- reload of an already-finished day, or a second tab can't inflate the
-- count. `anon_id` is a random per-browser id (see js/percentile.js), not
-- a real identity — there's no login anywhere in this app.
--
-- `score_counts` is the actual leaderboard data: a histogram of how many
-- players got each score (0-100) on a given day. Aggregated rather than
-- one row per player, so the table stays tiny (at most 101 rows per day)
-- and nothing beyond "N players scored 87 today" is ever stored.

CREATE TABLE IF NOT EXISTS submissions (
  date_key TEXT NOT NULL,
  anon_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (date_key, anon_id)
);

CREATE TABLE IF NOT EXISTS score_counts (
  date_key TEXT NOT NULL,
  score INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date_key, score)
);

CREATE INDEX IF NOT EXISTS idx_score_counts_date ON score_counts(date_key);
