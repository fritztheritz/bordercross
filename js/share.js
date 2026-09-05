// BorderCross — Wordle-style shareable result text.
//
// The share text never contains country names — only flags, numbers, and
// a row of squares — so sharing a result can't spoil the puzzle for
// someone who hasn't played it yet.

import { flagEmoji } from "./lookup.js";

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * @param {import("./game.js").Game} game
 * @param {object} result - Game#result() output
 * @param {{ puzzleNumber?: number, url?: string }} [opts]
 * @returns {{ text: string, html: string|null, url: string|null }}
 *   `text` is plain (no link — the URL is a separate field so native share
 *   sheets and clipboard fallbacks can each place it correctly). `html` is
 *   the same content with "BorderCross" itself as the clickable link, for
 *   pasting into rich-text targets (Slack, Gmail, Notion, ...).
 */
export function buildShareText(game, result, opts = {}) {
  const start = flagEmoji(game.startCode);
  const dest = flagEmoji(game.destCode);
  const headerRest = opts.puzzleNumber != null ? ` #${opts.puzzleNumber} ${start} → ${dest}` : ` ${start} → ${dest}`;

  let statusLine;
  if (result.status === "won") {
    statusLine = result.perfect
      ? `🏆 Perfect — ${result.playerMoves} move${result.playerMoves === 1 ? "" : "s"}`
      : `${result.playerMoves} moves (optimal: ${result.optimalMoves})`;
    if (result.hintsUsed) {
      statusLine += ` · ${result.hintsUsed} hint${result.hintsUsed === 1 ? "" : "s"}`;
    }
  } else {
    const found = game.slotsFilled;
    statusLine = `🏳️ Gave up — found ${found}/${game.slotCount}`;
  }
  // Ordered to match the actual guesses: a wrong or redundant guess shows
  // up exactly where it happened, not lumped at the end.
  const squares = game.shareSquares();

  const lines = [`BorderCross${headerRest}`, statusLine, squares];
  if (game.restrictedCodes && game.restrictedCodes.size > 0) {
    const restrictedFlags = [...game.restrictedCodes].map(flagEmoji).join(" ");
    lines.push(`🚫 Off-limits: ${restrictedFlags}`);
  }

  const text = lines.join("\n");
  const html = opts.url
    ? [`<a href="${escapeHtml(opts.url)}">BorderCross</a>${escapeHtml(headerRest)}`, ...lines.slice(1).map(escapeHtml)].join(
        "<br>"
      )
    : null;

  return { text, html, url: opts.url || null };
}

/**
 * Shares via the native share sheet when available (mobile — lets the
 * player send straight to Messages, exactly like Wordle), falling back to
 * a clipboard copy on desktop. The clipboard copy writes both a plain-text
 * version (URL appended as a trailing line, since plain text can't carry a
 * real link) and a rich-text version (the "BorderCross" wordmark itself is
 * the hyperlink) — whichever the paste target supports wins.
 * @param {{ text: string, html: string|null, url: string|null }} share
 * @returns {Promise<"shared"|"copied"|"cancelled"|"failed">}
 */
export async function shareResult({ text, html, url }) {
  if (navigator.share) {
    try {
      await navigator.share(url ? { text, url } : { text });
      return "shared";
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
      // Fall through to clipboard on any other share failure.
    }
  }

  const plainWithUrl = url ? `${text}\n${url}` : text;
  try {
    if (html && window.ClipboardItem && navigator.clipboard.write) {
      const item = new ClipboardItem({
        "text/plain": new Blob([plainWithUrl], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      });
      await navigator.clipboard.write([item]);
      return "copied";
    }
    await navigator.clipboard.writeText(plainWithUrl);
    return "copied";
  } catch {
    return "failed";
  }
}
