// The study timer in the lesson header: a stopwatch or a countdown. Tap it for a small panel.
// The countdown rings when time is up, on any page (the clock is the wall clock, so it also
// survives the app being in the background or reloaded).
import { createTimer, formatElapsed, MIN_DOWN, MAX_DOWN, NEW_SESSION_MS } from "../lib/study-timer.js";
import { setting } from "../lib/settings.js";
import { alarm } from "../lib/sfx.js";
import { motionOK } from "../lib/motion.js";

const CLOCK = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const GLASS = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3v3a4 4 0 0 0 1.6 3.2L12 12l-2.4 2.8A4 4 0 0 0 8 18v3M16 3v3a4 4 0 0 1-1.6 3.2L12 12l2.4 2.8A4 4 0 0 1 16 18v3"/></svg>';
const PAUSE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 6v12M15 6v12"/></svg>';
const PRESETS = [15, 25, 45, 60];

const timer = createTimer();
let inLesson = false;
let tickId = null, saveId = null;
let btn = null, panel = null, card = null, wired = false;
let panelOpen = false, cardTimer = null, wasDone = false;

const words = (ms) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h && `${h} hour${h > 1 ? "s" : ""}`, (h || m) && `${m} minute${m === 1 ? "" : "s"}`, `${sec} second${sec === 1 ? "" : "s"}`].filter(Boolean).join(" ");
};
const doneText = () => `${timer.minutes()} minutes done — time for a rest.`;

function render() {
  if (!btn) return;
  const on = setting("studyTimer") !== false;
  const down = timer.mode() === "down";
  btn.hidden = !on;
  if (panelOpen) { const t = panel.querySelector(".tp-time"); if (t) t.textContent = down ? formatElapsed(timer.left()) : formatElapsed(timer.elapsed()); }
  if (!on) return;
  let html, label, paused;
  if (down) {
    const done = timer.isDone();
    paused = timer.isDownPaused();
    const ms = timer.left();
    html = done ? '<span class="t rest">Rest</span>' : `${paused ? PAUSE : GLASS}<span class="t">${formatElapsed(ms)}</span>`;
    label = done ? "Countdown finished, time for a rest, tap for timer options" : `Countdown ${words(ms)} left${paused ? ", paused" : ""}, tap for timer options`;
    if (done && !wasDone && motionOK()) { btn.classList.add("glow"); setTimeout(() => btn.classList.remove("glow"), 1400); }
    wasDone = done;
  } else {
    paused = timer.isPaused();
    html = `${paused ? PAUSE : CLOCK}<span class="t">${formatElapsed(timer.elapsed())}</span>`;
    label = `Study time ${words(timer.elapsed())}${paused ? ", paused" : ""}, tap for timer options`;
    wasDone = false;
  }
  btn.classList.toggle("paused", !!paused);
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-expanded", String(panelOpen));
  if (btn.dataset.h !== html) { btn.innerHTML = html; btn.dataset.h = html; }
}

// ---- panel ----
const pressed = (on) => `aria-pressed="${on}"`;
function panelHtml() {
  const down = timer.mode() === "down", done = down && timer.isDone();
  let h = '<p class="ll-title">Study timer</p>';
  if (done) {
    h += `<p class="tp-done" role="status">${doneText()}</p>
      <div class="tp-btns"><button type="button" class="btn primary" data-a="again">Start again</button><button type="button" class="btn ghost" data-a="stop">Stop</button></div>`;
    return h;
  }
  h += `<div class="seg" role="group" aria-label="Mode"><button type="button" data-a="mode-up" ${pressed(!down)}>Stopwatch</button><button type="button" data-a="mode-down" ${pressed(down)}>Countdown</button></div>`;
  h += `<p class="tp-time" aria-hidden="true">${formatElapsed(down ? timer.left() : timer.elapsed())}</p>`;
  if (down) {
    const m = timer.minutes();
    h += `<div class="seg" role="group" aria-label="Length in minutes">${PRESETS.map((n) => `<button type="button" data-a="len" data-n="${n}" ${pressed(m === n)}>${n}</button>`).join("")}</div>
      <div class="tp-step"><button type="button" data-a="dec" aria-label="5 minutes less"${m <= MIN_DOWN ? " disabled" : ""}>−</button><span>${m} min</span><button type="button" data-a="inc" aria-label="5 minutes more"${m >= MAX_DOWN ? " disabled" : ""}>+</button></div>`;
  }
  const main = down
    ? (timer.isDownRunning() ? ["pause", "Pause"] : timer.isDownPaused() ? ["resume", "Resume"] : ["start", "Start"])
    : [timer.isPaused() ? "resume" : "pause", timer.isPaused() ? "Resume" : "Pause"];
  h += `<div class="tp-btns"><button type="button" class="btn primary" data-a="${main[0]}">${main[1]}</button><button type="button" class="btn ghost" data-a="reset">Reset</button></div>`;
  if (down) h += '<p class="tp-note">Rings when time is up, even if you leave the lesson.</p>';
  return h;
}

function drawPanel() { if (panelOpen && panel) panel.innerHTML = panelHtml(); }

function openPanel() {
  if (!panel) return;
  const left = document.getElementById("lessonLeft");
  if (left && !left.hidden) {
    left.hidden = true;
    document.getElementById("lessonMeter")?.setAttribute("aria-expanded", "false");
  }
  panelOpen = true;
  panel.hidden = false;
  drawPanel();
  render();
}
export function closeTimerPanel() {
  if (!panel || !panelOpen) return;
  panelOpen = false;
  panel.hidden = true;
  btn?.setAttribute("aria-expanded", "false");
}

function onPanel(e) {
  const b = e.target.closest("[data-a]");
  if (!b || b.disabled) return;
  const a = b.dataset.a;
  if (a === "mode-up") timer.setMode("up");
  else if (a === "mode-down") timer.setMode("down");
  else if (a === "len") timer.setMinutes(+b.dataset.n);
  else if (a === "dec") timer.setMinutes(timer.minutes() - 5);
  else if (a === "inc") timer.setMinutes(timer.minutes() + 5);
  else if (a === "start" || a === "again") timer.startDown();
  else if (a === "pause") { if (timer.mode() === "down") timer.pauseDown(); else timer.toggle(); }
  else if (a === "resume") { if (timer.mode() === "down") timer.resumeDown(); else timer.toggle(); }
  else if (a === "reset") { if (timer.mode() === "down") timer.resetDown(); else timer.reset(); }
  else if (a === "stop") timer.ackDone();
  sync();
  drawPanel();
  render();
}

// ---- finished card (off the lesson page) ----
function hideCard() { clearTimeout(cardTimer); cardTimer = null; if (card) card.hidden = true; }
function showCard() {
  if (!card) {
    card = document.createElement("div");
    card.className = "tcard";
    card.setAttribute("role", "status");
    card.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (!a) return;
      if (a === "again") timer.startDown(); else timer.ackDone();
      hideCard(); sync(); render();
    });
    document.addEventListener("pointerdown", (e) => { if (card && !card.hidden && !card.contains(e.target)) hideCard(); });
    document.body.append(card);
  }
  card.innerHTML = `<p>${doneText()}</p><div class="tp-btns"><button type="button" class="btn primary" data-a="again">Start again</button><button type="button" class="btn ghost" data-a="stop">Stop</button></div>`;
  card.hidden = false;
  clearTimeout(cardTimer);
  cardTimer = setTimeout(hideCard, 20000);
}

// ---- the alarm ----
function check() {
  // Ring only when the app is in front (in the background the sound could not play and the ring would be lost).
  if (!timer.needsRing() || document.hidden) return;
  // Finished long ago (the app was closed): clear it quietly instead of ringing out of nowhere.
  if (timer.doneFor() > NEW_SESSION_MS) { timer.ackDone(); render(); return; }
  timer.markRang();
  alarm();
  setTimeout(alarm, 1500);
  try { navigator.vibrate?.([200, 120, 200]); } catch {}
  if (inLesson && !document.hidden) { openPanel(); } else showCard();
  render();
}

function clearTimers() { clearInterval(tickId); clearInterval(saveId); tickId = saveId = null; }
function tick() { check(); render(); if (!timer.isDownRunning() && !stopwatchShould()) sync(); }
const stopwatchShould = () => timer.mode() === "up" && inLesson && !document.hidden && setting("studyTimer") !== false;

// The stopwatch runs only when a lesson is open, the app is visible and the setting is on.
// The countdown needs a 1s tick on any page while it runs.
function sync() {
  if (stopwatchShould()) { timer.start(); } else { timer.stop(); }
  const needTick = stopwatchShould() || timer.isDownRunning();
  if (needTick) {
    if (!tickId) tickId = setInterval(tick, 1000);
    if (!saveId && stopwatchShould()) saveId = setInterval(() => timer.persist(), 15000);
    if (saveId && !stopwatchShould()) { clearInterval(saveId); saveId = null; }
  } else clearTimers();
  render();
}

function wire() {
  if (wired) return;
  btn = document.getElementById("studyTimer");
  panel = document.getElementById("timerPanel");
  if (!btn || !panel) return;
  wired = true;
  btn.addEventListener("click", () => { if (panelOpen) closeTimerPanel(); else openPanel(); });
  panel.addEventListener("click", onPanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panelOpen) { closeTimerPanel(); btn.focus(); } });
  document.addEventListener("visibilitychange", () => { sync(); if (!document.hidden) check(); });
  document.addEventListener("xz-settings", sync);
  document.addEventListener("xz-close-timer", closeTimerPanel);
}

// Called once at start, so a countdown set before a reload still rings.
export function timerBoot() { wire(); if (!wired) return; sync(); check(); }
export function timerEnter() { wire(); inLesson = true; sync(); if (timer.isDone() && !timer.needsRing()) render(); }
export function timerLeave() { if (!wired) return; inLesson = false; closeTimerPanel(); sync(); }
