// Bordercross — Wordle-style shareable result text.
//
// The share text never contains country names — only flags, numbers, and
// a row of squares — so sharing a result can't spoil the puzzle for
// someone who hasn't played it yet.

import { flagEmoji } from "./lookup.js";

/**
 * @param {import("./game.js").Game} game
 * @param {object} result - Game#result() output
 * @param {{ puzzleNumber?: number, url?: string }} [opts]
 */
export function buildShareText(game, result, opts = {}) {
  const start = flagEmoji(game.startCode);
  const dest = flagEmoji(game.destCode);
  const header =
    opts.puzzleNumber != null
      ? `Bordercross #${opts.puzzleNumber} ${start} → ${dest}`
      : `Bordercross ${start} → ${dest}`;

  let statusLine;
  let squares;

  if (result.status === "won") {
    statusLine = result.perfect
      ? `🏆 Perfect — ${result.playerMoves}/${result.optimalMoves} moves`
      : `${result.playerMoves}/${result.optimalMoves} moves (${result.efficiency}% efficiency)`;
    const extra = Math.max(0, result.playerMoves - result.optimalMoves);
    squares = "🟩".repeat(result.optimalMoves) + "🟨".repeat(extra);
    if (result.hintsUsed) {
      statusLine += ` · ${result.hintsUsed} hint${result.hintsUsed === 1 ? "" : "s"}`;
    }
  } else {
    const found = game.slotsFilled;
    statusLine = `🏳️ Gave up — found ${found}/${game.slotCount}`;
    squares = "🟩".repeat(found) + "⬛".repeat(game.slotCount - found);
  }

  const scoreLine = result.status === "won" ? `Score: ${result.score}` : null;

  return [header, statusLine, squares, scoreLine, opts.url].filter(Boolean).join("\n");
}

/**
 * Shares via the native share sheet when available (mobile — lets the
 * player send straight to Messages, exactly like Wordle), falling back to
 * clipboard copy on desktop.
 * @returns {Promise<"shared"|"copied"|"cancelled"|"failed">}
 */
export async function shareResult(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      // Fall through to clipboard on any other share failure.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
