// Bordercross — wiring. Builds the graph once, then drives Game + RouteMap
// from DOM events and renders through ui.js.

import { buildGraph, COUNTRY_BY_CODE } from "./graph.js";
import { Game, randomPair } from "./game.js";
import { RouteMap } from "./map.js";
import { resolveCountry } from "./lookup.js";
import { loadStats, recordResult, resetStats } from "./stats.js";
import {
  renderTicket,
  renderRouteChain,
  renderFeedback,
  clearFeedback,
  attachAutocomplete,
  renderStats,
  renderResult,
} from "./ui.js";

const els = {
  startFlag: document.getElementById("startFlag"),
  startName: document.getElementById("startName"),
  destFlag: document.getElementById("destFlag"),
  destName: document.getElementById("destName"),
  optimalMovesText: document.getElementById("optimalMovesText"),
  difficultyBadge: document.getElementById("difficultyBadge"),
  routeChain: document.getElementById("routeChain"),
  moveForm: document.getElementById("moveForm"),
  countryInput: document.getElementById("countryInput"),
  suggestions: document.getElementById("suggestions"),
  feedback: document.getElementById("feedback"),
  hintBtn: document.getElementById("hintBtn"),
  giveUpBtn: document.getElementById("giveUpBtn"),
  hintLog: document.getElementById("hintLog"),
  mapSvg: document.getElementById("mapSvg"),
  modeClassicBtn: document.getElementById("modeClassicBtn"),
  modeCustomBtn: document.getElementById("modeCustomBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  statsBtn: document.getElementById("statsBtn"),
  howToBtn: document.getElementById("howToBtn"),
  themeBtn: document.getElementById("themeBtn"),
  statsGrid: document.getElementById("statsGrid"),
  resetStatsBtn: document.getElementById("resetStatsBtn"),
  resultHeadline: document.getElementById("resultHeadline"),
  resultBody: document.getElementById("resultBody"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  customStartInput: document.getElementById("customStartInput"),
  customDestInput: document.getElementById("customDestInput"),
  customStartSuggestions: document.getElementById("customStartSuggestions"),
  customDestSuggestions: document.getElementById("customDestSuggestions"),
  customStartBtn: document.getElementById("customStartBtn"),
  customError: document.getElementById("customError"),
};

const graph = buildGraph();
const game = new Game(graph);
const map = new RouteMap(els.mapSvg);

let mode = "classic"; // "classic" | "custom"
let customStartCountry = null;
let customDestCountry = null;

// ---------- Modals ----------

function openModal(id) {
  document.getElementById(id).hidden = false;
}
function closeModal(id) {
  document.getElementById(id).hidden = true;
}
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.hidden = true;
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-backdrop").forEach((b) => (b.hidden = true));
  }
});

// ---------- Theme ----------

const THEME_KEY = "bordercross.theme";
const THEME_CYCLE = ["system", "light", "dark"];
const THEME_ICON = { system: "◐", light: "☀", dark: "☾" };

function applyTheme(theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  els.themeBtn.textContent = THEME_ICON[theme];
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

(function initTheme() {
  let stored = "system";
  try {
    stored = localStorage.getItem(THEME_KEY) || "system";
  } catch {}
  applyTheme(stored);
})();

els.themeBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "system";
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
  applyTheme(next);
});

// ---------- Mode toggle ----------

function setMode(next) {
  mode = next;
  els.modeClassicBtn.setAttribute("aria-pressed", String(mode === "classic"));
  els.modeCustomBtn.setAttribute("aria-pressed", String(mode === "custom"));
}
els.modeClassicBtn.addEventListener("click", () => setMode("classic"));
els.modeCustomBtn.addEventListener("click", () => setMode("custom"));

// ---------- Game flow ----------

function startGame(startCode, destCode) {
  game.start(startCode, destCode);
  renderTicket(els, {
    startEntry: COUNTRY_BY_CODE.get(startCode),
    destEntry: COUNTRY_BY_CODE.get(destCode),
    optimalMoves: game.optimalMoves,
  });
  renderRouteChain(els, game);
  clearFeedback(els);
  els.hintLog.textContent = "";
  els.countryInput.value = "";
  els.countryInput.disabled = false;
  els.hintBtn.disabled = false;
  els.giveUpBtn.disabled = false;
  map.render(game.route, game.destCode);
  els.countryInput.focus();
}

function newGame() {
  if (mode === "classic") {
    const [start, dest] = randomPair(graph);
    startGame(start, dest);
  } else {
    customStartCountry = null;
    customDestCountry = null;
    els.customStartInput.value = "";
    els.customDestInput.value = "";
    els.customError.textContent = "";
    openModal("customModal");
  }
}

els.newGameBtn.addEventListener("click", newGame);
els.playAgainBtn.addEventListener("click", () => {
  closeModal("resultModal");
  newGame();
});

function finishGame(result) {
  recordResult(result);
  renderResult(els, game, result);
  els.countryInput.disabled = true;
  els.hintBtn.disabled = true;
  els.giveUpBtn.disabled = true;
  openModal("resultModal");
}

// ---------- Move input ----------

attachAutocomplete(els.countryInput, els.suggestions, {
  excludeCodes: () => (game.status === "playing" ? [...game.visited] : []),
  onSelect: (country) => submitMove(country[1]),
});

function submitMove(rawValue) {
  const value = rawValue.trim();
  if (!value || game.status !== "playing") return;

  const result = game.attemptMove(value);
  els.countryInput.value = "";
  els.suggestions.innerHTML = "";

  if (!result.ok) {
    if (result.reason === "unrecognized") {
      renderFeedback(els, `❌ "${result.input}" isn't a recognized country.`, "err");
    } else if (result.reason === "current") {
      renderFeedback(els, `❌ You're already in ${game.countryName(result.code)}.`, "err");
    } else if (result.reason === "visited") {
      renderFeedback(els, `❌ ${game.countryName(result.code)} is already in your route.`, "err");
    } else if (result.reason === "not-connected") {
      renderFeedback(
        els,
        `❌ ${game.countryName(result.code)} is not directly connected to ${game.countryName(result.from)}.`,
        "err"
      );
    }
    return;
  }

  renderFeedback(els, `✅ ${game.countryName(result.code)}`, "ok", result.connection);
  renderRouteChain(els, game);
  map.render(game.route, game.destCode);

  if (result.won) {
    finishGame(game.result());
  }
}

els.moveForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitMove(els.countryInput.value);
});

els.hintBtn.addEventListener("click", () => {
  const hint = game.hint();
  if (!hint) return;
  const plural = hint.remaining === 1 ? "country" : "countries";
  els.hintLog.textContent = `💡 There ${hint.remaining === 1 ? "is" : "are"} ${hint.remaining} ${plural} remaining on the optimal route from here. (−15 pts)`;
});

els.giveUpBtn.addEventListener("click", () => {
  if (!confirm("Give up and reveal the optimal route? This ends the current game.")) return;
  game.giveUp();
  finishGame(game.result());
});

// ---------- Stats ----------

els.statsBtn.addEventListener("click", () => {
  renderStats(els.statsGrid, loadStats());
  openModal("statsModal");
});
els.resetStatsBtn.addEventListener("click", () => {
  if (!confirm("Reset all statistics? This can't be undone.")) return;
  renderStats(els.statsGrid, resetStats());
});
els.howToBtn.addEventListener("click", () => openModal("howToModal"));

// ---------- Custom mode ----------

attachAutocomplete(els.customStartInput, els.customStartSuggestions, {
  onSelect: (c) => {
    customStartCountry = c;
    els.customError.textContent = "";
  },
});
attachAutocomplete(els.customDestInput, els.customDestSuggestions, {
  onSelect: (c) => {
    customDestCountry = c;
    els.customError.textContent = "";
  },
});

function beginCustomChallenge() {
  const start = customStartCountry || resolveCountry(els.customStartInput.value);
  const dest = customDestCountry || resolveCountry(els.customDestInput.value);

  if (!start || !dest) {
    els.customError.textContent = "Enter two recognized countries to begin.";
    return;
  }
  if (start[0] === dest[0]) {
    els.customError.textContent = "Start and destination must be different countries.";
    return;
  }
  closeModal("customModal");
  startGame(start[0], dest[0]);
}

els.customStartBtn.addEventListener("click", beginCustomChallenge);
[els.customStartInput, els.customDestInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      beginCustomChallenge();
    }
  });
});

// ---------- Boot ----------

const [initialStart, initialDest] = randomPair(graph, { minMoves: 3, maxMoves: 4 });
startGame(initialStart, initialDest);
