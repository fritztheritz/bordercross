# Bordercross

Navigate from a starting country to a destination by entering a chain of
geographically connected countries — using as few of them as possible.

Given `Canada → Guatemala`, the shortest path is:

```
Canada → United States → Mexico → Guatemala
```

So the player enters `United States`, then `Mexico`. Padding the route with
an unnecessary detour (`Canada → United States → Brazil → Mexico →
Guatemala`) is technically still a valid path, but it costs score — the
game always knows the true shortest route and grades you against it.

## Running it

No build step. Because the app uses native ES modules (`import`/`export`),
it needs to be served over HTTP rather than opened as a `file://` URL:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed local URL in a browser.

## How the connection graph works

Every move is validated against the same graph that computes the "optimal"
route, so the two can never disagree (`js/graph.js`, `js/data.js`).

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
js/map.js            SVG route-map rendering
js/ui.js             DOM rendering helpers
js/main.js           Event wiring / bootstrapping
```

Each layer only talks to the ones below it, so e.g. the scoring formula in
`game.js` or the whole map renderer in `map.js` can be swapped out without
touching the graph or the data.

## Scoring

Defined in `scoreFor()` in `js/game.js`:

- Perfect (optimal) route: **100 points**
- Each extra move beyond optimal: **−10 points**
- Each hint used: **−15 points**
- Floors at 0

Efficiency is reported as `optimal moves / player moves`, as a percentage.

## Difficulty

Based on the optimal move count for the generated pair (`difficultyFor()`
in `js/graph.js`):

| Optimal moves | Difficulty |
|---|---|
| 1–3 | Easy |
| 4–6 | Medium |
| 7+ | Hard |

## Game modes

- **Classic** — a random start/destination pair is generated (biased
  toward a 2–8 move range so games stay interesting), guaranteed solvable
  since the graph is fully connected.
- **Custom** — pick your own start and destination.

The architecture (`Game` class in `js/game.js`, `randomPair()`) is built so
additional modes (timed runs, daily challenge, etc.) can be added as thin
wrappers around the same graph and scoring logic.

## Data notes / known simplifications

- The map (`js/map.js`) plots approximate country centroids on an
  equirectangular grid rather than shipping full coastline/polygon data —
  it's a stylized route/position map, not a political map.
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
