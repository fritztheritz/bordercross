// BorderCross — wiring. Builds the graph once, then drives Game + RouteMap
// from DOM events and renders through ui.js.
//
// Three modes share the same graph/scoring engine but each get their own
// Game instance so switching tabs never loses progress in another mode:
//   - classic:   the daily challenge (fixed per-day puzzle, see daily.js)
//   - unlimited: a fresh random pair every "New Game" (what Classic used
//                to be before the daily challenge)
//   - custom:    the player picks both countries

import { buildGraph, COUNTRY_BY_CODE } from "./graph.js";
import { Game, randomPair, pickRestrictions } from "./game.js";
import { RouteMap } from "./map.js";
import { resolveCountry } from "./lookup.js";
import { loadStats, recordResult, resetStats, recordDailyOutcome, loadStreakStats } from "./stats.js";
import {
  todayKey,
  puzzleNumber,
  msUntilNextMidnight,
  formatCountdown,
  dailyPair,
  dailyRestrictions,
  loadDailyState,
  saveDailyState,
} from "./daily.js";
import { buildShareText, shareResult } from "./share.js";
import { soundEnabled, setSoundEnabled, playFound, playWrong, playWin } from "./sound.js";
import { burstConfetti } from "./confetti.js";
import {
  renderTicket,
  renderRouteChain,
  renderFeedback,
  clearFeedback,
  attachAutocomplete,
  renderStats,
  renderMoveDistribution,
  renderResult,
  renderWrongGuesses,
  renderRestrictions,
} from "./ui.js";

const els = {
  startFlag: document.getElementById("startFlag"),
  startName: document.getElementById("startName"),
  destFlag: document.getElementById("destFlag"),
  destName: document.getElementById("destName"),
  optimalMovesText: document.getElementById("optimalMovesText"),
  difficultyBadge: document.getElementById("difficultyBadge"),
  dailyNumber: document.getElementById("dailyNumber"),
  routeChain: document.getElementById("routeChain"),
  moveForm: document.getElementById("moveForm"),
  countryInput: document.getElementById("countryInput"),
  suggestions: document.getElementById("suggestions"),
  feedback: document.getElementById("feedback"),
  hintBtn: document.getElementById("hintBtn"),
  giveUpBtn: document.getElementById("giveUpBtn"),
  hintLog: document.getElementById("hintLog"),
  wrongGuesses: document.getElementById("wrongGuesses"),
  restrictionsBanner: document.getElementById("restrictionsBanner"),
  restrictionsList: document.getElementById("restrictionsList"),
  mapContainer: document.getElementById("mapContainer"),
  modeClassicBtn: document.getElementById("modeClassicBtn"),
  modeUnlimitedBtn: document.getElementById("modeUnlimitedBtn"),
  modeCustomBtn: document.getElementById("modeCustomBtn"),
  difficultyPicker: document.getElementById("difficultyPicker"),
  newGameBtn: document.getElementById("newGameBtn"),
  statsBtn: document.getElementById("statsBtn"),
  howToBtn: document.getElementById("howToBtn"),
  soundBtn: document.getElementById("soundBtn"),
  themeBtn: document.getElementById("themeBtn"),
  statsGrid: document.getElementById("statsGrid"),
  moveDistribution: document.getElementById("moveDistribution"),
  resetStatsBtn: document.getElementById("resetStatsBtn"),
  resultHeadline: document.getElementById("resultHeadline"),
  resultBody: document.getElementById("resultBody"),
  dailyNextNote: document.getElementById("dailyNextNote"),
  confettiLayer: document.getElementById("confettiLayer"),
  shareBtn: document.getElementById("shareBtn"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  customStartInput: document.getElementById("customStartInput"),
  customDestInput: document.getElementById("customDestInput"),
  customStartSuggestions: document.getElementById("customStartSuggestions"),
  customDestSuggestions: document.getElementById("customDestSuggestions"),
  customStartBtn: document.getElementById("customStartBtn"),
  customError: document.getElementById("customError"),
};

const graph = buildGraph();
const map = new RouteMap(els.mapContainer);

const games = {
  classic: new Game(graph),
  unlimited: new Game(graph),
  custom: new Game(graph),
};
let mode = "classic"; // "classic" | "unlimited" | "custom"
let activeGame = games.classic;
let lastResult = null;
let customStartCountry = null;
let customDestCountry = null;
let currentDailyKey = todayKey();

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

// ---------- Sound ----------

function syncSoundButton() {
  els.soundBtn.textContent = soundEnabled() ? "🔊" : "🔇";
}
syncSoundButton();

els.soundBtn.addEventListener("click", () => {
  setSoundEnabled(!soundEnabled());
  syncSoundButton();
});

// ---------- Unlimited mode difficulty ----------

const DIFFICULTY_PICKER_KEY = "bordercross.unlimitedDifficulty";
const DIFFICULTY_RANGES = {
  any: { minMoves: 2, maxMoves: 14 },
  easy: { minMoves: 2, maxMoves: 4 },
  medium: { minMoves: 5, maxMoves: 9 },
  hard: { minMoves: 10, maxMoves: 20 },
};

(function initDifficultyPicker() {
  try {
    const stored = localStorage.getItem(DIFFICULTY_PICKER_KEY);
    if (stored && DIFFICULTY_RANGES[stored]) els.difficultyPicker.value = stored;
  } catch {}
})();

els.difficultyPicker.addEventListener("change", () => {
  try {
    localStorage.setItem(DIFFICULTY_PICKER_KEY, els.difficultyPicker.value);
  } catch {}
});

function unlimitedRange() {
  return DIFFICULTY_RANGES[els.difficultyPicker.value] || DIFFICULTY_RANGES.any;
}

/** Generates a fresh Unlimited pair and starts it, rolling the same
 * chance of restrictions the daily challenge gets (just unseeded). */
function startNewUnlimitedGame() {
  const [start, dest] = randomPair(graph, unlimitedRange());
  const restrictedCodes = pickRestrictions(graph, start, dest);
  games.unlimited.start(start, dest, { restrictedCodes });
}

// ---------- Rendering the active game ----------

function renderActiveGameView() {
  renderTicket(els, {
    startEntry: COUNTRY_BY_CODE.get(activeGame.startCode),
    destEntry: COUNTRY_BY_CODE.get(activeGame.destCode),
    optimalMoves: activeGame.optimalMoves,
  });
  els.dailyNumber.hidden = mode !== "classic";
  if (mode === "classic") els.dailyNumber.textContent = `Daily #${puzzleNumber(currentDailyKey)}`;

  renderRouteChain(els, activeGame);
  renderWrongGuesses(els, activeGame);
  renderRestrictions(els, activeGame);
  clearFeedback(els);
  els.hintLog.textContent = "";
  els.countryInput.value = "";

  const playing = activeGame.status === "playing";
  els.countryInput.disabled = !playing;
  els.hintBtn.disabled = !playing;
  els.giveUpBtn.disabled = !playing;

  map.frame(activeGame.startCode, activeGame.destCode);
  map.render(activeGame);
  if (playing) els.countryInput.focus();
}

// ---------- Daily (Classic) persistence ----------

function serializeGame(g) {
  return {
    startCode: g.startCode,
    destCode: g.destCode,
    restrictedCodes: [...g.restrictedCodes],
    slots: g.slots,
    guessedCodes: [...g.guessedCodes],
    wrongGuesses: [...g.wrongGuesses],
    guessLog: g.guessLog,
    totalMoves: g.totalMoves,
    hintsUsed: g.hintsUsed,
    status: g.status,
    startedAt: g.startedAt,
    finishedAt: g.finishedAt,
  };
}

function restoreGame(g, saved) {
  // deterministic: same pair + restrictions in, fresh distances recomputed
  g.start(saved.startCode, saved.destCode, { restrictedCodes: saved.restrictedCodes || [] });
  g.slots = saved.slots.slice();
  g.guessedCodes = new Set(saved.guessedCodes);
  g.wrongGuesses = new Set(saved.wrongGuesses || []);
  g.guessLog = saved.guessLog || [];
  g.totalMoves = saved.totalMoves ?? saved.acceptedGuesses ?? 0;
  g.hintsUsed = saved.hintsUsed;
  g.status = saved.status;
  g.startedAt = saved.startedAt;
  g.finishedAt = saved.finishedAt;
}

function persistDaily() {
  saveDailyState(currentDailyKey, serializeGame(games.classic));
}

function loadDailyPuzzle() {
  currentDailyKey = todayKey();
  const saved = loadDailyState(currentDailyKey);
  if (saved && saved.startCode) {
    restoreGame(games.classic, saved);
  } else {
    const [start, dest] = dailyPair(graph, currentDailyKey);
    const restrictedCodes = dailyRestrictions(graph, currentDailyKey, start, dest);
    games.classic.start(start, dest, { restrictedCodes });
    persistDaily();
  }
}

function syncNewGameButton() {
  if (mode === "classic") {
    els.newGameBtn.disabled = true;
    els.newGameBtn.textContent = `Next: ${formatCountdown(msUntilNextMidnight())}`;
  } else {
    els.newGameBtn.disabled = false;
    els.newGameBtn.textContent = "New Game";
  }
}

function startCountdown() {
  const tick = () => {
    const key = todayKey();
    if (key !== currentDailyKey) {
      loadDailyPuzzle();
      if (mode === "classic") {
        renderActiveGameView();
        renderFeedback(els, "🌅 A new daily puzzle just dropped!", "info");
      }
    }
    syncNewGameButton();
  };
  tick();
  setInterval(tick, 1000);
}

// ---------- Mode toggle ----------

function setMode(next) {
  // Custom mode is only committed to once a challenge actually starts
  // (see beginCustomChallenge) — otherwise canceling the picker would
  // strand the app on a mode with no game to play.
  if (next === "custom" && !games.custom.startCode) {
    openCustomPicker();
    return;
  }

  if (mode === "classic" && next !== "classic") persistDaily();
  mode = next;
  activeGame = games[mode];

  els.modeClassicBtn.setAttribute("aria-pressed", String(mode === "classic"));
  els.modeUnlimitedBtn.setAttribute("aria-pressed", String(mode === "unlimited"));
  els.modeCustomBtn.setAttribute("aria-pressed", String(mode === "custom"));
  els.difficultyPicker.hidden = mode !== "unlimited";

  syncNewGameButton();

  if (mode === "unlimited" && !activeGame.startCode) {
    startNewUnlimitedGame();
  }

  renderActiveGameView();
  if (activeGame.status !== "playing") showCompletedResult(activeGame.result());
}

els.modeClassicBtn.addEventListener("click", () => setMode("classic"));
els.modeUnlimitedBtn.addEventListener("click", () => setMode("unlimited"));
els.modeCustomBtn.addEventListener("click", () => setMode("custom"));

// ---------- New Game ----------

function openCustomPicker() {
  customStartCountry = null;
  customDestCountry = null;
  els.customStartInput.value = "";
  els.customDestInput.value = "";
  els.customError.textContent = "";
  openModal("customModal");
}

els.newGameBtn.addEventListener("click", () => {
  if (mode === "unlimited") {
    startNewUnlimitedGame();
    renderActiveGameView();
  } else if (mode === "custom") {
    openCustomPicker();
  }
});

els.playAgainBtn.addEventListener("click", () => {
  closeModal("resultModal");
  if (mode === "unlimited") {
    startNewUnlimitedGame();
    renderActiveGameView();
  } else if (mode === "custom") {
    openCustomPicker();
  }
});

// ---------- Finishing a game ----------

function finishGame(result) {
  if (mode === "classic") {
    persistDaily();
    recordDailyOutcome(currentDailyKey, result.status === "won");
  }
  recordResult(result);
  showResultModal(result);
  if (result.status === "won") {
    playWin(result.perfect);
    burstConfetti(els.confettiLayer);
  }
}

/** Used when restoring an already-completed daily puzzle — shows the same
 * modal without double-recording stats. */
function showCompletedResult(result) {
  showResultModal(result);
}

function showResultModal(result) {
  lastResult = result;
  renderResult(els, activeGame, result);
  els.countryInput.disabled = true;
  els.hintBtn.disabled = true;
  els.giveUpBtn.disabled = true;

  els.playAgainBtn.hidden = mode === "classic";
  els.dailyNextNote.hidden = mode !== "classic";
  if (mode === "classic") {
    const streak = loadStreakStats();
    const streakText = streak.current > 0 ? `🔥 ${streak.current}-day streak` : "Streak reset — start a new one tomorrow";
    els.dailyNextNote.textContent = `${streakText} · Next daily puzzle in ${formatCountdown(msUntilNextMidnight())}.`;
  }

  els.shareBtn.textContent = "Share Result";
  openModal("resultModal");
}

els.shareBtn.addEventListener("click", async () => {
  if (!lastResult) return;
  const share = buildShareText(activeGame, lastResult, {
    puzzleNumber: mode === "classic" ? puzzleNumber(currentDailyKey) : null,
    url: location.origin + location.pathname,
  });
  const outcome = await shareResult(share);
  if (outcome === "copied") {
    els.shareBtn.textContent = "Copied!";
    setTimeout(() => (els.shareBtn.textContent = "Share Result"), 1800);
  } else if (outcome === "shared") {
    els.shareBtn.textContent = "Shared!";
    setTimeout(() => (els.shareBtn.textContent = "Share Result"), 1800);
  } else if (outcome === "failed") {
    els.shareBtn.textContent = "Couldn't share — try again";
    setTimeout(() => (els.shareBtn.textContent = "Share Result"), 2200);
  }
});

// ---------- Move input ----------

attachAutocomplete(els.countryInput, els.suggestions, {
  excludeCodes: () => (activeGame.status === "playing" ? [activeGame.startCode, ...activeGame.guessedCodes] : []),
  onSelect: (country) => submitMove(country[1]),
});

function submitMove(rawValue) {
  const value = rawValue.trim();
  if (!value || activeGame.status !== "playing") return;

  const result = activeGame.attemptMove(value);
  els.countryInput.value = "";
  els.suggestions.innerHTML = "";

  if (!result.ok) {
    if (result.reason === "unrecognized") {
      renderFeedback(els, `❌ "${result.input}" isn't a recognized country.`, "err");
    } else if (result.reason === "is-start") {
      renderFeedback(els, `❌ ${activeGame.countryName(result.code)} is your starting country.`, "err");
    } else if (result.reason === "is-dest") {
      renderFeedback(
        els,
        `❌ ${activeGame.countryName(result.code)} is your destination — find everything in between and you'll reach it automatically.`,
        "err"
      );
    } else if (result.reason === "already-found") {
      renderFeedback(els, `❌ You've already found ${activeGame.countryName(result.code)}.`, "err");
    } else if (result.reason === "restricted") {
      playWrong();
      renderFeedback(
        els,
        `❌ ${activeGame.countryName(result.code)} is off-limits for this route.`,
        "err",
        "counts as a move"
      );
      renderWrongGuesses(els, activeGame);
    } else if (result.reason === "not-on-path") {
      playWrong();
      renderFeedback(
        els,
        `❌ ${activeGame.countryName(result.code)} isn't on the shortest route between ${activeGame.countryName(activeGame.startCode)} and ${activeGame.countryName(activeGame.destCode)}.`,
        "err",
        "counts as a move"
      );
      renderWrongGuesses(els, activeGame);
    }
    if (mode === "classic") persistDaily();
    return;
  }

  if (result.won) {
    renderFeedback(els, `✅ ${activeGame.countryName(result.code)} — route complete!`, "ok");
    renderRouteChain(els, activeGame);
    map.render(activeGame);
    finishGame(activeGame.result());
    return;
  }

  playFound();
  const tag = result.isNewSlot ? `${activeGame.slotCount - result.remaining}/${activeGame.slotCount} found` : "extra guess";
  const message = result.isNewSlot
    ? `✅ ${activeGame.countryName(result.code)} — confirmed on the route`
    : `✅ ${activeGame.countryName(result.code)} is also on a shortest route, but that step's already covered`;
  renderFeedback(els, message, "ok", tag);
  renderRouteChain(els, activeGame);
  map.render(activeGame);
  if (mode === "classic") persistDaily();
}

els.moveForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitMove(els.countryInput.value);
});

els.hintBtn.addEventListener("click", () => {
  const hint = activeGame.hint();
  if (!hint) return;
  els.hintLog.textContent =
    hint.remaining === 0
      ? `💡 Every step is found — the route will complete on its own. (−15 pts)`
      : `💡 Step ${hint.stepNumber} of ${activeGame.slotCount} is in ${hint.region}. (−15 pts)`;
  if (mode === "classic") persistDaily();
});

els.giveUpBtn.addEventListener("click", () => {
  if (!confirm("Give up and reveal the optimal route? This ends the current game.")) return;
  activeGame.giveUp();
  finishGame(activeGame.result());
});

// ---------- Stats ----------

els.statsBtn.addEventListener("click", () => {
  const stats = loadStats();
  renderStats(els.statsGrid, stats, loadStreakStats());
  renderMoveDistribution(els.moveDistribution, stats);
  openModal("statsModal");
});
els.resetStatsBtn.addEventListener("click", () => {
  if (!confirm("Reset all statistics? This can't be undone.")) return;
  const stats = resetStats();
  renderStats(els.statsGrid, stats, loadStreakStats());
  renderMoveDistribution(els.moveDistribution, stats);
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
  if (mode === "classic") persistDaily();
  games.custom.start(start[0], dest[0]);
  mode = "custom";
  activeGame = games.custom;
  els.modeClassicBtn.setAttribute("aria-pressed", "false");
  els.modeUnlimitedBtn.setAttribute("aria-pressed", "false");
  els.modeCustomBtn.setAttribute("aria-pressed", "true");
  els.difficultyPicker.hidden = true;
  syncNewGameButton();
  renderActiveGameView();
  if (activeGame.status !== "playing") showCompletedResult(activeGame.result());
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

loadDailyPuzzle();
renderActiveGameView();
if (games.classic.status !== "playing") showCompletedResult(games.classic.result());
startCountdown();
