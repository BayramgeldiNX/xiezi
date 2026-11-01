// Small motion helpers. Everything JS-driven lives here so reduced motion is honoured in one place.
// Timing: press 100ms, the rest 150 to 250ms. Only transform and opacity (and the progress bar width).

export const EASE = "cubic-bezier(.2, .8, .2, 1)";
export const MED = 200;

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Web Animations with no fill mode, so nothing is left on the element afterwards. Does nothing under reduced motion.
export function animate(el, keyframes, options = {}) {
  if (!el || typeof el.animate !== "function" || reduced()) return;
  el.animate(keyframes, { duration: MED, easing: EASE, ...options, fill: "none" });
}

/* ---------- Page slides ---------- */
const DEPTH1 = ["books", "review", "typing", "search", "notebook"];
export function pageDepth(hash) {
  const parts = String(hash || "").replace(/^#\/?/, "").split("/");
  const page = parts[0];
  if (!page) return 0;
  if (DEPTH1.includes(page)) return page === "notebook" && parts[1] ? 2 : 1;
  if (page === "book") return 2;
  if (page === "lesson") return 3;
  if (page === "print") return 4;
  return 0;
}

export function slideDirection(fromHash, toHash) {
  const a = pageDepth(fromHash), b = pageDepth(toHash);
  return b > a ? "forward" : b < a ? "back" : "none";
}

export function slidePage(el, direction) {
  if (direction === "forward") animate(el, [{ transform: "translateX(32px)", opacity: 0 }, { transform: "none", opacity: 1 }]);
  else if (direction === "back") animate(el, [{ transform: "translateX(-32px)", opacity: 0 }, { transform: "none", opacity: 1 }]);
  else animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
}

/* ---------- Tab pill ---------- */
export function moveTabPill(tabsEl, instant) {
  const pill = tabsEl?.querySelector(".tab-pill");
  const sel = tabsEl?.querySelector('[aria-selected="true"], [aria-pressed="true"]');
  if (!pill || !sel || !sel.offsetWidth) return; // hidden: measured at 0, try again when shown
  const first = !pill.classList.contains("ready");
  if (instant || first) pill.style.transition = "none";
  pill.style.width = sel.offsetWidth + "px";
  pill.style.height = sel.offsetHeight + "px";
  pill.style.transform = `translate(${sel.offsetLeft}px, ${sel.offsetTop}px)`;
  if (instant || first) {
    void pill.offsetWidth;
    pill.style.transition = "";
  }
  pill.classList.add("ready");
}

/* ---------- Progress bars ---------- */
// Exercises rebuild `.bar i` with innerHTML on every question, so a CSS transition never runs.
// Grow the new bar from the width the last one had.
let lastBar = 0;
export function watchBars(root) {
  if (!root || typeof MutationObserver === "undefined") return;
  const hasBar = (n) => n.nodeType === 1 && (n.matches(".bar") || n.querySelector(".bar"));
  new MutationObserver((muts) => {
    let bars = null;
    for (const m of muts) for (const n of m.addedNodes) {
      if (!hasBar(n)) continue;
      bars ||= [];
      if (n.matches(".bar i")) bars.push(n);
      bars.push(...n.querySelectorAll(".bar i"));
    }
    if (!bars) return;
    for (const i of bars) {
      const to = parseFloat(i.style.width) || 0;
      if (to < lastBar) lastBar = 0;
      if (to !== lastBar) animate(i, [{ width: lastBar + "%" }, { width: to + "%" }]);
      lastBar = to;
    }
  }).observe(root, { childList: true, subtree: true });
}

// iOS Safari only applies :active when the page has a touch listener.
if (typeof document !== "undefined") document.addEventListener("touchstart", () => {}, { passive: true });
