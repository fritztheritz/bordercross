# Bordercross

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
`Brazil`) is simply rejected — there's no way to "detour" onto a longer
valid path, since only path membership is checked, not adjacency to
wherever the player currently is.

## Running it

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
js/ui.js             DOM rendering helpers
js/main.js           Event wiring / bootstrapping
```

Each layer only talks to the ones below it, so e.g. the scoring formula in
`game.js` or the whole map renderer in `map.js` can be swapped out without
touching the graph or the data.

## Scoring

Defined in `scoreFor()` in `js/game.js`. "Moves" here means total accepted
guesses — every correct find, including a redundant one (see below) — plus
the final destination entry, so a flawless run costs exactly the optimal
move count, same as before this counted order-independent guesses:

- Perfect (optimal) route: **100 points**
- Each extra move beyond optimal: **−10 points**
- Each hint used: **−15 points**
- Floors at 0

A "redundant" guess is a country that's genuinely on *some* shortest path
but whose position in the route was already filled by a different valid
country — this happens when more than one shortest path exists (a tie).
It's accepted (it's not wrong), but it doesn't advance progress and counts
against efficiency like an extra move would.

Efficiency is reported as `optimal moves / player moves`, as a percentage.

## Difficulty

Based on the optimal move count for the generated pair (`difficultyFor()`
in `js/graph.js`):

| Optimal moves | Difficulty |
|---|---|
| 1–4 | Easy |
| 5–9 | Medium |
| 10+ | Hard |

## Game modes

- **Classic** — a random start/destination pair is generated (biased
  toward a 2–14 move range so games stay interesting), guaranteed solvable
  since the graph is fully connected.
- **Custom** — pick your own start and destination.

The architecture (`Game` class in `js/game.js`, `randomPair()`) is built so
additional modes (timed runs, daily challenge, etc.) can be added as thin
wrappers around the same graph and scoring logic.

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
