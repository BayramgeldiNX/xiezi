// Tone quiz tab: listen to one syllable, pick its tone.
import { $, $$, shuffle, esc } from "../lib/util.js";
import { syllables, tonePy, stripTone, addTone } from "../lib/pinyin.js";
import { say, sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { CHARS, TONE_SETS } from "../data/index.js";
import { app } from "../app.js";
import * as progress from "../progress/store.js";

const TONE_NAMES = ["", "1st · high, flat", "2nd · rising", "3rd · dip", "4th · falling"];
const TONE_PATHS = ["", "M4 6 L40 6", "M4 20 L40 4", "M4 10 L18 22 L40 4", "M4 4 L40 22"];
const shape = (t, cls = "") => `<svg class="tone-shape ${cls}" viewBox="0 0 44 26" aria-hidden="true"><path d="${TONE_PATHS[t]}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function toneQuestions(source) {
  if (source === "lesson") {
    const seen = new Set(), qs = [];
    tOpts.words.forEach((w) => [...w.w].forEach((c) => {
      const py = CHARS[c]?.py;
      if (!py || seen.has(c)) return;
      const tone = syllables(py)[0][1];
      if (tone < 1 || tone > 4) return; // skip neutral-tone characters like 们
      seen.add(c);
      qs.push({ say: c, plain: stripTone(py), tone, hz: c });
    }));
    return shuffle(qs).slice(0, 10);
  }
  const qs = [];
  TONE_SETS.forEach(([plain, ...hz]) => hz.forEach((c, i) => c && qs.push({ say: c, plain, tone: i + 1, hz: c })));
  return shuffle(qs).slice(0, 10);
}

let tq = null;
let tOpts = {};

// opts: { host, words, label, lesson, back }; {} = the open lesson's Tones tab; no argument = same set again.
export function tonesIntro(opts) {
  tq = null;
  if (opts) tOpts = { host: "#tab-tones", words: app.L().words, label: `${app.L().cn} characters`, lesson: app.L().n, ...opts };
  $(tOpts.host).innerHTML = `<div class="panel">
    <span class="lbl">声调 shēngdiào · Tone quiz</span>
    <p>Listen to one syllable, then tap its tone. 10 questions.</p>
    <div class="legend">${[1, 2, 3, 4].map((t) => `<span class="t${t}">${shape(t)} ${TONE_NAMES[t]}</span>`).join("")}</div>
    <div class="sets">
      <button class="btn primary big" type="button" data-src="lesson">${tOpts.label}</button>
      <button class="btn big" type="button" data-src="classic">mā má mǎ mà practice</button>
    </div>
    <p class="note">Turn your sound on. Keys: 1–4 pick a tone, space plays again.</p>
    ${tOpts.back ? `<button class="btn ghost" type="button" id="toneBack">Back</button>` : ""}
  </div>`;
  $("#toneBack")?.addEventListener("click", tOpts.back);
  $$("[data-src]", $(tOpts.host)).forEach((b) => b.addEventListener("click", () => {
    tq = { qs: toneQuestions(b.dataset.src), pos: 0, right: 0, missed: [], src: b.dataset.src };
    toneAsk();
  }));
}

function toneAsk() {
  const host = $(tOpts.host);
  if (tq.pos >= tq.qs.length) return toneEnd();
  const q = tq.qs[tq.pos], total = tq.qs.length;
  host.innerHTML = `<div class="panel">
    <div class="progress">Question ${tq.pos + 1} of ${total} · ${tq.right} right</div>
    <div class="bar"><i style="width:${(tq.pos / total) * 100}%"></i></div>
    <div class="controls">
      <button class="btn primary big" type="button" data-say="${esc(q.say)}" id="toneListen">${icon("speaker")} Listen</button>
      <button class="btn big" type="button" data-say="${esc(q.say)}" data-slow>${icon("slow")} Slow</button>
    </div>
    <div class="tone-opts">${[1, 2, 3, 4].map((t) => `<button class="tone-opt" type="button" data-t="${t}">
      <b class="t${t}">${addTone(q.plain, t)}</b>${shape(t, "t" + t)}
      <small>${TONE_NAMES[t].split(" · ")[0]}</small></button>`).join("")}</div>
    <div class="status" id="toneStatus" aria-live="polite">Which tone do you hear?</div>
    <div class="answer" id="toneAnswer" hidden></div>
    <button class="btn primary" type="button" id="toneNext" hidden>${tq.pos + 1 >= total ? "See results" : "Next"}</button>
  </div>`;
  $$(".tone-opt", host).forEach((b) => b.addEventListener("click", () => {
    const t = +b.dataset.t, ok = t === q.tone;
    $$(".tone-opt", host).forEach((o) => {
      o.disabled = true;
      if (+o.dataset.t === q.tone) o.classList.add("right");
      else if (o === b) o.classList.add("wrong");
    });
    progress.record("t:" + q.hz, { ok, miss: ok ? 0 : 1 });
    if (ok) tq.right++; else tq.missed.push(q);
    $("#toneStatus").style.color = ok ? "" : "var(--cinnabar)";
    $("#toneStatus").textContent = ok ? "对了！Duì le! Correct!" : `Not quite. It's the ${TONE_NAMES[q.tone].split(" · ")[0]} tone.`;
    $("#toneAnswer").innerHTML = `<span class="hz">${q.hz}</span><span class="py">${tonePy(addTone(q.plain, q.tone))}</span>${sayBtns(q.say, q.plain, true)}`;
    $("#toneAnswer").hidden = false;
    $("#toneNext").hidden = false;
    $("#toneNext").focus({ preventScroll: true });
  }));
  $("#toneNext").addEventListener("click", () => { tq.pos++; toneAsk(); });
  setTimeout(() => say(q.say), 250);
}

function toneEnd() {
  const total = tq.qs.length;
  progress.addSession({ type: "tones", lesson: tOpts.lesson ?? 0, set: tq.src, score: tq.right, total, missed: tq.missed.map((q) => q.hz) });
  $(tOpts.host).innerHTML = `<div class="panel">
    <span class="lbl">Results</span>
    <div class="score">${tq.right} / ${total} right</div>
    ${tq.missed.length ? `<p>Listen to these again:</p><div class="result-list">${tq.missed.map((q) => `<span>${q.hz} <span class="py">${tonePy(addTone(q.plain, q.tone))}</span> ${sayBtns(q.say, q.plain, true)}</span>`).join("")}</div>`
      : `<p>全对！Quán duì! Perfect ears!</p>`}
    <div class="controls"><button class="btn primary big" type="button" id="toneAgain">${icon("replay")} Play again</button><button class="btn big" type="button" id="toneMenu">Choose a set</button></div>
  </div>`;
  const src = tq.src;
  $("#toneAgain").addEventListener("click", () => { tq = { qs: toneQuestions(src), pos: 0, right: 0, missed: [], src }; toneAsk(); });
  $("#toneMenu").addEventListener("click", () => tonesIntro());
}

// Keyboard: 1–4 answer, space replays, enter goes on.
export function tonesKey(e) {
  if (!tq || tq.pos >= tq.qs.length) return false;
  const host = $(tOpts.host);
  if (/^[1-4]$/.test(e.key)) { const b = $(`.tone-opt[data-t="${e.key}"]`, host); if (b && !b.disabled) b.click(); return true; }
  if (e.key === " ") { $("#toneListen")?.click(); return true; }
  if (e.key === "Enter" && !$("#toneNext").hidden) { $("#toneNext").click(); return true; }
  return false;
}
