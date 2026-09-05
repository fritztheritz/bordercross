// Bordercross — tiny synthesized sound effects via the Web Audio API.
// No audio assets to ship: every sound here is a couple of oscillator
// tones, generated on the fly and gone in a fraction of a second.

const STORAGE_KEY = "bordercross.sound";

export function soundEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage unavailable — the toggle just won't be remembered.
  }
}

let ctx;
function audioCtx() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!ctx) ctx = new AudioCtor();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, offset, duration, { type = "sine", gain = 0.14 } = {}) {
  if (!soundEnabled()) return;
  const c = audioCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + offset;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** A correctly-found step (new slot or a redundant-but-valid alternate). */
export function playFound() {
  tone(720, 0, 0.11, { type: "sine", gain: 0.12 });
}

/** A guess that isn't on any shortest path. */
export function playWrong() {
  tone(160, 0, 0.16, { type: "square", gain: 0.07 });
}

/** Route complete — a short rising arpeggio, longer for a perfect run. */
export function playWin(perfect) {
  const notes = perfect ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => tone(freq, i * 0.1, 0.22, { type: "triangle", gain: 0.13 }));
}
