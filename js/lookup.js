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

// On-screen flags are rendered as self-hosted SVGs (assets/flags/, from the
// MIT-licensed flag-icons project) rather than the Unicode emoji above.
// Windows' built-in emoji font ships no flag glyphs at all (a deliberate
// Microsoft policy choice around contested national flags) — Windows
// players would otherwise see raw regional-indicator letters instead of a
// flag. flagEmoji() itself is kept only for plain-text share results
// (js/share.js), where an image isn't an option.

function flagIconSrc(code) {
  return `assets/flags/${code.toLowerCase()}.svg`;
}

/** An <img> element for a country's flag — for call sites building DOM
 * nodes directly (e.g. via textContent-replacement patterns). */
export function flagIconEl(code) {
  const img = document.createElement("img");
  img.className = "flag-icon";
  img.src = flagIconSrc(code);
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  return img;
}

/** The same flag, as an HTML string — for call sites building innerHTML. */
export function flagIconHtml(code) {
  return `<img class="flag-icon" src="${flagIconSrc(code)}" alt="" loading="lazy" decoding="async">`;
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
