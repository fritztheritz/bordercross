// BorderCross — DOM rendering helpers. Pure-ish: given state + elements,
// update the page. Event wiring lives in main.js.

import { flagEmoji, searchCountries } from "./lookup.js";
import { difficultyFor } from "./graph.js";
import { averageMoves, averageEfficiency, formatTime, DISTRIBUTION_BUCKETS } from "./stats.js";

const DISTRIBUTION_LABELS = { "0": "Perfect", "1": "+1", "2": "+2", "3": "+3", "4+": "+4 or more" };

export function renderTicket(els, { startEntry, destEntry, optimalMoves }) {
  els.startFlag.textContent = flagEmoji(startEntry[0]);
  els.startName.textContent = startEntry[1];
  els.destFlag.textContent = flagEmoji(destEntry[0]);
  els.destName.textContent = destEntry[1];

  els.optimalMovesText.textContent = `${optimalMoves} move${optimalMoves === 1 ? "" : "s"} possible`;

  const difficulty = difficultyFor(optimalMoves);
  els.difficultyBadge.textContent = difficulty;
  els.difficultyBadge.className = `difficulty-badge difficulty-${difficulty.toLowerCase()}`;
}

/** Renders Start → [found or blank slot] × N → Destination. Slots can be
 * filled in any order (see game.js), but always display in their correct
 * position, so the chain reads correctly regardless of discovery order. */
export function renderRouteChain(els, game) {
  els.routeChain.innerHTML = "";
  const frag = document.createDocumentFragment();
  const sequence = game.displaySequence();

  sequence.forEach((code, i) => {
    if (i > 0) {
      const arrow = document.createElement("span");
      arrow.className = "chain-arrow";
      arrow.textContent = "→";
      frag.appendChild(arrow);
    }

    const isStart = i === 0;
    const isDest = i === sequence.length - 1;
    const chip = document.createElement("span");

    if (isDest) {
      chip.className = `chain-chip dest${game.status === "won" ? " reached" : ""}`;
      chip.textContent = `${flagEmoji(code)} ${game.countryName(code)}`;
    } else if (isStart) {
      chip.className = "chain-chip start";
      chip.textContent = `${flagEmoji(code)} ${game.countryName(code)}`;
    } else if (code != null) {
      chip.className = "chain-chip visited";
      chip.textContent = `${flagEmoji(code)} ${game.countryName(code)}`;
    } else {
      chip.className = "chain-chip blank";
      chip.textContent = `· ${i} ·`;
    }
    frag.appendChild(chip);
  });

  els.routeChain.appendChild(frag);
}

export function renderFeedback(els, message, kind, tag) {
  els.feedback.className = `feedback ${kind}`;
  els.feedback.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = message;
  els.feedback.appendChild(text);
  if (tag) {
    const tagEl = document.createElement("span");
    tagEl.className = "connection-tag";
    tagEl.textContent = tag;
    els.feedback.appendChild(tagEl);
  }
}

export function clearFeedback(els) {
  els.feedback.className = "feedback";
  els.feedback.innerHTML = "";
}

/** Countries the player has guessed that turned out not to be on the
 * shortest route — a running "already tried, don't bother again" list. */
export function renderWrongGuesses(els, game) {
  els.wrongGuesses.innerHTML = "";
  if (!game.wrongGuesses || game.wrongGuesses.size === 0) return;

  const label = document.createElement("span");
  label.className = "wrong-guesses-label";
  label.textContent = "Ruled out:";
  els.wrongGuesses.appendChild(label);

  for (const code of game.wrongGuesses) {
    const chip = document.createElement("span");
    chip.className = "wrong-guess-chip";
    chip.textContent = `${flagEmoji(code)} ${game.countryName(code)}`;
    els.wrongGuesses.appendChild(chip);
  }
}

/** The countries this run bans the route from passing through at all —
 * shown up front so the constraint is a puzzle element, not a surprise. */
export function renderRestrictions(els, game) {
  const restricted = game.restrictedCodes;
  const hasRestrictions = restricted && restricted.size > 0;
  els.restrictionsBanner.hidden = !hasRestrictions;
  if (!hasRestrictions) return;

  els.restrictionsList.innerHTML = "";
  for (const code of restricted) {
    const chip = document.createElement("span");
    chip.className = "restriction-chip";
    chip.textContent = `${flagEmoji(code)} ${game.countryName(code)}`;
    els.restrictionsList.appendChild(chip);
  }
}

/** Wires an input + suggestions box to live-filter countries. Returns
 * a controller with `.getSelection()` clearing on pick, and `.reset()`. */
export function attachAutocomplete(input, box, { onSelect, excludeCodes = () => [] } = {}) {
  let items = [];
  let activeIndex = -1;

  function close() {
    box.innerHTML = "";
    items = [];
    activeIndex = -1;
  }

  function renderItems() {
    box.innerHTML = "";
    items.forEach((country, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggestion-item" + (i === activeIndex ? " active" : "");
      btn.setAttribute("role", "option");
      btn.textContent = `${flagEmoji(country[0])} ${country[1]}`;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = country[1];
        close();
        onSelect?.(country);
      });
      box.appendChild(btn);
    });
  }

  input.addEventListener("input", () => {
    const excluded = new Set(excludeCodes());
    items = searchCountries(input.value).filter((c) => !excluded.has(c[0]));
    activeIndex = -1;
    renderItems();
  });

  input.addEventListener("keydown", (e) => {
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      renderItems();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      renderItems();
    } else if (e.key === "Escape") {
      close();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const country = items[activeIndex];
      input.value = country[1];
      close();
      onSelect?.(country);
    }
  });

  input.addEventListener("blur", () => setTimeout(close, 120));

  return { close };
}

export function renderStats(grid, stats, streak) {
  const tiles = [
    ["Games played", stats.gamesPlayed],
    ["Games won", stats.gamesWon],
    ["Best score", stats.bestScore],
    ["Perfect routes", stats.perfectRoutes],
    ["Avg. moves", averageMoves(stats)],
    ["Avg. efficiency", averageEfficiency(stats)],
    ["Longest route completed", stats.longestRouteCompleted || "—"],
    ["Fastest completion", formatTime(stats.fastestTimeMs)],
  ];
  if (streak) {
    tiles.push(["Daily streak", streak.current ? `🔥 ${streak.current}` : 0]);
    tiles.push(["Best daily streak", streak.max]);
  }
  grid.innerHTML = "";
  for (const [label, value] of tiles) {
    const tile = document.createElement("div");
    tile.className = "stat-tile";
    tile.innerHTML = `<div class="stat-value mono">${value}</div><div class="stat-label">${label}</div>`;
    grid.appendChild(tile);
  }
}

/** Horizontal bar chart of extra-moves-beyond-optimal across wins — the
 * most recently completed game's bucket is highlighted, Wordle-style. */
export function renderMoveDistribution(container, stats) {
  container.innerHTML = "";
  const counts = DISTRIBUTION_BUCKETS.map((b) => stats.moveDistribution?.[b] || 0);
  const total = counts.reduce((a, b) => a + b, 0);

  if (total === 0) {
    const empty = document.createElement("p");
    empty.className = "muted dist-empty";
    empty.textContent = "Win a few rounds to see your move distribution here.";
    container.appendChild(empty);
    return;
  }

  const max = Math.max(...counts);
  DISTRIBUTION_BUCKETS.forEach((bucket, i) => {
    const count = counts[i];
    const isCurrent = stats.lastBucket === bucket;
    const widthPct = count === 0 ? 0 : Math.max(8, (count / max) * 100);

    const row = document.createElement("div");
    row.className = "dist-row";
    row.innerHTML = `
      <span class="dist-label">${DISTRIBUTION_LABELS[bucket]}</span>
      <span class="dist-bar-track">
        <span class="dist-bar${isCurrent ? " dist-bar-current" : ""}" style="width:${widthPct}%"></span>
      </span>
      <span class="dist-count mono">${count}</span>
    `;
    container.appendChild(row);
  });
}

function restrictionsRecap(game) {
  if (!game.restrictedCodes || game.restrictedCodes.size === 0) return "";
  const names = [...game.restrictedCodes].map((c) => `${flagEmoji(c)} ${game.countryName(c)}`).join(", ");
  return `<p class="muted restrictions-recap">🚫 Off-limits this run: ${names}</p>`;
}

export function renderResult(els, game, result) {
  if (result.status === "won") {
    els.resultHeadline.textContent = result.perfect ? "🏆 Perfect route!" : "🎉 You made it!";
    const routeText = result.route
      .map((c) => `${flagEmoji(c)} ${game.countryName(c)}`)
      .join("  →  ");
    els.resultBody.innerHTML = `
      <div class="result-route">${routeText}</div>
      <div class="result-highlight-row">
        <div class="result-highlight">
          <div class="result-highlight-number mono">${result.playerMoves}</div>
          <div class="result-highlight-label">move${result.playerMoves === 1 ? "" : "s"}</div>
        </div>
        <div class="result-meta">
          <span class="big mono">Optimal: ${result.optimalMoves}</span>
          <span class="muted mono">${result.efficiency}% efficiency</span>
          ${result.perfect ? '<span class="perfect-tag">Perfect route</span>' : ""}
        </div>
      </div>
      ${result.hintsUsed ? `<p class="muted">Hints used: ${result.hintsUsed}</p>` : ""}
      ${restrictionsRecap(game)}
    `;
  } else {
    els.resultHeadline.textContent = "🏳️ Route revealed";
    const optimalText = result.optimalPath
      .map((c) => `${flagEmoji(c)} ${game.countryName(c)}`)
      .join("  →  ");
    const yourText = result.route.map((c) => `${flagEmoji(c)} ${game.countryName(c)}`).join("  →  ");
    els.resultBody.innerHTML = `
      <p class="muted">Your route so far:</p>
      <div class="result-route">${yourText}</div>
      <p class="muted">Optimal route:</p>
      <div class="result-route">${optimalText}</div>
      <p class="mono">Optimal moves: ${result.optimalMoves}</p>
      ${restrictionsRecap(game)}
    `;
  }
}
