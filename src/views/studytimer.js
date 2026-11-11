// The study timer button in the lesson header: tap pauses, long press resets.
import { createTimer, formatElapsed } from "../lib/study-timer.js";
import { setting } from "../lib/settings.js";

const CLOCK = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const PAUSE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';

const timer = createTimer();
let inLesson = false;
let tickId = null, saveId = null;
let btn = null, wired = false;
let pressTimer = null, longPressed = false;

const words = (ms) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h && `${h} hour${h > 1 ? "s" : ""}`, (h || m) && `${m} minute${m === 1 ? "" : "s"}`, `${sec} second${sec === 1 ? "" : "s"}`].filter(Boolean).join(" ");
};

function render() {
  if (!btn) return;
  const on = setting("studyTimer") !== false;
  btn.hidden = !on;
  if (!on) return;
  const ms = timer.elapsed(), paused = timer.isPaused();
  btn.classList.toggle("paused", paused);
  btn.setAttribute("aria-pressed", String(paused));
  btn.setAttribute("aria-label", `Study time ${words(ms)}${paused ? ", paused, tap to resume" : ", tap to pause"}`);
  const html = `${paused ? PAUSE : CLOCK}<span class="t">${formatElapsed(ms)}</span>`;
  if (btn.dataset.h !== html) { btn.innerHTML = html; btn.dataset.h = html; }
}

function clearTimers() { clearInterval(tickId); clearInterval(saveId); tickId = saveId = null; }

// The clock runs only when a lesson is open, the app is visible and the setting is on.
function sync() {
  const should = inLesson && !document.hidden && setting("studyTimer") !== false;
  if (should) {
    timer.start();
    if (!tickId) tickId = setInterval(render, 1000);
    if (!saveId) saveId = setInterval(() => timer.persist(), 15000);
  } else {
    clearTimers();
    timer.stop();
  }
  render();
}

function wire() {
  if (wired) return;
  btn = document.getElementById("studyTimer");
  if (!btn) return;
  wired = true;
  const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };
  btn.addEventListener("pointerdown", () => {
    longPressed = false; cancel();
    pressTimer = setTimeout(() => { longPressed = true; pressTimer = null; timer.reset(); render(); }, 600);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, cancel);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("click", () => {
    if (longPressed) { longPressed = false; return; }
    timer.toggle();
    render();
  });
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("xz-settings", sync);
}

export function timerEnter() { wire(); inLesson = true; sync(); }
export function timerLeave() { if (!wired) return; inLesson = false; sync(); }
