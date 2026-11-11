// Sound effects: soft, short sounds made by the browser itself (Web Audio), so there are no files
// to download and they work offline. The voice (speech.js) is separate and always louder.
import { setting } from "./settings.js";
import { louder, soundFor } from "./sfx-pick.js";

let ctx = null, master = null;
// How loud the effects are (setting "sfxVolume"); every sound goes through one volume knob.
export const VOLUME = { quiet: 0.4, normal: 1, loud: 2.2, max: 4 };
const AC = globalThis.AudioContext || globalThis.webkitAudioContext;

// Phones only allow sound after a touch: the context is made and woken inside taps and key presses.
function wake() {
  if (!AC || !setting("sfx")) return;
  try {
    if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination); }
    if (ctx.state !== "running") ctx.resume().catch(() => {});
  } catch {}
}

// One note: a tone that starts at once and fades out.
function tone(t, { f, to, dur = 0.12, gain = 0.08, type = "sine", attack = 0.005 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
// A bell-like note: the tone plus a quieter one an octave above.
function bell(t, f, dur, gain) {
  tone(t, { f, dur, gain });
  tone(t, { f: f * 2, dur: dur * 0.6, gain: gain * 0.25 });
}
// A short breath of filtered noise (paper, brush).
let noiseBuf = null;
function noise(t, { dur = 0.06, gain = 0.06, from = 2000, to = 800, q = 1 }) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.3), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

const SOUNDS = {
  tick: (t) => tone(t, { f: 1100, to: 800, dur: 0.035, gain: 0.03, type: "triangle", attack: 0.002 }),
  flip: (t) => noise(t, { dur: 0.09, gain: 0.05, from: 900, to: 2600, q: 0.8 }),
  stroke: (t) => { noise(t, { dur: 0.07, gain: 0.07, from: 2400, to: 700 }); tone(t, { f: 520, to: 420, dur: 0.05, gain: 0.03 }); },
  miss: (t) => tone(t, { f: 170, to: 110, dur: 0.11, gain: 0.12 }),
  right: (t) => { bell(t, 659.25, 0.12, 0.06); bell(t + 0.085, 987.77, 0.2, 0.06); },
  wrong: (t) => { tone(t, { f: 233, dur: 0.13, gain: 0.08, type: "triangle" }); tone(t + 0.1, { f: 185, dur: 0.2, gain: 0.08, type: "triangle" }); },
  done: (t) => { bell(t, 783.99, 0.3, 0.07); bell(t + 0.12, 1046.5, 0.45, 0.07); },
  finish: (t) => { bell(t, 523.25, 0.3, 0.06); bell(t + 0.12, 659.25, 0.3, 0.06); bell(t + 0.24, 783.99, 0.6, 0.07); },
};

// Sounds asked for in the same moment are gathered, and the most important one plays.
let waiting = null, timer = 0;
export const played = []; // the last few sounds, for tests
export function sfx(name) {
  if (!name || !SOUNDS[name]) return;
  waiting = louder(waiting, name);
  clearTimeout(timer);
  timer = setTimeout(flush, 0);
}
function flush() {
  const name = waiting;
  waiting = null;
  if (!name || !setting("sfx") || !ctx) return;
  played.push(name);
  if (played.length > 30) played.shift();
  master.gain.value = VOLUME[setting("sfxVolume")] ?? 1;
  const go = () => { try { SOUNDS[name](ctx.currentTime + 0.005); } catch {} };
  if (ctx.state === "running") go(); else ctx.resume().then(go).catch(() => {});
}

// Hooks for the progress store: every saved answer and every finished exercise.
export const onRecord = (key, result, opts) => sfx(soundFor(key, result, opts));
export const onSession = () => sfx("finish");

if (typeof document !== "undefined") {
  if (import.meta.env?.DEV) globalThis.__sfx = played;
  addEventListener("pointerdown", wake, { capture: true });
  addEventListener("keydown", wake, { capture: true });
  // Every button gets a soft tick; a flashcard gets a page-flip. Speaker buttons stay silent: the voice follows.
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("button, a[href], [role=button], summary");
    if (!b || b.disabled || b.closest("[data-say]")) return;
    wake();
    // Changing the effects settings plays a sample, so the new volume is heard at once.
    sfx(/^sfx/.test(b.dataset.set || "") ? "right" : b.classList.contains("fc") || /Flip$/.test(b.id) ? "flip" : "tick");
  }, true);
}
