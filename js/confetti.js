// BorderCross — a small CSS-only confetti burst for winning. No canvas,
// no library: a handful of absolutely-positioned pieces that fall and
// remove themselves. Skipped entirely under prefers-reduced-motion.

const COLORS = ["#d9a441", "#2b8c82", "#3e9b6f", "#c6564b", "#5b8def"];

export function burstConfetti(container, { count = 36 } = {}) {
  if (!container) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 180}px`);
    piece.style.setProperty("--rotate", `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty("--delay", `${(Math.random() * 0.25).toFixed(2)}s`);
    piece.style.setProperty("--duration", `${(1.1 + Math.random() * 0.7).toFixed(2)}s`);
    piece.style.background = COLORS[i % COLORS.length];
    piece.addEventListener("animationend", () => piece.remove());
    container.appendChild(piece);
  }
}
