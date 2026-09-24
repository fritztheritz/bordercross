import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, COUNTRY_BY_CODE, bfsPath } from "../js/graph.js";
import { Game, scoreFor, efficiencyFor, randomPair, pickRestrictions } from "../js/game.js";

const graph = buildGraph();

function makeRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("scoreFor / efficiencyFor", () => {
  test("a perfect run scores 100", () => {
    assert.equal(scoreFor({ optimalMoves: 3, playerMoves: 3 }), 100);
    assert.equal(efficiencyFor({ optimalMoves: 3, playerMoves: 3 }), 100);
  });

  test("extra moves cost 10 points each, floored at 0", () => {
    assert.equal(scoreFor({ optimalMoves: 3, playerMoves: 5 }), 80); // -10 x 2 extra
    assert.equal(scoreFor({ optimalMoves: 3, playerMoves: 20 }), 0);
  });
});

describe("Game", () => {
  test("a full correct run: Canada -> United States -> Mexico -> Guatemala", () => {
    const game = new Game(graph);
    game.start("CA", "GT");
    assert.equal(game.optimalMoves, 3);
    assert.equal(game.slotCount, 2); // US and MX

    const r1 = game.attemptMove("United States");
    assert.equal(r1.ok, true);
    assert.ok(!r1.won); // no `won` key at all on a non-final move

    const r2 = game.attemptMove("Mexico");
    assert.equal(r2.ok, true);
    assert.equal(r2.won, true);

    assert.equal(game.status, "won");
    const result = game.result();
    assert.equal(result.playerMoves, 3); // 2 finds + the automatic arrival
    assert.equal(result.perfect, true);
    assert.deepEqual(result.route, ["CA", "US", "MX", "GT"]);
  });

  test("guesses can be made in any order and still land in their correct slot", () => {
    const game = new Game(graph);
    game.start("CA", "GT");
    game.attemptMove("Mexico"); // the *second* step, guessed first
    game.attemptMove("United States");
    assert.deepEqual(game.displaySequence(), ["CA", "US", "MX", "GT"]);
  });

  test("guessing the start, the destination, or a repeat costs nothing", () => {
    const game = new Game(graph);
    game.start("CA", "GT");
    assert.equal(game.attemptMove("Canada").reason, "is-start");
    assert.equal(game.attemptMove("Guatemala").reason, "is-dest");
    game.attemptMove("United States");
    assert.equal(game.attemptMove("United States").reason, "already-found");
    assert.equal(game.totalMoves, 1); // only the one real find counted
  });

  test("a wrong guess counts as a move and lands in wrongGuesses", () => {
    const game = new Game(graph);
    game.start("CA", "GT");
    const r = game.attemptMove("France");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "not-on-path");
    assert.ok(game.wrongGuesses.has("FR"));
    assert.equal(game.totalMoves, 1);
  });

  test("a restricted country is rejected, and the optimal path routes around it", () => {
    const game = new Game(graph);
    // Germany -> Spain normally runs straight through France; banning it
    // forces a real (much longer) detour rather than disconnecting them.
    game.start("DE", "ES", { restrictedCodes: ["FR"] });
    const r = game.attemptMove("France");
    assert.equal(r.reason, "restricted");
    assert.ok(game.optimalPath.every((c) => c !== "FR"));
    assert.ok(game.optimalMoves > 2); // base DE->FR->ES is 2; the detour must be longer
  });

  test("guessOutcomes: correct/arrival map to 'correct', everything else to 'wrong', give-up pads with 'blank'", () => {
    const game = new Game(graph);
    game.start("CA", "GT");
    game.attemptMove("France"); // wrong
    game.attemptMove("United States"); // correct
    game.giveUp();
    assert.deepEqual(game.guessOutcomes(), ["wrong", "correct", "blank"]);
  });

  test("first hint on a step reveals its region, and costs a move like any other guess", () => {
    const game = new Game(graph);
    game.start("CA", "GT");
    const hint = game.hint();
    assert.equal(hint.stepNumber, 1);
    assert.equal(hint.level, 1);
    assert.equal(hint.region, COUNTRY_BY_CODE.get("US")[4]);
    assert.equal(hint.letter, null);
    assert.equal(game.hintsUsed, 1);
    assert.equal(game.totalMoves, 1); // no separate point penalty — it's just a move
  });

  test("asking again for the same still-unfound step reveals the country name letter by letter", () => {
    const game = new Game(graph);
    game.start("CA", "GT"); // step 1 is United States
    game.hint(); // region
    const h2 = game.hint();
    assert.equal(h2.level, 2);
    assert.equal(h2.letter, "U");
    const h3 = game.hint();
    assert.equal(h3.level, 3);
    assert.equal(h3.letter, "N"); // "U-n-i-t-e-d" — second letter
    assert.equal(game.totalMoves, 3);
  });

  test("hinting a different step (found another way) restarts the progression at region", () => {
    const game = new Game(graph);
    game.start("CA", "GT");
    game.hint(); // region for step 1 (US)
    game.hint(); // first letter for step 1
    game.attemptMove("United States"); // fills step 1 for real
    const hint = game.hint(); // now targets step 2 (Mexico)
    assert.equal(hint.stepNumber, 2);
    assert.equal(hint.level, 1);
    assert.equal(hint.letter, null);
  });

  test("hintExhausted() is false for a fresh step, true once every letter's been revealed", () => {
    const game = new Game(graph);
    game.start("CA", "GT"); // step 1 is United States: U-n-i-t-e-d S-t-a-t-e-s, 12 letters
    assert.equal(game.hintExhausted(), false);
    const first = game.hint();
    assert.equal(first.totalLevels, 13); // region + 12 letters
    assert.equal(game.hintExhausted(), false);
    for (let i = 0; i < 12; i++) game.hint(); // levels 2..13: all 12 letters now revealed
    assert.equal(game.hintExhausted(), true);
  });

  test("usedLetterHint only flips once a hint goes past the region clue", () => {
    const game = new Game(graph);
    game.start("CA", "GT");
    game.hint(); // region only, for step 1
    assert.equal(game.usedLetterHint, false);
    game.attemptMove("United States");
    game.hint(); // region only, for step 2
    assert.equal(game.usedLetterHint, false);
    game.hint(); // now asks for a letter
    assert.equal(game.usedLetterHint, true);
  });

  test("start/destination with no intermediates auto-wins with exactly 1 move", () => {
    const game = new Game(graph);
    game.start("CA", "US"); // directly adjacent
    assert.equal(game.slotCount, 0);
    assert.equal(game.status, "won");
    assert.equal(game.result().playerMoves, 1);
  });
});

describe("randomPair", () => {
  test("codePool restricts both start and destination to the pool", () => {
    const pool = new Set(["AU", "NZ", "FJ", "PG", "SB", "VU", "WS", "KI", "FM", "TO", "MH", "PW", "NR", "TV"]);
    for (let i = 0; i < 20; i++) {
      const [start, dest] = randomPair(graph, { codePool: pool });
      assert.ok(pool.has(start), `${start} outside the requested pool`);
      assert.ok(pool.has(dest), `${dest} outside the requested pool`);
    }
  });

  test("respects the requested move-count range", () => {
    for (let i = 0; i < 20; i++) {
      const [start, dest] = randomPair(graph, { minMoves: 2, maxMoves: 4 });
      const path = bfsPath(graph, start, dest);
      const moves = path.length - 1;
      assert.ok(moves >= 2 && moves <= 4, `${start}->${dest} was ${moves} moves`);
    }
  });
});

describe("pickRestrictions", () => {
  // CA -> GT is only 3 moves, below the default eligible window (5-8) on
  // its own — these two tests care about the chance-roll and
  // intermediates-only behavior specifically, not the window's exact
  // bounds, so they widen it explicitly rather than depend on the current
  // default numbers.
  const wideWindow = { minBaseMoves: 0, maxBaseMoves: 20 };

  test("never restricts when the roll misses (rng >= chance)", () => {
    const rng = makeRng([0.99]);
    assert.deepEqual(pickRestrictions(graph, "CA", "GT", rng, wideWindow), []);
  });

  test("only ever picks from the base path's own intermediates, and never blows the route up too far", () => {
    const rng = makeRng([0, 0.1, 0.1, 0.1, 0.1, 0.1]); // pass the chance roll, then low picks
    const basePath = bfsPath(graph, "CA", "GT");
    const intermediates = new Set(basePath.slice(1, -1));
    const picked = pickRestrictions(graph, "CA", "GT", rng, wideWindow);
    for (const code of picked) assert.ok(intermediates.has(code));
  });

  test("returns [] when the base route is outside the eligible move range", () => {
    const rng = makeRng([0]); // would always take the restriction if eligible
    // CA -> US is 1 move, below minBaseMoves (5 by default) — nothing to restrict.
    assert.deepEqual(pickRestrictions(graph, "CA", "US", rng), []);
  });

  test("the default window (5-8) covers Medium-tier pairs, not just Easy ones", () => {
    // AD -> PS is a real 7-move pair (Medium under the daily's own tiers) —
    // regression test for the window having once been stuck at [3,6], which
    // made restrictions impossible for any Medium/Hard-tier pair at all.
    const rng = makeRng([0, 0.1, 0.1, 0.1, 0.1, 0.1]);
    assert.equal(bfsPath(graph, "AD", "PS").length - 1, 7);
    const picked = pickRestrictions(graph, "AD", "PS", rng);
    assert.ok(picked.length > 0);
  });
});
