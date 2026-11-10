// Small motion helpers. Everything JS-driven lives here so reduced motion is honoured in one place.
// Timing: press 100ms, the rest 150 to 250ms. Only transform and opacity (and the progress bar width).

export const EASE = "cubic-bezier(.2, .8, .2, 1)";
export const MED = 200;

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const motionOK = () => !reduced();

// Web Animations with no fill mode, so nothing is left on the element afterwards.
// Returns the Animation, or undefined under reduced motion (callers needing an end step then do it at once).
export function animate(el, keyframes, options = {}) {
  if (!el || typeof el.animate !== "function" || reduced()) return undefined;
  return el.animate(keyframes, { duration: MED, easing: EASE, ...options, fill: "none" });
}

// A card turning over: the front turns away, `swap` draws the back, which then turns in (flipIn on the new element).
const TURN = "perspective(800px) rotateY";
export function flipOut(el, swap) {
  const a = animate(el, [{ transform: `${TURN}(0)` }, { transform: `${TURN}(90deg)` }], { duration: 140, easing: "ease-in" });
  if (!a) return swap();
  // Once only; the timer covers a page in the background, where animations may never finish.
  let done = false;
  const once = () => { if (!done) { done = true; swap(); } };
  a.onfinish = a.oncancel = once;
  setTimeout(once, 300);
}
export const flipIn = (el) => animate(el, [{ transform: `${TURN}(-90deg)` }, { transform: `${TURN}(0)` }], { duration: 180, easing: "ease-out" });

/* ---------- Soft close for dialogs ---------- */
export function softClose(dialog) {
  if (!dialog?.open || dialog.classList.contains("closing")) return;
  const done = () => { dialog.close(); dialog.classList.remove("closing"); };
  dialog.classList.add("closing");
  const a = animate(dialog, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(8px)" }], { duration: 150 });
  if (!a) return done();
  a.onfinish = done;
}
// Wire the close button and Esc of a dialog; the code's own .close() calls stay instant.
export function wireSoftClose(dialog) {
  if (!dialog) return;
  dialog.addEventListener("close", () => dialog.classList.remove("closing"));
  dialog.querySelector('form[method="dialog"]')?.addEventListener("submit", (e) => { e.preventDefault(); softClose(dialog); });
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); softClose(dialog); });
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

/* ---------- One observer: progress bars, next question, answer reveal, end of exercise ---------- */
// Exercises rebuild their `.panel` with innerHTML on every question, so a CSS transition never runs.
let lastBar = 0;
let lastQuestion = null; // `.progress` text of the last question shown
export const forgetQuestion = () => { lastQuestion = null; };

function reveal(el) {
  const h = el.offsetHeight; // read before paint
  if (!h) return;
  const a = animate(el, [{ height: "0px", opacity: 0 }, { height: h + "px", opacity: 1 }]);
  if (!a) return;
  el.classList.add("revealing");
  const end = () => el.classList.remove("revealing");
  a.onfinish = end; a.oncancel = end;
}

export function watchMotion(root) {
  if (!root || typeof MutationObserver === "undefined") return;
  new MutationObserver((muts) => {
    let bars = null, panels = null, scores = null, reveals = null, removedProgress = false;
    for (const m of muts) {
      if (m.type === "attributes") {
        const t = m.target;
        if (!t.hidden && t.matches?.(".answer")) (reveals ||= []).push(t);
        continue;
      }
      const t = m.target;
      if (m.addedNodes.length && !m.removedNodes.length && t.matches?.(".ty-feedback")) (reveals ||= []).push(t);
      for (const n of m.removedNodes) if (n.nodeType === 1 && (n.matches(".progress") || n.querySelector(".progress"))) removedProgress = true;
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches(".bar") || n.querySelector(".bar")) {
          bars ||= [];
          if (n.matches(".bar i")) bars.push(n);
          bars.push(...n.querySelectorAll(".bar i"));
        }
        if (n.matches(".panel")) (panels ||= []).push(n);
        else if (n.firstElementChild) for (const p of n.querySelectorAll(".panel")) (panels ||= []).push(p);
        if (n.matches(".score")) (scores ||= []).push(n);
        else if (n.firstElementChild) for (const s of n.querySelectorAll(".score")) (scores ||= []).push(s);
      }
    }
    if (bars) for (const i of bars) {
      const to = parseFloat(i.style.width) || 0;
      if (to < lastBar) lastBar = 0;
      if (to !== lastBar) animate(i, [{ width: lastBar + "%" }, { width: to + "%" }]);
      lastBar = to;
    }
    if (panels) for (const p of panels) {
      const prog = p.querySelector(":scope > .progress");
      if (!prog || !p.querySelector(":scope > .bar")) continue;
      const text = prog.textContent;
      if (text === lastQuestion) continue;
      lastQuestion = text;
      for (const c of p.children) {
        if (c.matches(".lbl, .progress, .bar")) continue;
        animate(c, [{ transform: "translateX(16px)", opacity: 0 }, { transform: "none", opacity: 1 }]);
      }
    } else if (removedProgress && !root.querySelector(".panel > .progress")) lastQuestion = null;
    if (scores) for (const s of scores) if (!s.closest(".review-hero")) animate(s, [{ transform: "translateY(8px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 250 });
    if (reveals) for (const el of reveals) reveal(el);
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
}

// iOS Safari only applies :active when the page has a touch listener.
if (typeof document !== "undefined") document.addEventListener("touchstart", () => {}, { passive: true });
