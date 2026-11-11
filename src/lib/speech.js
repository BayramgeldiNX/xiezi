// Sound: natural recordings (public/audio, made by scripts/gen-audio.py) when the text has one,
// otherwise the device's Chinese voice.
import { $, esc } from "./util.js";
import { icon } from "./icons.js";
import AUDIO from "../data/audio.gen.json";
import { setting } from "./settings.js";

const clean = (text) => text.replace(/[AB]: /g, "").trim();
// Recordings that arrive after sign-in (the private book texts): text → blob URL.
const EXTRA = {};
export const addRecordings = (map) => Object.assign(EXTRA, map);
export const hasRecording = (text) => !!(AUDIO[clean(text)] || EXTRA[clean(text)]);

// One shared player. Phones only let a page play sound after a tap, so it is "unlocked" on the
// first touch; later plays (e.g. dictation saying the next word on its own) then work too.
const player = new Audio();
player.preload = "auto";
let unlocked = false;
const unlock = () => {
  if (unlocked) return;
  unlocked = true;
  if (player.src) return;
  // A tiny silent sound, played muted inside the first tap.
  player.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  player.muted = true;
  player.play().catch(() => {}).finally(() => { player.muted = false; });
};
addEventListener("pointerdown", unlock, { capture: true, once: true });
let playToken = 0;

let zhVoice = null;
const listeners = new Set();

function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    zhVoice = vs.find((v) => /^zh[-_]CN/i.test(v.lang))
      || vs.find((v) => /^zh/i.test(v.lang) && !/HK|TW/i.test(v.lang))
      || vs.find((v) => /^zh/i.test(v.lang)) || null;
  } catch {}
  listeners.forEach((fn) => fn(!!zhVoice));
}
try { pickVoice(); speechSynthesis.addEventListener("voiceschanged", pickVoice); } catch {}

// Can this text be heard on this device?
export const canSay = (text) => hasRecording(text) || !!zhVoice;

function showVoiceNote() {
  const n = $("#voiceNote");
  if (n) n.hidden = false;
}

// Resolves when the sound has finished (true) or could not play (false), so callers can play lines
// one after another. It always settles: a stalled file or a speech engine that never reports the end
// (iOS) gives up after a safety time. Stopping, or another sound taking its place, settles it with
// null, so a chain of lines (Listen to all) knows to end.
// `run` may return a give-up function: on the safety time it drops a sound that never began, so a
// slow download can't start playing much later, out of nowhere.
let settleCurrent = null;
function playing(run, text, slow) {
  settleCurrent?.(null);
  return new Promise((resolve) => {
    let timer, giveUp = null;
    const settle = (v) => { if (settleCurrent !== settle) return; settleCurrent = null; clearTimeout(timer); resolve(v); };
    settleCurrent = settle;
    const secs = 2.5 + text.length * 0.35;
    timer = setTimeout(() => { giveUp?.(); settle(false); }, secs * (slow ? 2 : 1) * 1000);
    giveUp = run(settle);
  });
}

// Empties the player when a sound ends or stops. A player that keeps its last word can be started
// again from outside the app: a headset or Bluetooth button, a media key, the lock screen or
// Control Center would replay that word out of nowhere.
function emptyPlayer() {
  player.onended = player.onerror = null;
  try { player.pause(); } catch {}
  if (player.getAttribute("src")) { player.removeAttribute("src"); try { player.load(); } catch {} }
}

export function say(text, slow) {
  const t = clean(text);
  halt();
  const token = ++playToken;
  const file = AUDIO[t];
  if (file || EXTRA[t]) {
    return playing((settle) => {
      // The device voice steps in only when the recording never started: one that breaks half-way
      // would otherwise be followed by the whole word again. It also runs once (error + rejected play),
      // and only while this sound is still wanted: a download that fails after giving up stays silent.
      let fell = false, voice = null;
      const fallback = () => {
        if (fell) return;
        fell = true;
        if (token === playToken && settleCurrent === settle && !(player.currentTime > 0)) voice = tts(t, slow, settle);
        else settle(false);
      };
      player.muted = false; // the unlock trick may still be muting the player on the very first tap
      player.src = file ? `${import.meta.env.BASE_URL}audio/${file}.mp3` : EXTRA[t];
      // Players ask for audio in pieces, which the offline cache can't keep; one whole download keeps it.
      if (file) fetch(player.src).catch(() => {});
      player.playbackRate = slow ? setting("slowRate") : 1;
      player.preservesPitch = true;
      player.onended = () => { emptyPlayer(); settle(true); };
      player.onerror = fallback;
      player.play().catch(fallback);
      return () => { if (voice) voice(); else if (!(player.currentTime > 0)) emptyPlayer(); };
    }, t, slow);
  }
  return playing((settle) => tts(t, slow, settle), t, slow);
}

// Speaks with the device voice; returns its give-up function (see playing).
function tts(text, slow, settle) {
  let started = false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = slow ? 0.5 : 0.85;
    if (zhVoice) u.voice = zhVoice;
    u.onstart = () => { started = true; };
    u.onend = () => settle(true);
    u.onerror = () => settle(false);
    speechSynthesis.speak(u);
    if (!zhVoice) setTimeout(() => { pickVoice(); if (!zhVoice) { showVoiceNote(); settle(false); } }, 800);
  } catch {
    showVoiceNote();
    settle(false);
  }
  // Not begun by the safety time: take it out of the queue, so the voice doesn't speak much later.
  return () => { if (!started) try { speechSynthesis.cancel(); } catch {} };
}

// Sound that plays by itself (not from a tap): respects the "auto-play" setting.
export const autoSay = (text, slow) => (setting("autoplay") ? say(text, slow) : Promise.resolve(false));

// A question that plays by itself a moment after it appears. Only one can wait at a time, and any
// other sound (a tap on Listen, the next question, leaving the page) cancels it, so it never
// restarts a sound that is already playing.
let laterTimer = 0;
export function sayLater(text, { ms = 250, auto = true } = {}) {
  clearTimeout(laterTimer);
  laterTimer = setTimeout(() => (auto ? autoSay(text) : say(text)), ms);
}

// Silences whatever sounds or waits to sound (say() starts with this before its own sound).
function halt() {
  clearTimeout(laterTimer);
  playToken++;
  settleCurrent?.(null);
  player.onended = player.onerror = null;
  try { player.pause(); } catch {}
  try { speechSynthesis.cancel(); } catch {}
}

// Counts stops, so a chain of lines can tell it was stopped even between two lines.
let stops = 0;
export const stopCount = () => stops;
export function stopSpeech() {
  stops++;
  halt();
  emptyPlayer();
}

// Leaving the app (home screen, lock screen, another tab) stops the sound, so nothing is left to
// start by itself on return: paused timers and half-loaded words would otherwise play the moment
// the app comes back.
document.addEventListener("visibilitychange", () => { if (document.hidden) stopSpeech(); });

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-say]");
  if (b) { e.stopPropagation(); say(b.dataset.say, b.hasAttribute("data-slow")); }
}, true);

export const sayBtns = (text, label, sm) =>
  `<button class="say${sm ? " sm" : ""}" type="button" data-say="${esc(text)}" aria-label="Play ${esc(label)}">${icon("speaker")}</button>` +
  `<button class="say${sm ? " sm" : ""}" type="button" data-say="${esc(text)}" data-slow aria-label="Play ${esc(label)} slowly">${icon("slow")}${sm ? "" : " Slow"}</button>`;
