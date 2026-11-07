// Live lesson completion inside a lesson: a ring + % in the header, a thin fill under each tab,
// a 完 seal at 60% and a gold ring at 100%. Numbers come from completion(), the same as the lesson list.
import { FINISHED_AT } from "../progress/completion.js";
import { motionOK } from "../lib/motion.js";

// Which milestones did a rise from `prev` to `next` (ratios 0–1) cross?
export function crossed(prev, next) {
  return { seal: prev < FINISHED_AT && next >= FINISHED_AT, gold: prev < 1 && next >= 1 };
}

const $ = (s) => document.querySelector(s);
const C = 2 * Math.PI * 15; // ring circumference, r = 15
let shown = null; // { lid, ratio, pct }
let counter = 0;

// Count the number up to `to` over ~400ms (instantly under reduced motion).
function countTo(el, from, to) {
  cancelAnimationFrame(counter);
  if (!motionOK() || from === to) { el.textContent = to + "%"; return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 400);
    el.textContent = Math.round(from + (to - from) * k) + "%";
    if (k < 1) counter = requestAnimationFrame(step);
  };
  counter = requestAnimationFrame(step);
}

// c = completion() of the open lesson. fresh = the lesson was just opened (no animation, no ceremony).
export function showLessonMeter(lid, c, fresh) {
  const box = $("#lessonMeter"), root = $("#lessonView");
  if (!box) return;
  const prev = !fresh && shown?.lid === lid ? shown : null;
  const gold = c.ratio >= 1, seal = c.finished;
  const apply = () => {
    box.querySelector(".ring-fill").style.strokeDashoffset = C * (1 - c.ratio);
    box.classList.toggle("gold", gold);
    $("#lessonSeal").hidden = !seal;
    $("#lessonFin").hidden = !seal;
    for (const b of document.querySelectorAll(".tabs [data-tab]")) {
      const s = c.skills[b.dataset.tab], f = b.querySelector(".tab-fill");
      f.hidden = !s?.total;
      if (s?.total) f.firstElementChild.style.transform = `scaleX(${s.done / s.total})`;
    }
  };
  if (!prev) { // opening: set the values with no transition
    root.classList.add("still");
    apply();
    box.offsetWidth; // flush styles
    root.classList.remove("still");
    $("#lessonPct").textContent = c.pct + "%";
  } else if (c.ratio > prev.ratio) {
    apply();
    countTo($("#lessonPct"), prev.pct, c.pct);
    const m = crossed(prev.ratio, c.ratio);
    if (m.seal) replay($("#lessonSeal"), "stamp");
    if (m.gold) replay(box, "glow");
  }
  shown = { lid, ratio: c.ratio, pct: c.pct };
}

// Restart a CSS animation class.
function replay(el, cls) {
  el.classList.remove(cls);
  el.offsetWidth;
  el.classList.add(cls);
}
