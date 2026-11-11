// Study timer: a plain stopwatch. No DOM here so it can be tested.
// Time counts while a lesson is open (start/stop are automatic); toggle() is the user's own pause.
import { store as defaultStore } from "./util.js";

export const TIMER_KEY = "xz-study-timer";
export const NEW_SESSION_MS = 30 * 60 * 1000;

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
  let active = false;        // a lesson is open and the app is visible
  let runningSince = null;

  const elapsed = () => ms + (runningSince != null ? now() - runningSince : 0);
  const save = () => store.set(TIMER_KEY, { ms: elapsed(), paused, lastSeen });
  const fold = () => { if (runningSince != null) { ms += now() - runningSince; runningSince = null; } };

  return {
    start() {
      active = true;
      if (runningSince != null) return;
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
  };
}
