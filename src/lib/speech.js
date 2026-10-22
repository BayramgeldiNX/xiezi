// Text-to-speech with the device's Chinese voice.
import { $, esc } from "./util.js";
import { icon } from "./icons.js";

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

function showVoiceNote() {
  const n = $("#voiceNote");
  if (n) n.hidden = false;
}

export function say(text, slow) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[AB]: /g, ""));
    u.lang = "zh-CN";
    u.rate = slow ? 0.5 : 0.85;
    if (zhVoice) u.voice = zhVoice;
    speechSynthesis.speak(u);
    if (!zhVoice) setTimeout(() => { pickVoice(); if (!zhVoice) showVoiceNote(); }, 800);
  } catch {
    showVoiceNote();
  }
}

export function stopSpeech() {
  try { speechSynthesis.cancel(); } catch {}
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-say]");
  if (b) { e.stopPropagation(); say(b.dataset.say, b.hasAttribute("data-slow")); }
}, true);

export const sayBtns = (text, label, sm) =>
  `<button class="say${sm ? " sm" : ""}" type="button" data-say="${esc(text)}" aria-label="Play ${esc(label)}">${icon("speaker")}</button>` +
  `<button class="say${sm ? " sm" : ""}" type="button" data-say="${esc(text)}" data-slow aria-label="Play ${esc(label)} slowly">${icon("slow")}${sm ? "" : " Slow"}</button>`;
