# Bordercross

**Play it live: [fritztheritz.github.io/bordercross](https://fritztheritz.github.io/bordercross/)**

Given a starting country and a destination, name every country that sits
on the shortest possible route between them — in any order.

Given `Canada → Guatemala`, the shortest path is:

```
Canada → United States → Mexico → Guatemala
```

So the player needs to find `United States` and `Mexico`. They can be
guessed in either order — entering `Mexico` before `United States` is just
as valid as the reverse, since both genuinely sit on the shortest route.
Each correct guess slots into its right position automatically, so the
displayed route is always shown in order regardless of the order it was
discovered in. Guessing something that *isn't* on any shortest route (e.g.
`Brazil`) is rejected — there's no way to "detour" onto a longer valid
path, since only path membership is checked, not adjacency to wherever
the player currently is — but it isn't free: a wrong guess counts against
the player's move total exactly like an old-style detour would, so
carelessly guessing your way to the answer still costs efficiency. Wrong
guesses are also tracked in a "ruled out" list so the player never has to
remember what they already tried.

The destination itself is never something you type — the moment every
intermediate step is found (`United States` *and* `Mexico`, here), the
route completes automatically.

## Running it locally

No build step. Because the app uses native ES modules (`import`/`export`),
it needs to be served over HTTP rather than opened as a `file://` URL:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed local URL in a browser.

## How a guess is validated

A guessed country is accepted if it lies on *at least one* shortest path
between the start and destination — the standard BFS test: run breadth-
first search from both the start and the destination once at the start of
a game, and a country `v` qualifies iff
`distFromStart(v) + distFromDest(v) === optimalMoves`. That's what makes
order irrelevant: each guess is checked independently against this
membership test, not against whatever the player most recently found.
Once a valid guess is made, it's slotted into its correct position (its
distance from the start) for display, so out-of-order discovery still
renders as an in-order route (`Game.layerOf()` in `js/game.js`).

## How the connection graph works

The membership test above runs against the same graph that computes the
"optimal" route, so the two can never disagree (`js/graph.js`, `js/data.js`).

- **Land border** — two countries are connected if they share a land
  border (`LAND_EDGES` in `js/data.js`), built from standard geographic
  references.
- **Sea crossing** — two countries that don't share a land border can
  still be connected if they're linked by a well-known short strait or
  ferry crossing (the UK–France Channel crossing, Spain–Morocco across
  Gibraltar, Russia–US across the Bering Strait, and so on — see
  `SEA_EDGES` in `js/data.js`). This list is curated by hand, not a
  distance threshold applied to every country pair — the goal is to
  reflect real, recognizable crossings without silently connecting every
  country to every other one.
- A small number of longer "gateway" links are included deliberately for
  playability — e.g. Iceland–UK and Australia–New Zealand — because
  those countries would otherwise have no connection to the rest of the
  graph at all (there's no short crossing nearby). These are called out
  explicitly in the in-app "How to Play" panel rather than hidden.
- **Fallback rule** — if any country still ends up with zero connections
  after the two rules above, it's automatically linked to its single
  nearest neighbor by centroid distance (`buildGraph()` in `js/graph.js`).
  This is a documented safety net, not a general proximity rule, and in
  practice the curated data above already covers every country in the
  dataset.

Shortest paths are computed with breadth-first search over this graph
(`bfsPath`, `bfsDistances`), since every edge is unweighted.

## Project structure

```
index.html          Page structure
css/styles.css       Design system (light/dark, boarding-pass/atlas motif)
js/data.js           Country list + land/sea edge lists (the geographic data)
js/graph.js          Graph construction, BFS shortest-path, difficulty
js/lookup.js         Name normalization, alias matching, autocomplete search
js/game.js           Game state machine + scoring (no DOM dependency)
js/stats.js          localStorage-backed player statistics
js/map.js            Leaflet route-map rendering (pan/zoom, no political borders)
js/daily.js          Deterministic daily puzzle (seeded PRNG) + its localStorage persistence
js/share.js          Wordle-style spoiler-free share text + native share/clipboard
js/ui.js             DOM rendering helpers
js/main.js           Event wiring / bootstrapping (three Game instances, one per mode)
```

Each layer only talks to the ones below it, so e.g. the scoring formula in
`game.js` or the whole map renderer in `map.js` can be swapped out without
touching the graph or the data.

## Scoring

Defined in `scoreFor()` in `js/game.js`. "Moves" (`Game#totalMoves`) counts
every guess that *costs* something — a correct new find, a wrong guess, or
a redundant one (see below) — plus one automatic move for the final,
un-typed hop onto the destination, so a flawless run with no wrong or
redundant guesses costs exactly the optimal move count:

- Perfect (optimal) route: **100 points**
- Each extra move beyond optimal: **−10 points**
- Each hint used: **−15 points**
- Floors at 0

A "redundant" guess is a country that's genuinely on *some* shortest path
but whose position in the route was already filled by a different valid
country — this happens when more than one shortest path exists (a tie).
It's accepted (it's not wrong), but it doesn't advance progress and still
costs a move, exactly like a wrong guess does.

What doesn't cost a move: re-typing the start, guessing the destination
before every step is found, repeating a country already found, or a typo
that doesn't resolve to any real country. Those aren't guesses *about the
route* — they're just noise.

Efficiency is reported as `optimal moves / player moves`, as a percentage.

## Hints and wrong guesses

A hint (`Game#hint()`) reveals the `region` (a coarse tag on each country
in `js/data.js` — "Southeast Asia", "West Africa", etc., used only for
this) of the earliest still-unfound step — concrete enough to actually
narrow things down, without naming the country. Each use costs 15 points.

Any guess that resolves to a real country but isn't on the shortest route
is added to `Game#wrongGuesses`, shown in a persistent "Ruled out" list in
the UI so the player is never stuck re-guessing something they've already
tried, and — as above — counts against their move total.

## Difficulty

Based on the optimal move count for the generated pair (`difficultyFor()`
in `js/graph.js`):

| Optimal moves | Difficulty |
|---|---|
| 1–4 | Easy |
| 5–9 | Medium |
| 10+ | Hard |

## Game modes

Each mode gets its own `Game` instance (`js/main.js`), so switching tabs
never loses progress in the other two.

- **Classic** — a daily challenge (`js/daily.js`): one fixed start/
  destination pair per calendar day, the same for every player, that
  refreshes at midnight *in the player's own local timezone*. The pair is
  derived deterministically from the date string via a seeded PRNG
  (`dailyPair()`) — no server or fetch involved, so anyone opening the app
  on the same day computes the same puzzle independently. Progress
  persists across reloads via `localStorage` (keyed by date), and once
  a day's puzzle is finished, reopening the app shows the completed board
  and result again rather than a fresh attempt — the same one-per-day
  model as Wordle.
- **Unlimited** — a fresh random start/destination pair every time you
  press New Game (biased toward a 2–14 move range so games stay
  interesting), guaranteed solvable since the graph is fully connected.
  This is what Classic mode did before the daily challenge existed.
- **Custom** — pick your own start and destination.

## Sharing a result

After finishing a run (win or give-up), **Share Result** builds a spoiler-
free summary — flags, move count, and a row of squares, but never the
country names themselves — and either opens the device's native share
sheet (`navigator.share`, so on mobile you can send it straight to
Messages, the same flow as Wordle) or copies it to the clipboard on
desktop (`js/share.js`). A Classic/daily result includes the puzzle
number so people can compare the same day's puzzle:

```
Bordercross #247 🇸🇬 → 🇧🇿
🏆 Perfect — 8/8 moves
🟩🟩🟩🟩🟩🟩🟩🟩
Score: 100
https://fritztheritz.github.io/bordercross/
```

## The map

`js/map.js` renders a real [Leaflet](https://leafletjs.com/) map — fully
pannable and zoomable — using Esri's "World Physical" basemap tiles. That
basemap was chosen specifically because it draws terrain and coastlines
but no political borders or country labels, so the map itself can never
give away which countries are adjacent to which. Country markers use the
same centroid coordinates as the rest of the game (`js/data.js`); a solid
line is only drawn between two markers that are both confirmed *and*
adjacent positions in the route, so the map never implies a connection
between two finds that don't actually sit next to each other.

## Data notes / known simplifications

- Western Sahara is treated as part of Morocco for the purposes of a
  Morocco–Mauritania land connection (a common simplification given the
  disputed territory sits between them).
- 195 sovereign/de-facto states are included (all UN member states plus
  Kosovo, Taiwan, Vatican City, and Palestine).
- Centroid coordinates are approximate — good enough for map placement and
  the nearest-neighbor fallback rule, not survey-grade GIS data.

## Statistics

Tracked locally via `localStorage` (`js/stats.js`): games played/won,
best score, average moves, average efficiency, perfect routes, longest
completed route, and fastest completion time. No account required; the
storage shape is flat so a real backend could sync the same fields later.

### Daily streak

Tracked separately (`recordDailyOutcome()` in `js/stats.js`) since it only
applies to the Classic daily challenge — Unlimited and Custom runs don't
touch it. Winning on the calendar day right after your last completed day
extends the streak; missing a day, or giving up, resets it to 0. Shown in
the result modal right after a Classic finish and as two tiles ("Daily
streak" / "Best daily streak") in the Statistics panel.
