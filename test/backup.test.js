import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { exportProgress, importProgress } from "../js/backup.js";
import { installLocalStorageStub } from "./helpers/localStorageStub.js";

beforeEach(() => installLocalStorageStub());

describe("exportProgress / importProgress", () => {
  test("round-trips stats, streak, and achievements exactly", () => {
    localStorage.setItem("bordercross.stats.v1", JSON.stringify({ gamesPlayed: 5 }));
    localStorage.setItem("bordercross.streak.v1", JSON.stringify({ current: 3, max: 7 }));
    localStorage.setItem("bordercross.achievements.v1", JSON.stringify(["first-win"]));

    const backup = exportProgress();
    assert.equal(backup.app, "bordercross");
    assert.ok(backup.data["bordercross.stats.v1"]);

    installLocalStorageStub(); // simulate a clean browser
    const result = importProgress(backup);
    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(localStorage.getItem("bordercross.stats.v1")), { gamesPlayed: 5 });
    assert.deepEqual(JSON.parse(localStorage.getItem("bordercross.streak.v1")), { current: 3, max: 7 });
    assert.deepEqual(JSON.parse(localStorage.getItem("bordercross.achievements.v1")), ["first-win"]);
  });

  test("rejects a file from the wrong app, or with no data at all", () => {
    assert.equal(importProgress({ app: "wordle", data: {} }).ok, false);
    assert.equal(importProgress(null).ok, false);
    assert.equal(importProgress({ app: "bordercross" }).ok, false);
  });

  test("rejects corrupted field data without writing anything at all", () => {
    localStorage.setItem("bordercross.stats.v1", JSON.stringify({ gamesPlayed: 99 }));
    const result = importProgress({
      app: "bordercross",
      data: { "bordercross.stats.v1": "{not valid json" },
    });
    assert.equal(result.ok, false);
    // The pre-existing value must be untouched — no partial write.
    assert.deepEqual(JSON.parse(localStorage.getItem("bordercross.stats.v1")), { gamesPlayed: 99 });
  });

  test("importing only some keys leaves the others alone", () => {
    localStorage.setItem("bordercross.streak.v1", JSON.stringify({ current: 1 }));
    importProgress({ app: "bordercross", data: { "bordercross.stats.v1": JSON.stringify({ gamesPlayed: 1 }) } });
    assert.deepEqual(JSON.parse(localStorage.getItem("bordercross.streak.v1")), { current: 1 });
  });
});
