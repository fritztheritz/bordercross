// BorderCross — country name search, normalization, and flag rendering.

import { COUNTRIES } from "./data.js";

const COMBINING_MARKS = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g"
);

function normalize(str) {
  return str
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// code -> [normalized name, ...normalized aliases]
const SEARCH_TERMS = new Map(
  COUNTRIES.map(([code, name, , , , aliases = []]) => [
    code,
    [normalize(name), ...aliases.map(normalize)],
  ])
);

export function flagEmoji(code) {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** Exact match (name or alias, normalized) -> country entry, or null. */
export function resolveCountry(input) {
  const q = normalize(input);
  if (!q) return null;
  for (const country of COUNTRIES) {
    if (SEARCH_TERMS.get(country[0]).includes(q)) return country;
  }
  return null;
}

/** Up to `limit` countries whose name/alias starts with or contains `input`. */
export function searchCountries(input, limit = 8) {
  const q = normalize(input);
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const country of COUNTRIES) {
    const terms = SEARCH_TERMS.get(country[0]);
    if (terms.some((t) => t.startsWith(q))) starts.push(country);
    else if (terms.some((t) => t.includes(q))) contains.push(country);
  }
  const byName = (a, b) => a[1].localeCompare(b[1]);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}
