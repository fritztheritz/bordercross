// BorderCross — "better than X% of today's players."
//
// The only network-dependent feature in the app: everything else (the
// puzzle itself, stats, sharing) works fully offline (see sw.js), but
// comparing against other players needs a live tally of what they
// scored, which no single browser can know on its own. Submitting always
// fails silently — a slow or unreachable API just means the comparison
// doesn't appear that time, never a broken result screen.
//
// There's no account system anywhere in this app, so "who's already
// played today" is tracked by a random per-browser id rather than any
// real identity — same trust model the rest of the app already applies
// to local stats (nothing stops a player from editing their own
// localStorage either). The id only prevents one browser from being
// counted twice for the same day; see worker/src/index.js for the
// server side of that.

const API_URL = "https://bordercross-scores.bordercross-scores-worker.workers.dev/score";
const ANON_ID_KEY = "bordercross.anonId";
const REQUEST_TIMEOUT_MS = 5000;

function anonId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID(); // storage unavailable — still fine for one request
  }
}

/**
 * Submits today's score and returns how it stacks up. Always safe to
 * await and ignore a null result (network failure, timeout, or a sample
 * too small for the comparison to mean anything yet).
 * @returns {Promise<{percentile: number, totalPlayers: number, histogram: {score:number,count:number}[]|null}|null>}
 */
export async function submitDailyScore(dateKey, score) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateKey, score, anonId: anonId() }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.percentile !== "number") return null;
    return { percentile: data.percentile, totalPlayers: data.totalPlayers, histogram: data.histogram || null };
  } catch {
    return null;
  }
}
