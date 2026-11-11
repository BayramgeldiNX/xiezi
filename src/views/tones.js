// Tone quiz tab: listen to one syllable, pick its tone.
import { $, $$, shuffle, esc, revealNext } from "../lib/util.js";
import { syllables, tonePy, stripTone, addTone } from "../lib/pinyin.js";
import { say, autoSay, sayLater, sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { CHARS, TONE_SETS, TONE_SAMPLES } from "../data/index.js";
import * as progress from "../progress/store.js";
import { nextHtml, wireNext } from "./practice.js";
import { quizHead } from "../lib/qpinyin.js";

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

// A character for each tone of a syllable (scripts/gen-tone-samples.mjs), so a mistake can be heard next to the right answer.
const toneSample = (plain, t) => TONE_SAMPLES[plain]?.[t - 1] || null;

function compareHtml(q, picked) {
  return `<div class="tone-compare"><span class="lbl">Hear the difference</span><div class="tone-cmp">${[1, 2, 3, 4].map((t) => {
    const hz = t === q.tone ? q.say : toneSample(q.plain, t);
    const tag = t === q.tone ? "right" : t === picked ? "picked" : "";
    const inner = `<b class="t${t}">${addTone(q.plain, t)}</b>${shape(t, "t" + t)}<span class="hz">${hz || "—"}</span>`;
    return hz ? `<button class="tone-c ${tag}" type="button" data-say="${esc(hz)}" aria-label="Play ${esc(addTone(q.plain, t))}">${inner}</button>`
      : `<span class="tone-c none ${tag}">${inner}</span>`;
  }).join("")}</div><small class="note">Green is the right tone, red is your pick. Tap any to hear it.</small></div>`;
}

let tq = null;
let tOpts = {};

// opts: { host, words, label, lesson, back }; no argument = same set again.
export function tonesIntro(opts) {
  tq = null;
  if (opts) tOpts = { ...opts };
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
  if (!tq.pos) scrollTo(0, 0);
  host.innerHTML = `<div class="panel focus">
    ${quizHead({ title: "声调 · Tones", pos: tq.pos, total, toggles: false, leaveAttr: 'id="toneQBack"' })}
    <div class="controls">
      <button class="btn primary big" type="button" data-say="${esc(q.say)}" id="toneListen">${icon("speaker")} Listen</button>
      <button class="btn big" type="button" data-say="${esc(q.say)}" data-slow>${icon("slow")} Slow</button>
    </div>
    <div class="tone-opts">${[1, 2, 3, 4].map((t) => `<button class="tone-opt" type="button" data-t="${t}">
      <b class="t${t}">${addTone(q.plain, t)}</b>${shape(t, "t" + t)}
      <small>${TONE_NAMES[t].split(" · ")[0]}</small></button>`).join("")}</div>
    <div class="status" id="toneStatus" aria-live="polite">Which tone do you hear?</div>
    <div class="answer" id="toneAnswer" hidden></div>
    <div class="controls dock"><button class="btn primary" type="button" id="toneNext" hidden>${tq.pos + 1 >= total ? "See results" : "Next"}</button></div>
  </div>`;
  $("#toneQBack").addEventListener("click", () => tonesIntro());
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
    if (!ok) $("#toneAnswer").insertAdjacentHTML("afterend", compareHtml(q, t));
    $("#toneAnswer").hidden = false;
    revealNext($("#toneNext"));
    if (!ok) {
      // Your pick, then the right one, so the two can be compared straight away.
      const mine = toneSample(q.plain, t), at = tq.pos;
      if (mine) autoSay(mine).then((done) => { if (done && tq?.pos === at) sayLater(q.say, { ms: 350, auto: false }); });
    }
  }));
  $("#toneNext").addEventListener("click", () => { tq.pos++; toneAsk(); });
  sayLater(q.say);
}

function toneEnd() {
  const total = tq.qs.length;
  progress.addSession({ type: "tones", lesson: tOpts.lesson ?? 0, set: tq.src, score: tq.right, total, missed: tq.missed.map((q) => q.hz) });
  $(tOpts.host).innerHTML = `<div class="panel">
    <span class="lbl">Results</span>
    <div class="score">${tq.right} / ${total} right</div>
    ${tq.missed.length ? `<p>Listen to these again:</p><div class="result-list">${tq.missed.map((q) => `<span>${q.hz} <span class="py">${tonePy(addTone(q.plain, q.tone))}</span> ${sayBtns(q.say, q.plain, true)}</span>`).join("")}</div>`
      : `<p>全对！Quán duì! Perfect ears!</p>`}
    <div class="controls">${nextHtml()}<button class="btn big" type="button" id="toneAgain">${icon("replay")} Play again</button>${tq.missed.length ? `<button class="btn big" type="button" id="toneRetry">Retry missed</button>` : ""}<button class="btn big" type="button" id="toneMenu">Choose a set</button><button class="btn ghost" type="button" id="toneResBack">Back</button></div>
  </div>`;
  wireNext($(tOpts.host));
  $("#toneResBack").addEventListener("click", () => (tOpts.back ? tOpts.back() : tonesIntro()));
  const src = tq.src, missed = tq.missed;
  $("#toneAgain").addEventListener("click", () => { tq = { qs: toneQuestions(src), pos: 0, right: 0, missed: [], src }; toneAsk(); });
  $("#toneRetry")?.addEventListener("click", () => { tq = { qs: missed, pos: 0, right: 0, missed: [], src }; toneAsk(); });
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
