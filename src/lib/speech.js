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

export const hasVoice = () => !!zhVoice;
// Can this text be heard on this device?
export const canSay = (text) => hasRecording(text) || !!zhVoice;

function showVoiceNote() {
  const n = $("#voiceNote");
  if (n) n.hidden = false;
}

// Resolves when the sound has finished (or failed), so callers can play lines one after another.
export function say(text, slow) {
  const t = clean(text);
  stopSpeech();
  const token = ++playToken;
  const file = AUDIO[t];
  if (file || EXTRA[t]) {
    return new Promise((resolve) => {
      player.muted = false; // the unlock trick may still be muting the player on the very first tap
      player.src = file ? `${import.meta.env.BASE_URL}audio/${file}.mp3` : EXTRA[t];
      // Players ask for audio in pieces, which the offline cache can't keep; one whole download keeps it.
      if (file) fetch(player.src).catch(() => {});
      player.playbackRate = slow ? setting("slowRate") : 1;
      player.preservesPitch = true;
      player.onended = () => resolve(true);
      player.onerror = () => { if (token === playToken) tts(t, slow).then(resolve); else resolve(false); };
      player.play().catch(() => { if (token === playToken) tts(t, slow).then(resolve); else resolve(false); });
    });
  }
  return tts(t, slow);
}

function tts(text, slow) {
  return new Promise((resolve) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = slow ? 0.5 : 0.85;
      if (zhVoice) u.voice = zhVoice;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      speechSynthesis.speak(u);
      if (!zhVoice) setTimeout(() => { pickVoice(); if (!zhVoice) { showVoiceNote(); resolve(false); } }, 800);
    } catch {
      showVoiceNote();
      resolve(false);
    }
  });
}

// Sound that plays by itself (not from a tap): respects the "auto-play" setting.
export const autoSay = (text, slow) => (setting("autoplay") ? say(text, slow) : Promise.resolve(false));

export function stopSpeech() {
  playToken++;
  try { player.pause(); } catch {}
  try { speechSynthesis.cancel(); } catch {}
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-say]");
  if (b) { e.stopPropagation(); say(b.dataset.say, b.hasAttribute("data-slow")); }
}, true);

export const sayBtns = (text, label, sm) =>
  `<button class="say${sm ? " sm" : ""}" type="button" data-say="${esc(text)}" aria-label="Play ${esc(label)}">${icon("speaker")}</button>` +
  `<button class="say${sm ? " sm" : ""}" type="button" data-say="${esc(text)}" data-slow aria-label="Play ${esc(label)} slowly">${icon("slow")}${sm ? "" : " Slow"}</button>`;
