// BorderCross — DOM rendering helpers. Pure-ish: given state + elements,
// update the page. Event wiring lives in main.js.

import { flagIconEl, flagIconHtml, searchCountries } from "./lookup.js";
import { difficultyFor } from "./graph.js";
import { averageMoves, averageEfficiency, formatTime, DISTRIBUTION_BUCKETS } from "./stats.js";
import { ACHIEVEMENTS } from "./achievements.js";

const DISTRIBUTION_LABELS = { "0": "Perfect", "1": "+1", "2": "+2", "3": "+3", "4+": "+4 or more" };

export function renderTicket(els, { startEntry, destEntry, optimalMoves }) {
  els.startFlag.replaceChildren(flagIconEl(startEntry[0]));
  els.startName.textContent = startEntry[1];
  els.destFlag.replaceChildren(flagIconEl(destEntry[0]));
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
      chip.append(flagIconEl(code), document.createTextNode(` ${game.countryName(code)}`));
    } else if (isStart) {
      chip.className = "chain-chip start";
      chip.append(flagIconEl(code), document.createTextNode(` ${game.countryName(code)}`));
    } else if (code != null) {
      chip.className = "chain-chip visited";
      chip.append(flagIconEl(code), document.createTextNode(` ${game.countryName(code)}`));
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
    chip.append(flagIconEl(code), document.createTextNode(` ${game.countryName(code)}`));
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
    chip.append(flagIconEl(code), document.createTextNode(` ${game.countryName(code)}`));
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
      btn.append(flagIconEl(country[0]), document.createTextNode(` ${country[1]}`));
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

/** A small trend line of efficiency (optimal ÷ actual moves) across the
 * player's most recent wins — oldest on the left, most recent on the
 * right — so a returning player can see "am I getting better" at a
 * glance, alongside the move-distribution chart above it. */
export function renderTrendChart(container, stats) {
  container.innerHTML = "";
  const games = stats.recentGames || [];
  if (games.length < 2) {
    const empty = document.createElement("p");
    empty.className = "muted dist-empty";
    empty.textContent = "Win a few more rounds to see your efficiency trend here.";
    container.appendChild(empty);
    return;
  }

  const w = 280;
  const h = 56;
  const pad = 4;
  const points = games
    .map((g, i) => {
      const x = pad + (i / (games.length - 1)) * (w - pad * 2);
      const y = pad + (1 - g.efficiency / 100) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "trend-svg");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Efficiency trend over your last ${games.length} wins`);
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "currentColor");
  polyline.setAttribute("stroke-width", "2");
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");
  svg.appendChild(polyline);
  container.appendChild(svg);

  const caption = document.createElement("p");
  caption.className = "muted trend-caption";
  caption.textContent = `Efficiency over your last ${games.length} win${games.length === 1 ? "" : "s"}`;
  container.appendChild(caption);
}

/** Every achievement, unlocked ones in full color, locked ones dimmed but
 * still showing their icon/title/description — knowing what you're
 * working toward is more motivating than a mystery box. */
export function renderAchievements(grid, progressEl, unlockedIds) {
  grid.innerHTML = "";
  let unlockedCount = 0;
  for (const achievement of ACHIEVEMENTS) {
    const isUnlocked = unlockedIds.has(achievement.id);
    if (isUnlocked) unlockedCount++;
    const tile = document.createElement("div");
    tile.className = `achievement-tile ${isUnlocked ? "unlocked" : "locked"}`;
    tile.innerHTML = `
      <div class="achievement-icon">${achievement.icon}</div>
      <div class="achievement-title">${achievement.title}</div>
      <div class="achievement-desc">${achievement.description}</div>
    `;
    grid.appendChild(tile);
  }
  progressEl.textContent = `${unlockedCount} / ${ACHIEVEMENTS.length} unlocked`;
}

/** Appends a "just unlocked" callout to the result modal — only for
 * achievements earned by *this* game, never on a restored/replayed one. */
export function renderNewAchievements(container, newlyUnlocked) {
  if (!newlyUnlocked || newlyUnlocked.length === 0) return;
  const wrap = document.createElement("div");
  wrap.className = "achievement-unlock-list";
  for (const achievement of newlyUnlocked) {
    const row = document.createElement("div");
    row.className = "achievement-unlock-row";
    row.innerHTML = `
      <span class="achievement-unlock-icon">${achievement.icon}</span>
      <span>
        <span class="achievement-unlock-label">Achievement unlocked</span>
        <strong>${achievement.title}</strong>
        <span class="muted">— ${achievement.description}</span>
      </span>
    `;
    wrap.appendChild(row);
  }
  container.appendChild(wrap);
}

function restrictionsRecap(game) {
  if (!game.restrictedCodes || game.restrictedCodes.size === 0) return "";
  const names = [...game.restrictedCodes].map((c) => `${flagIconHtml(c)} ${game.countryName(c)}`).join(", ");
  return `<p class="muted restrictions-recap">🚫 Off-limits this run: ${names}</p>`;
}

export function renderResult(els, game, result) {
  if (result.status === "won") {
    els.resultHeadline.textContent = result.perfect ? "🏆 Perfect route!" : "🎉 You made it!";
    const routeText = result.route
      .map((c) => `${flagIconHtml(c)} ${game.countryName(c)}`)
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
          ${result.perfect ? '<span class="perfect-tag">Perfect route</span>' : ""}
        </div>
      </div>
      ${result.hintsUsed ? `<p class="muted">Hints used: ${result.hintsUsed}</p>` : ""}
      ${restrictionsRecap(game)}
    `;
  } else {
    els.resultHeadline.textContent = "🏳️ Route revealed";
    const optimalText = result.optimalPath
      .map((c) => `${flagIconHtml(c)} ${game.countryName(c)}`)
      .join("  →  ");
    const yourText = result.route.map((c) => `${flagIconHtml(c)} ${game.countryName(c)}`).join("  →  ");
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
