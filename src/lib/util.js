export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// mode, or for "mixed" a random pick that stays the same for a word during this round.
export function directionPicker(mode, a, b) {
  const picked = new Map();
  return (x) => {
    if (mode !== "mixed") return mode;
    if (!picked.has(x.w)) picked.set(x.w, Math.random() < 0.5 ? a : b);
    return picked.get(x.w);
  };
}

// localStorage that never throws (private mode, blocked storage, full disk).
export const store = {
  get(k, d) {
    try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
  remove(k) {
    try { localStorage.removeItem(k); } catch {}
  },
};

export const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export const NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];

// Show a hidden Next button and bring it into view (on phones it is often below the fold).
export function revealNext(btn) {
  if (!btn) return;
  btn.hidden = false;
  btn.focus({ preventScroll: true });
  // In a bar fixed to the bottom edge (phones) the button is always in view: bring the answer above it into view instead.
  const dock = btn.closest(".dock");
  if (dock && getComputedStyle(dock).position === "fixed") {
    let el = dock.previousElementSibling;
    while (el && (el.hidden || !el.offsetHeight)) el = el.previousElementSibling;
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return;
  }
  // Keep it at least 24px (plus the iPhone home-indicator inset) above the bottom edge.
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;height:0;padding-bottom:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  const r = btn.getBoundingClientRect(), gap = 24 + inset;
  const over = r.bottom - (innerHeight - gap);
  if (over > 0) scrollBy({ top: over, behavior: "smooth" });
  else if (r.top < 0) btn.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
}
