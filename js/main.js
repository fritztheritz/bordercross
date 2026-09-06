// BorderCross — wiring. Builds the graph once, then drives Game + RouteMap
// from DOM events and renders through ui.js.
//
// Three modes share the same graph/scoring engine but each get their own
// Game instance so switching tabs never loses progress in another mode:
//   - classic:   the daily challenge (fixed per-day puzzle, see daily.js)
//   - unlimited: a fresh random pair every "New Game" (what Classic used
//                to be before the daily challenge)
//   - custom:    the player picks both countries

import { buildGraph, COUNTRY_BY_CODE, REGION_GROUPS, codesInRegionGroup } from "./graph.js";
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
  addDays,
} from "./daily.js";
import { buildShareText, shareResult } from "./share.js";
import { soundEnabled, setSoundEnabled, playFound, playWrong, playWin } from "./sound.js";
import { burstConfetti } from "./confetti.js";
import { loadUnlocked, checkAchievements, resetAchievements } from "./achievements.js";
import { exportProgress, importProgress } from "./backup.js";
import {
  renderTicket,
  renderRouteChain,
  renderFeedback,
  clearFeedback,
  attachAutocomplete,
  renderStats,
  renderMoveDistribution,
  renderTrendChart,
  renderResult,
  renderWrongGuesses,
  renderRestrictions,
  renderAchievements,
  renderNewAchievements,
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
  restrictionsPicker: document.getElementById("restrictionsPicker"),
  regionPicker: document.getElementById("regionPicker"),
  catchUpBanner: document.getElementById("catchUpBanner"),
  catchUpBtn: document.getElementById("catchUpBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  achievementsBtn: document.getElementById("achievementsBtn"),
  statsBtn: document.getElementById("statsBtn"),
  howToBtn: document.getElementById("howToBtn"),
  soundBtn: document.getElementById("soundBtn"),
  themeBtn: document.getElementById("themeBtn"),
  statsGrid: document.getElementById("statsGrid"),
  moveDistribution: document.getElementById("moveDistribution"),
  trendChart: document.getElementById("trendChart"),
  resetStatsBtn: document.getElementById("resetStatsBtn"),
  exportProgressBtn: document.getElementById("exportProgressBtn"),
  importProgressBtn: document.getElementById("importProgressBtn"),
  importProgressInput: document.getElementById("importProgressInput"),
  achievementsGrid: document.getElementById("achievementsGrid"),
  achievementsProgress: document.getElementById("achievementsProgress"),
  resultHeadline: document.getElementById("resultHeadline"),
  resultBody: document.getElementById("resultBody"),
  dailyNextNote: document.getElementById("dailyNextNote"),
  confettiLayer: document.getElementById("confettiLayer"),
  shareBtn: document.getElementById("shareBtn"),
  colorblindToggle: document.getElementById("colorblindToggle"),
  installBanner: document.getElementById("installBanner"),
  installBtn: document.getElementById("installBtn"),
  installDismissBtn: document.getElementById("installDismissBtn"),
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

// Tracks whatever had focus right before a modal opened, so closing it
// (✕, Escape, or a backdrop click) returns focus there instead of
// stranding a keyboard/screen-reader user at the top of the document.
let lastFocusedBeforeModal = null;

function openModal(id) {
  const modal = document.getElementById(id);
  lastFocusedBeforeModal = document.activeElement;
  modal.hidden = false;
  // Move focus into the modal itself — the close button is always present
  // and always a sensible first stop, so it doubles as the modal's focus
  // target rather than hunting for the "most relevant" field.
  modal.querySelector(".icon-btn[data-close]")?.focus();
}
function closeModal(id) {
  document.getElementById(id).hidden = true;
  lastFocusedBeforeModal?.focus?.();
  lastFocusedBeforeModal = null;
}
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const open = document.querySelector(".modal-backdrop:not([hidden])");
    if (open) closeModal(open.id);
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

// ---------- Install prompt ----------
//
// Chromium browsers fire `beforeinstallprompt` once, early, and expect the
// page to hang onto the event and trigger it later on the page's own
// terms — Chrome deliberately doesn't show its own UI unless asked, so
// this is the *only* way to offer an install action at all. Safari/
// Firefox never fire this event; on those, the banner below just never
// appears, which is the correct (if quieter) outcome — there's no
// equivalent programmatic prompt to fall back to there.

const INSTALL_DISMISSED_KEY = "bordercross.installPromptDismissed";
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {}
});

function installPromptAvailable() {
  if (!deferredInstallPrompt) return false;
  try {
    return !localStorage.getItem(INSTALL_DISMISSED_KEY);
  } catch {
    return true;
  }
}

function dismissInstallBanner() {
  els.installBanner.hidden = true;
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {}
}

els.installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  dismissInstallBanner();
});
els.installDismissBtn.addEventListener("click", dismissInstallBanner);

// ---------- Colorblind-friendly share squares ----------
//
// Lives right on the result modal (next to the button it actually affects)
// rather than in the top bar, since it's a share-time preference — but it
// still persists across sessions like every other setting here.

const COLORBLIND_KEY = "bordercross.colorblindShare";

(function initColorblindToggle() {
  try {
    els.colorblindToggle.checked = localStorage.getItem(COLORBLIND_KEY) === "1";
  } catch {}
})();

els.colorblindToggle.addEventListener("change", () => {
  try {
    localStorage.setItem(COLORBLIND_KEY, els.colorblindToggle.checked ? "1" : "0");
  } catch {}
});

// ---------- Unlimited mode difficulty ----------

const DIFFICULTY_PICKER_KEY = "bordercross.unlimitedDifficulty";
// Easy/Medium/Hard match difficultyFor() (js/graph.js) and the daily's own
// DIFFICULTY_TIERS (js/daily.js), so the badge you see always matches the
// difficulty you picked. "Any" is deliberately untouched — a wide-open,
// no-promises range, not tied to the Easy/Medium/Hard vocabulary at all —
// so a quick 2-move puzzle is still just a New Game press away.
const DIFFICULTY_RANGES = {
  any: { minMoves: 2, maxMoves: 14 },
  easy: { minMoves: 4, maxMoves: 6 },
  medium: { minMoves: 7, maxMoves: 11 },
  hard: { minMoves: 12, maxMoves: 22 },
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

const RESTRICTIONS_PICKER_KEY = "bordercross.unlimitedRestrictions";

(function initRestrictionsPicker() {
  try {
    const stored = localStorage.getItem(RESTRICTIONS_PICKER_KEY);
    if (stored) els.restrictionsPicker.value = stored;
  } catch {}
})();

els.restrictionsPicker.addEventListener("change", () => {
  try {
    localStorage.setItem(RESTRICTIONS_PICKER_KEY, els.restrictionsPicker.value);
  } catch {}
});

const REGION_PICKER_KEY = "bordercross.unlimitedRegion";

for (const [key, group] of Object.entries(REGION_GROUPS)) {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = group.label;
  els.regionPicker.appendChild(opt);
}

(function initRegionPicker() {
  try {
    const stored = localStorage.getItem(REGION_PICKER_KEY);
    if (stored && (stored === "any" || REGION_GROUPS[stored])) els.regionPicker.value = stored;
  } catch {}
})();

els.regionPicker.addEventListener("change", () => {
  try {
    localStorage.setItem(REGION_PICKER_KEY, els.regionPicker.value);
  } catch {}
});

/** Country-code pool for Unlimited's region filter, or null for "any" —
 * randomPair() treats null the same as no filter at all. */
function unlimitedRegionCodes() {
  const key = els.regionPicker.value;
  return key && key !== "any" ? codesInRegionGroup(key) : null;
}

/** Generates a fresh Unlimited pair and starts it. Restrictions follow
 * the picker: "random" rolls the same chance the daily challenge gets
 * (just unseeded), "off" never applies one, and "on" retries with fresh
 * pairs until one actually supports a restriction (see pickRestrictions'
 * own eligibility rules in game.js) rather than silently giving up. */
function startNewUnlimitedGame() {
  const restrictionMode = els.restrictionsPicker.value;
  const codePool = unlimitedRegionCodes();
  let start;
  let dest;
  let restrictedCodes = [];

  if (restrictionMode === "on") {
    for (let attempt = 0; attempt < 20; attempt++) {
      [start, dest] = randomPair(graph, { ...unlimitedRange(), codePool });
      restrictedCodes = pickRestrictions(graph, start, dest, Math.random, { chance: 1 });
      if (restrictedCodes.length > 0) break;
    }
  } else {
    [start, dest] = randomPair(graph, { ...unlimitedRange(), codePool });
    if (restrictionMode !== "off") restrictedCodes = pickRestrictions(graph, start, dest);
  }

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
  syncCatchUpBanner();

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

/** Loads (or generates) the Classic puzzle for `dateKey`, defaulting to
 * today. Also used to "replay" a missed earlier day (see isReplayingPastDay
 * below) — same puzzle, same persistence, same streak-recording, just
 * pointed at a different date. */
function loadDailyPuzzle(dateKey = todayKey()) {
  currentDailyKey = dateKey;
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

// ---------- Catch-up: replaying a missed day ----------
//
// True while Classic is showing an earlier day's puzzle instead of today's.
// `mode` deliberately stays "classic" throughout — every existing
// `mode === "classic"` check (persistence, streak recording, the daily
// countdown note) keeps working unchanged, since they all key off
// `currentDailyKey`, which this temporarily repoints at the earlier date.
let isReplayingPastDay = false;

/** Offered only for exactly yesterday, and only if it wasn't already
 * finished — no open-ended archive browsing, so the "same puzzle for
 * everyone" fairness Classic relies on stays intact for every other day. */
function canReplayYesterday() {
  const y = addDays(todayKey(), -1);
  if (puzzleNumber(y) < 0) return false; // before the archive existed
  const saved = loadDailyState(y);
  return !saved || saved.status === "playing";
}

function syncCatchUpBanner() {
  els.catchUpBanner.hidden = mode !== "classic" || isReplayingPastDay || !canReplayYesterday();
}

function returnToToday() {
  isReplayingPastDay = false;
  loadDailyPuzzle(todayKey());
  renderActiveGameView();
  if (activeGame.status !== "playing") showCompletedResult(activeGame.result());
}

els.catchUpBtn.addEventListener("click", () => {
  isReplayingPastDay = true;
  loadDailyPuzzle(addDays(todayKey(), -1));
  renderActiveGameView();
  if (activeGame.status !== "playing") showCompletedResult(activeGame.result());
});

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
    // Skipped while replaying a missed day — currentDailyKey is
    // *intentionally* not today then, and forcing it back would yank the
    // player out of the puzzle they just chose to catch up on.
    if (!isReplayingPastDay && key !== currentDailyKey) {
      loadDailyPuzzle();
      if (mode === "classic") {
        renderActiveGameView();
        renderFeedback(els, "🌅 A new daily puzzle just dropped!", "info");
      }
    }
    syncNewGameButton();
    syncCatchUpBanner();
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
  els.restrictionsPicker.hidden = mode !== "unlimited";
  els.regionPicker.hidden = mode !== "unlimited";

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
  if (isReplayingPastDay) {
    returnToToday();
  } else if (mode === "unlimited") {
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
  const stats = recordResult(result);
  const newlyUnlocked = checkAchievements({ stats, streak: loadStreakStats(), game: activeGame, result });
  showResultModal(result, newlyUnlocked);
  if (result.status === "won") {
    playWin(result.perfect);
    burstConfetti(els.confettiLayer);
  }
}

/** Used when restoring an already-completed daily puzzle — shows the same
 * modal without double-recording stats (and without re-announcing
 * achievements already unlocked in a previous session). */
function showCompletedResult(result) {
  showResultModal(result);
}

function showResultModal(result, newlyUnlocked = []) {
  lastResult = result;
  renderResult(els, activeGame, result);
  renderNewAchievements(els.resultBody, newlyUnlocked);
  els.countryInput.disabled = true;
  els.hintBtn.disabled = true;
  els.giveUpBtn.disabled = true;

  els.playAgainBtn.hidden = mode === "classic" && !isReplayingPastDay;
  els.playAgainBtn.textContent = isReplayingPastDay ? "Back to Today" : "New Game";
  els.dailyNextNote.hidden = mode !== "classic";
  if (mode === "classic") {
    const streak = loadStreakStats();
    const streakText = streak.current > 0 ? `🔥 ${streak.current}-day streak` : "Streak reset — start a new one tomorrow";
    els.dailyNextNote.textContent = `${streakText} · Next daily puzzle in ${formatCountdown(msUntilNextMidnight())}.`;
  }

  els.shareBtn.textContent = "Share Result";
  els.installBanner.hidden = !(result.status === "won" && installPromptAvailable());
  openModal("resultModal");
}

/** The base app URL for most shares, but a Custom-mode challenge link
 * (?start=XX&dest=YY) for Custom — see tryStartChallengeFromUrl(). Always
 * the site root rather than `location.pathname` verbatim — however this
 * particular visitor arrived (a bookmark to /index.html, a trailing
 * slash-less link, whatever), the shared link should be the one clean
 * canonical URL, not a mirror of however they got here. */
function shareUrlFor() {
  const base = `${location.origin}/`;
  if (mode !== "custom") return base;
  return `${base}?start=${activeGame.startCode}&dest=${activeGame.destCode}`;
}

els.shareBtn.addEventListener("click", async () => {
  if (!lastResult) return;
  const share = buildShareText(activeGame, lastResult, {
    puzzleNumber: mode === "classic" ? puzzleNumber(currentDailyKey) : null,
    url: shareUrlFor(),
    colorblind: els.colorblindToggle.checked,
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
    map.renderCompletion(activeGame);
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

function refreshStatsView() {
  const stats = loadStats();
  renderStats(els.statsGrid, stats, loadStreakStats());
  renderMoveDistribution(els.moveDistribution, stats);
  renderTrendChart(els.trendChart, stats);
}

els.statsBtn.addEventListener("click", () => {
  refreshStatsView();
  openModal("statsModal");
});
els.resetStatsBtn.addEventListener("click", () => {
  if (!confirm("Reset all statistics? This can't be undone.")) return;
  resetStats();
  resetAchievements();
  refreshStatsView();
});

els.exportProgressBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(exportProgress(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bordercross-progress-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

els.importProgressBtn.addEventListener("click", () => els.importProgressInput.click());

els.importProgressInput.addEventListener("change", async () => {
  const file = els.importProgressInput.files[0];
  els.importProgressInput.value = ""; // let the same file be re-picked later if needed
  if (!file) return;
  if (!confirm("Import progress from this file? This replaces your current stats, streak, and achievements.")) return;

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    alert("Couldn't read that file — make sure it's a BorderCross progress export.");
    return;
  }
  const result = importProgress(parsed);
  if (!result.ok) {
    alert(result.error);
    return;
  }
  refreshStatsView();
  alert("Progress imported.");
});
els.howToBtn.addEventListener("click", () => openModal("howToModal"));
els.achievementsBtn.addEventListener("click", () => {
  renderAchievements(els.achievementsGrid, els.achievementsProgress, loadUnlocked());
  openModal("achievementsModal");
});

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

/** Shared by the picker (beginCustomChallenge) and a challenge link opened
 * from a friend's share (tryStartChallengeFromUrl) — whichever route got
 * here, activating a Custom run looks the same. */
function activateCustomGame(startCode, destCode) {
  if (mode === "classic") persistDaily();
  games.custom.start(startCode, destCode);
  mode = "custom";
  activeGame = games.custom;
  els.modeClassicBtn.setAttribute("aria-pressed", "false");
  els.modeUnlimitedBtn.setAttribute("aria-pressed", "false");
  els.modeCustomBtn.setAttribute("aria-pressed", "true");
  els.difficultyPicker.hidden = true;
  els.restrictionsPicker.hidden = true;
  els.regionPicker.hidden = true;
  syncNewGameButton();
}

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
  activateCustomGame(start[0], dest[0]);
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

/** A Custom-mode Share Result link encodes ?start=XX&dest=YY — opening it
 * drops a friend straight into the same pair instead of them having to set
 * it up themselves. Consumed once at boot; the query string is then
 * stripped so it doesn't linger in the address bar or get re-triggered on
 * a later reload/bookmark. */
function tryStartChallengeFromUrl() {
  const params = new URLSearchParams(location.search);
  const start = (params.get("start") || "").toUpperCase();
  const dest = (params.get("dest") || "").toUpperCase();
  if (!start || !dest || start === dest || !graph.has(start) || !graph.has(dest)) return false;

  activateCustomGame(start, dest);
  history.replaceState(null, "", "/");
  return true;
}

// ---------- Boot ----------

loadDailyPuzzle();
tryStartChallengeFromUrl();
renderActiveGameView();
if (activeGame.status !== "playing") showCompletedResult(activeGame.result());
startCountdown();
