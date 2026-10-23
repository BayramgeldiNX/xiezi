// Learning settings (per device: text size suits each screen). Read with setting("key").
import { store } from "./util.js";

export const DEFAULTS = {
  textSize: "normal",   // normal | large | xl
  pinyin: "show",       // show | tap (blurred until tapped) | hide (only in answers)
  strokeSpeed: "normal",// slow | normal | fast
  hintAfter: 2,         // mistakes before a hint when tracing; 0 = never
  slowRate: 0.65,       // speed of the "Slow" sound button
  autoplay: true,       // play the word automatically in exercises
};
const KEY = "xz-settings";
let S = { ...DEFAULTS, ...store.get(KEY, {}) };

export const setting = (k) => S[k];
export function setSetting(k, v) {
  S = { ...S, [k]: v };
  store.set(KEY, S);
  apply();
}

export const STROKE_SPEED = { slow: { anim: 0.45, delay: 600, step: 1.6 }, normal: { anim: 0.8, delay: 350, step: 1 }, fast: { anim: 1.5, delay: 150, step: 0.6 } };

// Page-wide effects: text size and pinyin display.
export function apply() {
  const r = document.documentElement;
  r.dataset.size = S.textSize;
  r.dataset.py = S.pinyin;
}

// "Show on tap": a blurred pinyin reveals itself when tapped.
document.addEventListener("click", (e) => {
  if (document.documentElement.dataset.py !== "tap") return;
  const p = e.target.closest(".py");
  if (p && !p.classList.contains("shown")) { p.classList.add("shown"); e.stopPropagation(); }
}, true);

apply();
