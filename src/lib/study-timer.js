// Study timer: a stopwatch (mode "up") or a countdown (mode "down"). No DOM here so it can be tested.
// Stopwatch time counts while a lesson is open (start/stop are automatic); toggle() is the user's own pause.
// The countdown uses the wall clock (endsAt), so it keeps going in the background and after a reload.
import { store as defaultStore } from "./util.js";

export const TIMER_KEY = "xz-study-timer";
export const NEW_SESSION_MS = 30 * 60 * 1000;
export const MIN_DOWN = 5, MAX_DOWN = 180, DEFAULT_DOWN = 45;
export const clampMinutes = (n) => {
  n = Math.round(Number(n));
  return Number.isFinite(n) ? Math.min(MAX_DOWN, Math.max(MIN_DOWN, n)) : DEFAULT_DOWN;
};

export function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

export function createTimer(now = () => Date.now(), store = defaultStore) {
  const saved = store.get(TIMER_KEY, {}) || {};
  let ms = Number(saved.ms) > 0 ? Number(saved.ms) : 0;
  let paused = !!saved.paused;
  let lastSeen = Number(saved.lastSeen) || 0;
  let mode = saved.mode === "down" ? "down" : "up";
  let downMin = saved.downMin == null ? DEFAULT_DOWN : clampMinutes(saved.downMin);
  let endsAt = Number(saved.endsAt) > 0 ? Number(saved.endsAt) : null;   // set while the countdown runs
  let leftMs = saved.leftMs != null && Number(saved.leftMs) >= 0 && endsAt == null ? Number(saved.leftMs) : null; // set while paused
  let rang = !!saved.rang;   // the finished countdown was already announced
  let active = false;        // a lesson is open and the app is visible
  let runningSince = null;

  const elapsed = () => ms + (runningSince != null ? now() - runningSince : 0);
  const save = () => store.set(TIMER_KEY, { ms: elapsed(), paused, lastSeen, mode, downMin, endsAt, leftMs, rang });
  const fold = () => { if (runningSince != null) { ms += now() - runningSince; runningSince = null; } };

  const full = () => downMin * 60000;
  const left = () => endsAt != null ? Math.max(0, endsAt - now()) : leftMs != null ? leftMs : full();
  const clearDown = () => { endsAt = null; leftMs = null; rang = false; };

  return {
    start() {
      active = true;
      if (mode !== "up" || runningSince != null) return;
      const t = now();
      if (lastSeen && t - lastSeen > NEW_SESSION_MS) { ms = 0; paused = false; }
      lastSeen = t;
      if (!paused) runningSince = t;
      save();
    },
    stop() {
      active = false;
      fold();
      lastSeen = now();
      save();
    },
    toggle() {
      if (mode !== "up") return;
      if (paused) { paused = false; if (active && runningSince == null) runningSince = now(); }
      else { fold(); paused = true; }
      lastSeen = now();
      save();
    },
    reset() {
      ms = 0;
      if (runningSince != null) runningSince = now();
      lastSeen = now();
      save();
    },
    // Called now and then while running, so a reload keeps the time.
    persist() { lastSeen = now(); save(); },
    elapsed,
    isPaused: () => paused,
    isRunning: () => runningSince != null,

    // Countdown.
    mode: () => mode,
    minutes: () => downMin,
    setMode(m) {
      m = m === "down" ? "down" : "up";
      if (m === mode) return;
      mode = m;
      if (m === "down") fold();                 // stopwatch time is kept
      else { clearDown(); if (active && !paused) runningSince = now(); }
      lastSeen = now();
      save();
    },
    setMinutes(n) {
      const wasRunning = endsAt != null && !this.isDone();
      downMin = clampMinutes(n);
      if (wasRunning) { endsAt = now() + full(); rang = false; }
      else clearDown();
      save();
    },
    startDown() {
      if (mode !== "down") this.setMode("down");
      endsAt = now() + full(); leftMs = null; rang = false;
      save();
    },
    pauseDown() {
      if (endsAt == null || this.isDone()) return;
      leftMs = left(); endsAt = null;
      save();
    },
    resumeDown() {
      if (leftMs == null) return;
      endsAt = now() + leftMs; leftMs = null;
      save();
    },
    resetDown() { clearDown(); save(); },
    left,
    isDownRunning: () => endsAt != null && now() < endsAt,
    isDownPaused: () => endsAt == null && leftMs != null,
    isDone: () => endsAt != null && now() >= endsAt,
    needsRing: () => endsAt != null && now() >= endsAt && !rang,
    doneFor: () => endsAt != null ? Math.max(0, now() - endsAt) : 0, // how long ago it finished
    markRang() { if (!rang) { rang = true; save(); } },
    ackDone() { clearDown(); save(); },
  };
}
