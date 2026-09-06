import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  COUNTRY_BY_CODE,
  bfsPath,
  bfsDistances,
  graphExcluding,
  difficultyFor,
  REGION_GROUPS,
  codesInRegionGroup,
} from "../js/graph.js";

describe("buildGraph", () => {
  test("every country has at least one edge, and the graph is fully connected", () => {
    const graph = buildGraph();
    for (const [code, edges] of graph) {
      assert.ok(edges.size > 0, `${code} has no edges at all`);
    }
    const reachable = bfsDistances(graph, "US");
    assert.equal(reachable.size, COUNTRY_BY_CODE.size, "not every country is reachable from the US");
  });

  test("known adjacent pairs are connected directly", () => {
    const graph = buildGraph();
    assert.ok(graph.get("CA").has("US"));
    assert.ok(graph.get("US").has("MX"));
  });
});

describe("bfsPath / bfsDistances", () => {
  test("finds the known shortest Canada -> Guatemala route", () => {
    const graph = buildGraph();
    const path = bfsPath(graph, "CA", "GT");
    assert.deepEqual(path, ["CA", "US", "MX", "GT"]);
  });

  test("distance to self is 0, start === end short-circuits bfsPath", () => {
    const graph = buildGraph();
    assert.deepEqual(bfsPath(graph, "CA", "CA"), ["CA"]);
    assert.equal(bfsDistances(graph, "CA").get("CA"), 0);
  });
});

describe("graphExcluding", () => {
  test("removes a country and every edge touching it", () => {
    const graph = buildGraph();
    const excluded = graphExcluding(graph, ["MX"]);
    assert.ok(!excluded.has("MX"));
    for (const [, edges] of excluded) {
      assert.ok(!edges.has("MX"));
    }
  });

  test("a real detour still works when an alternate route exists", () => {
    const graph = buildGraph();
    // Germany -> Spain normally runs straight through France.
    const excluded = graphExcluding(graph, ["FR"]);
    const path = bfsPath(excluded, "DE", "ES");
    assert.ok(path, "expected a surviving (if longer) route");
    assert.ok(!path.includes("FR"));
  });

  test("excluding Mexico disconnects Central America entirely — no sea-edge bypass exists", () => {
    const graph = buildGraph();
    const excluded = graphExcluding(graph, ["MX"]);
    assert.equal(bfsPath(excluded, "CA", "GT"), null);
  });
});

describe("difficultyFor", () => {
  test("buckets at the documented boundaries", () => {
    assert.equal(difficultyFor(2), "Easy");
    assert.equal(difficultyFor(4), "Easy");
    assert.equal(difficultyFor(5), "Medium");
    assert.equal(difficultyFor(9), "Medium");
    assert.equal(difficultyFor(10), "Hard");
  });
});

describe("REGION_GROUPS / codesInRegionGroup", () => {
  test("every group resolves to a non-empty set of real country codes", () => {
    for (const key of Object.keys(REGION_GROUPS)) {
      const codes = codesInRegionGroup(key);
      assert.ok(codes.size > 0, `${key} resolved to an empty set`);
      for (const code of codes) assert.ok(COUNTRY_BY_CODE.has(code));
    }
  });

  test("an unknown key returns null, not an empty set", () => {
    assert.equal(codesInRegionGroup("atlantis"), null);
  });
});
