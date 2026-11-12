// Tone quiz tab: listen to one syllable, pick its tone.
import { $, $$, shuffle, esc } from "../lib/util.js";
import { tonePy, addTone } from "../lib/pinyin.js";
import { say, autoSay, sayLater, sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { TONE_SETS, TONE_SAMPLES } from "../data/index.js";
import * as progress from "../progress/store.js";
import { runRound } from "./quiz-round.js";

const TONE_NAMES = ["", "1st · high, flat", "2nd · rising", "3rd · dip", "4th · falling"];
const TONE_PATHS = ["", "M4 6 L40 6", "M4 20 L40 4", "M4 10 L18 22 L40 4", "M4 4 L40 22"];
const shape = (t, cls = "") => `<svg class="tone-shape ${cls}" viewBox="0 0 44 26" aria-hidden="true"><path d="${TONE_PATHS[t]}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// "lesson": the round the caller picks (lesson-exercises.js); otherwise 10 from the classic sets.
function toneQuestions(source) {
  if (source === "lesson") return tOpts.questions();
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

let tOpts = {};

// opts: { host, questions (a function that picks a round), label, lesson, back }; no argument = same set again.
export function tonesIntro(opts) {
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
    toneRound(b.dataset.src);
  }));
}

// One round of 10: the shared quiz round (quiz-round.js) with a tone question.
function toneRound(src) {
  runRound({
    kind: "tones", title: "Tones", head: "声调 · Tones", items: () => toneQuestions(src), session: { set: src },
    host: () => $(tOpts.host), back: () => (tOpts.back ? tOpts.back() : tonesIntro()), lesson: tOpts.lesson, then: tOpts.then,
    toggles: false, label: (q) => q.hz, perfect: "全对！Quán duì! Perfect ears!",
    missedHtml: (q) => `${q.hz} <span class="py">${tonePy(addTone(q.plain, q.tone))}</span> ${sayBtns(q.say, q.plain, true)}`,
    more: [{ label: "Choose a set", run: () => tonesIntro() }], key: tonesKey,
    ask(x, q) {
      q.draw(`<div class="controls">
          <button class="btn primary big" type="button" data-say="${esc(x.say)}" id="toneListen">${icon("speaker")} Listen</button>
          <button class="btn big" type="button" data-say="${esc(x.say)}" data-slow>${icon("slow")} Slow</button>
        </div>
        <div class="tone-opts">${[1, 2, 3, 4].map((t) => `<button class="tone-opt" type="button" data-t="${t}">
          <b class="t${t}">${addTone(x.plain, t)}</b>${shape(t, "t" + t)}
          <small>${TONE_NAMES[t].split(" · ")[0]}</small></button>`).join("")}</div>
        <div class="status" id="toneStatus" aria-live="polite">Which tone do you hear?</div>
        <div class="answer" id="toneAnswer" hidden></div>`);
      const el = q.el, st = $("#toneStatus", el), ans = $("#toneAnswer", el);
      $$(".tone-opt", el).forEach((b) => b.addEventListener("click", () => {
        const t = +b.dataset.t, ok = t === x.tone;
        $$(".tone-opt", el).forEach((o) => {
          o.disabled = true;
          if (+o.dataset.t === x.tone) o.classList.add("right");
          else if (o === b) o.classList.add("wrong");
        });
        progress.record("t:" + x.hz, { ok, miss: ok ? 0 : 1 });
        st.style.color = ok ? "" : "var(--cinnabar)";
        st.textContent = ok ? "对了！Duì le! Correct!" : `Not quite. It's the ${TONE_NAMES[x.tone].split(" · ")[0]} tone.`;
        ans.innerHTML = `<span class="hz">${x.hz}</span><span class="py">${tonePy(addTone(x.plain, x.tone))}</span>${sayBtns(x.say, x.plain, true)}`;
        if (!ok) ans.insertAdjacentHTML("afterend", compareHtml(x, t));
        ans.hidden = false;
        q.done(ok);
        if (!ok) {
          // Your pick, then the right one, so the two can be compared straight away.
          const mine = toneSample(x.plain, t);
          if (mine) autoSay(mine).then((done) => { if (done && el.isConnected) sayLater(x.say, { ms: 350, auto: false }); });
        }
      }));
      sayLater(x.say);
    },
  });
}

// Keyboard: 1–4 answer, space replays, enter goes on.
function tonesKey(e) {
  const host = $(tOpts.host);
  if (!host || !$(".tone-opt", host)) return false;
  if (/^[1-4]$/.test(e.key)) { const b = $(`.tone-opt[data-t="${e.key}"]`, host); if (b && !b.disabled) b.click(); return true; }
  if (e.key === " ") { $("#toneListen")?.click(); return true; }
  const next = $("#qNext", host);
  if (e.key === "Enter" && next && !next.hidden) { next.click(); return true; }
  return false;
}
