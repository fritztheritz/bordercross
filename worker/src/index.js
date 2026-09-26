// BorderCross — daily-score backend.
//
// The only server this app has ever had: everything else (the puzzle
// itself, stats, achievements, sharing) is computed client-side with no
// account and no network dependency at all (see the main README). This
// one endpoint exists purely to answer "how did today's route compare to
// everyone else's" — something no single browser can know on its own.
//
// Trust model: there's no auth, so a submitted score is taken at face
// value, the same way this app already trusts whatever's sitting in a
// player's own localStorage for their personal stats. The only thing this
// server actually defends against is a single browser counting itself
// twice for the same day (via the anon-id dedup table) — not someone
// deliberately spoofing a score. That's an accepted, documented trade-off
// for a free, accountless daily game, not an oversight.

import { summarizeHistogram, computePercentile } from "./percentile.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ANON_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

// bordercross.io is the only real client; localhost is for local dev
// against a deployed (or `wrangler dev`) worker.
const ALLOWED_ORIGINS = [/^https:\/\/(www\.)?bordercross\.io$/, /^http:\/\/localhost:\d+$/];

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

    // GET /players?date=YYYY-MM-DD — a plain headcount of how many players
    // have completed today's puzzle so far. Deliberately a separate,
    // unauthenticated-and-always-answerable endpoint from POST /score below:
    // the ticket header wants to show this before a player has even played
    // (so it can't wait on their own submission), and a headcount alone
    // reveals nothing that would need the MIN_SAMPLE floor /score applies
    // to its percentile/histogram — see percentile.js.
    if (request.method === "GET" && url.pathname === "/players") {
      const date = url.searchParams.get("date") || "";
      if (!DATE_RE.test(date)) return json({ error: "invalid date" }, 400, origin);

      // SUM() over zero matching rows returns SQL NULL, not 0 (a brand-new
      // day, or one nobody's finished yet) — the `|| 0` below is load-bearing.
      const { totalPlayers } = await env.DB.prepare("SELECT SUM(count) as totalPlayers FROM score_counts WHERE date_key = ?")
        .bind(date)
        .first();

      return json({ totalPlayers: totalPlayers || 0 }, 200, origin);
    }

    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, origin);
    if (url.pathname !== "/score") return json({ error: "not found" }, 404, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON" }, 400, origin);
    }

    const { date, score, anonId } = body || {};
    if (typeof date !== "string" || !DATE_RE.test(date)) return json({ error: "invalid date" }, 400, origin);
    if (!Number.isInteger(score) || score < 0 || score > 100) return json({ error: "invalid score" }, 400, origin);
    if (typeof anonId !== "string" || !ANON_ID_RE.test(anonId)) return json({ error: "invalid anonId" }, 400, origin);

    // First time this browser has reported today's puzzle: record it and
    // fold it into the day's histogram. A repeat call (reloading an
    // already-finished day, a retried request, a second tab) hits the
    // dedup table's primary key and is a no-op here — the *existing*
    // stored score is what counts, not whatever this call happened to send.
    const insert = await env.DB.prepare(
      "INSERT INTO submissions (date_key, anon_id, score, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(date_key, anon_id) DO NOTHING"
    )
      .bind(date, anonId, score, Date.now())
      .run();

    let effectiveScore = score;
    if (insert.meta.changes > 0) {
      await env.DB.prepare(
        "INSERT INTO score_counts (date_key, score, count) VALUES (?, ?, 1) ON CONFLICT(date_key, score) DO UPDATE SET count = count + 1"
      )
        .bind(date, score)
        .run();
    } else {
      const existing = await env.DB.prepare("SELECT score FROM submissions WHERE date_key = ? AND anon_id = ?")
        .bind(date, anonId)
        .first();
      if (existing) effectiveScore = existing.score;
    }

    const { results } = await env.DB.prepare("SELECT score, count FROM score_counts WHERE date_key = ? ORDER BY score")
      .bind(date)
      .all();
    const { total, lower } = summarizeHistogram(results, effectiveScore);
    const percentile = computePercentile(total, lower);

    // The histogram itself is only worth sending back once there's enough
    // of it to draw — otherwise it's just a spike at one score, not a
    // distribution. `percentile` already carries this same threshold.
    return json(
      { percentile, totalPlayers: total, histogram: percentile == null ? null : results },
      200,
      origin
    );
  },
};
