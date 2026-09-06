// BorderCross — export/import of local progress.
//
// Stats, streak, and achievements all live only in this browser's
// localStorage — no account, no server (see README). That's good for
// privacy, but it means clearing site data, switching browsers, or losing
// a browser profile wipes it silently, with no way back. This module lets
// a player download that data as a small JSON file and restore it later,
// on this device or a different one.

const BACKUP_KEYS = ["bordercross.stats.v1", "bordercross.streak.v1", "bordercross.achievements.v1"];
const BACKUP_VERSION = 1;

/** A plain JSON-serializable snapshot of everything importProgress() can
 * restore. Values are stored as their raw (already-serialized) strings —
 * this module doesn't need to understand each key's shape, just carry it
 * faithfully, so it keeps working even if stats.js/achievements.js add
 * fields later. */
export function exportProgress() {
  const data = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw != null) data[key] = raw;
  }
  return { app: "bordercross", backupVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

/**
 * Restores a previously exported blob, overwriting whatever progress is
 * currently stored for any key present in the file — callers should
 * confirm with the player before calling this, same as Reset Statistics.
 * Validates everything before writing anything, so a corrupt file can't
 * leave localStorage half-updated.
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function importProgress(parsed) {
  if (!parsed || parsed.app !== "bordercross" || !parsed.data || typeof parsed.data !== "object") {
    return { ok: false, error: "That doesn't look like a BorderCross progress file." };
  }

  const entries = [];
  for (const key of BACKUP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(parsed.data, key)) continue;
    const raw = parsed.data[key];
    if (typeof raw !== "string") return { ok: false, error: "That file's progress data looks corrupted." };
    try {
      JSON.parse(raw);
    } catch {
      return { ok: false, error: "That file's progress data looks corrupted." };
    }
    entries.push([key, raw]);
  }

  for (const [key, raw] of entries) {
    try {
      localStorage.setItem(key, raw);
    } catch {
      return { ok: false, error: "Couldn't save — your browser's storage may be full or restricted." };
    }
  }
  return { ok: true };
}
