import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { flagEmoji, resolveCountry, searchCountries } from "../js/lookup.js";

describe("flagEmoji", () => {
  test("builds the correct regional-indicator pair", () => {
    assert.equal(flagEmoji("us"), "🇺🇸");
    assert.equal(flagEmoji("CA"), "🇨🇦");
  });
});

describe("resolveCountry", () => {
  test("matches by exact name, case- and whitespace-insensitively", () => {
    assert.equal(resolveCountry("  Canada ")[0], "CA");
    assert.equal(resolveCountry("guatemala")[0], "GT");
  });

  test("matches known aliases", () => {
    assert.equal(resolveCountry("USA")[0], "US");
    assert.equal(resolveCountry("United States of America")[0], "US");
  });

  test("returns null for gibberish", () => {
    assert.equal(resolveCountry("Narnia"), null);
    assert.equal(resolveCountry(""), null);
  });
});

describe("searchCountries", () => {
  test("a partial query matches by prefix/substring", () => {
    const results = searchCountries("guat");
    assert.ok(results.some((c) => c[0] === "GT"));
  });
});
