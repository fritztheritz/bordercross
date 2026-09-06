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
  test("a perfect run with no hints scores 100", () => {
    assert.equal(scoreFor({ optimalMoves: 3, playerMoves: 3, hintsUsed: 0 }), 100);
    assert.equal(efficiencyFor({ optimalMoves: 3, playerMoves: 3 }), 100);
  });

  test("extra moves and hints both cost points, floored at 0", () => {
    assert.equal(scoreFor({ optimalMoves: 3, playerMoves: 5, hintsUsed: 0 }), 80); // -10 x 2 extra
    assert.equal(scoreFor({ optimalMoves: 3, playerMoves: 3, hintsUsed: 1 }), 85);
    assert.equal(scoreFor({ optimalMoves: 3, playerMoves: 20, hintsUsed: 10 }), 0);
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

  test("hint reveals the earliest unfound step's real region and counts hintsUsed", () => {
    const game = new Game(graph);
    game.start("CA", "GT");
    const hint = game.hint();
    assert.equal(hint.stepNumber, 1);
    assert.equal(hint.region, COUNTRY_BY_CODE.get("US")[4]);
    assert.equal(game.hintsUsed, 1);
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
  test("never restricts when the roll misses (rng >= chance)", () => {
    const rng = makeRng([0.99]);
    assert.deepEqual(pickRestrictions(graph, "CA", "GT", rng), []);
  });

  test("only ever picks from the base path's own intermediates, and never blows the route up too far", () => {
    const rng = makeRng([0, 0.1, 0.1, 0.1, 0.1, 0.1]); // pass the chance roll, then low picks
    const basePath = bfsPath(graph, "CA", "GT");
    const intermediates = new Set(basePath.slice(1, -1));
    const picked = pickRestrictions(graph, "CA", "GT", rng);
    for (const code of picked) assert.ok(intermediates.has(code));
  });

  test("returns [] when the base route is outside the eligible move range", () => {
    const rng = makeRng([0]); // would always take the restriction if eligible
    // CA -> US is 1 move, below minBaseMoves (3) — nothing to restrict.
    assert.deepEqual(pickRestrictions(graph, "CA", "US", rng), []);
  });
});
