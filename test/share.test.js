import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildShareText } from "../js/share.js";

function fakeGame(overrides = {}) {
  return {
    startCode: "CA",
    destCode: "GT",
    restrictedCodes: new Set(),
    guessOutcomes: () => ["correct", "correct", "correct"],
    ...overrides,
  };
}

const wonResult = { status: "won", perfect: true, playerMoves: 3, optimalMoves: 3, hintsUsed: 0 };

describe("buildShareText", () => {
  test("default palette is green squares, colorblind swaps in blue", () => {
    const off = buildShareText(fakeGame(), wonResult, { colorblind: false });
    const on = buildShareText(fakeGame(), wonResult, { colorblind: true });
    assert.match(off.text, /🟩🟩🟩/);
    assert.match(on.text, /🟦🟦🟦/);
  });

  test("the link goes on its own trailing line in the plain-text fallback, never at the front", () => {
    const share = buildShareText(fakeGame(), wonResult, { url: "https://bordercross.io/" });
    const lines = share.plainWithLink.split("\n");
    assert.equal(lines.at(-1), "https://bordercross.io/");
    assert.ok(!lines[0].includes("https://"));
  });

  test("html wraps only the 'BorderCross' word in an anchor, and is null without a url", () => {
    const withUrl = buildShareText(fakeGame(), wonResult, { url: "https://bordercross.io/" });
    assert.match(withUrl.html, /^<a href="https:\/\/bordercross\.io\/">BorderCross<\/a>/);

    const withoutUrl = buildShareText(fakeGame(), wonResult, {});
    assert.equal(withoutUrl.html, null);
  });

  test("restricted countries get their own off-limits line", () => {
    const share = buildShareText(fakeGame({ restrictedCodes: new Set(["FR"]) }), wonResult, {});
    assert.match(share.text, /🚫 Off-limits: 🇫🇷/);
  });

  test("a give-up result reports how many of the required steps were found (read off `game`, not `result`)", () => {
    const game = fakeGame({ guessOutcomes: () => ["correct", "blank"], slotsFilled: 1, slotCount: 2 });
    const share = buildShareText(game, { status: "gaveup" }, {});
    assert.match(share.text, /🏳️ Gave up — found 1\/2/);
  });

  test("puzzleNumber, when given, appears in the header", () => {
    const share = buildShareText(fakeGame(), wonResult, { puzzleNumber: 42 });
    assert.match(share.text, /^BorderCross #42 /);
  });
});
