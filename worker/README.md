# bordercross-scores

The one server this app has. Everything else in BorderCross (the puzzle
itself, stats, achievements, sharing) runs entirely client-side with no
account and no network dependency — see the repo root README. This is a
tiny Cloudflare Worker + D1 database that exists purely to answer "how did
today's score compare to everyone else's," which no single browser can
know on its own. It's used by exactly one place in the frontend:
`js/percentile.js`.

If this Worker is ever unreachable, deleted, or simply not deployed yet,
the frontend fails silently — the "better than X%" comparison just
doesn't appear. Nothing else in the game depends on it.

## One-time setup

You'll need a (free) Cloudflare account. From this `worker/` directory:

```
npx wrangler login          # opens a browser to authenticate — interactive, can't be scripted
npx wrangler d1 create bordercross-scores
```

The second command prints a `database_id` — paste it into `wrangler.toml`
in place of `REPLACE_AFTER_WRANGLER_D1_CREATE`. Then apply the schema and
deploy:

```
npx wrangler d1 execute bordercross-scores --remote --file=./schema.sql
npx wrangler deploy
```

`wrangler deploy` prints the Worker's live URL — something like
`https://bordercross-scores.<your-account-subdomain>.workers.dev`. Copy
that (with `/score` appended) into `API_URL` at the top of
`../js/percentile.js`, replacing the placeholder there, then commit.

## Local development

```
npx wrangler d1 execute bordercross-scores --local --file=./schema.sql
npx wrangler dev
```

`wrangler dev` runs the Worker against a local SQLite copy of the D1
database (nothing touches the real one), printing a `localhost` URL you
can point a local `js/percentile.js` at for testing.

## What it stores

Two small tables (see `schema.sql` for the full rationale):

- `submissions` — one row per (day, anonymous per-browser id), used only
  to stop a single browser from being counted twice for the same day.
- `score_counts` — a histogram of how many players got each score (0-100)
  on a given day. This is the only "leaderboard" data that exists; there's
  no per-player history kept anywhere on the server.

There's no auth, so a submitted score is trusted at face value — the same
trust model the rest of this app already applies to a player's own local
stats (nothing stops someone from editing their own localStorage either).
The dedup table only prevents double-counting, not a deliberately spoofed
score. That's an accepted trade-off for a free, accountless daily game.

## Testing

The percentile math itself (`src/percentile.js`) is plain, D1-free JS —
it's covered by `../test/percentile.test.js`, which runs as part of the
repo's normal `npm test`. The D1/HTTP wiring in `src/index.js` isn't unit
tested; verify it with `wrangler dev` + a couple of `curl -X POST` calls,
or just deploy and watch it work end to end.
