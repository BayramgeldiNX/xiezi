// 部首 Radicals practice: cards, find, guess, due.
//   startRadicalPractice(ui | containerElement, { mode, radicals, then, host?, back? })
//     mode      "cards" | "find" | "guess" | "due"
//     radicals  core radical objects (RADICALS_CORE stages[].radicals[]) to practise
//     then      optional callback(result) when finished; without it the quiz shows its own results screen
//     host      optional CSS selector to render into (default: the practice body, ui.body()). The quizzes draw
//               through ui.choiceQuiz, which uses the practice host, so `host` is applied with setHost().
//     back      optional "Back" handler (default: the practice context's back)
// Results are saved per radical on radicalKey(r) ("bs:<r>"). Pure helpers live in lib/radical-quiz.js (tested in tests/radicals-practice.test.js).
import { $, esc } from "../lib/util.js";
import { autoSay, sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { radicalKey } from "../lib/radicals.js";
import { shuffleWith, allCoreRadicals, pickRadicalDistractors, buildFindQuestions, buildGuessQuestions, pickGuessDistractors, dueRadicals } from "../lib/radical-quiz.js";
import * as progress from "../progress/store.js";
import { radicalChoice } from "./workbook.js";
import { setHost, ui as practiceUi } from "./practice.js";

/* ---------- screens ---------- */
const hzSpan = (t, size) => `<span class="hz" style="font-size:${size}rem">${esc(t)}</span>`;
const all$ = (s, el) => [...el.querySelectorAll(s)];

function nothing(ui, el, msg, back) {
  el.innerHTML = `<div class="panel"><p>${esc(msg)}</p>${ui.backBtn()}</div>`;
  all$("[data-back]", el).forEach((b) => b.addEventListener("click", back));
}

function findQuiz(ui, radicals, { then, back, title = "部首 · Which radical?" }) {
  const all = allCoreRadicals();
  const byR = Object.fromEntries(all.map((x) => [x.r, x]));
  const items = buildFindQuestions(radicals.map((r) => byR[r.r] || r));
  return radicalChoice(ui, { kind: "radical-find", title, items, key: "bs:", id: (q) => q.r, then, back,
    charOf: (q) => q.c, radOf: (q) => q.r, nameOf: (r) => byR[r]?.en || "",
    distractors: (q) => pickRadicalDistractors(byR[q.r] || q.radical, all, Math.random, 3, q.c) });
}

function guessQuiz(ui, radicals, { then, back, title = "猜意思 · Guess the meaning" }) {
  const items = buildGuessQuestions(radicals);
  const pool = radicals.length >= 4 ? radicals : allCoreRadicals();
  return ui.choiceQuiz({ kind: "radical-guess", title, items, key: "bs:", id: (q) => q.r, label: (q) => q.c, sayAfter: (q) => q.c, then, back,
    ask: (q) => ({ html: `<p class="hint">What does this character mean? The radical gives a clue.</p>
      <div class="big-hz">${esc(q.c)}</div>
      <p class="muted"><span class="hz" style="color:var(--jade)">${esc(q.radical.r)}</span> ${esc(q.radical.en)} + ?</p>` }),
    makeOptions: (q) => [q.en, ...pickGuessDistractors(q, pool)]
      .map((en, i) => ({ html: `<span class="en">${esc(en)}</span>`, correct: i === 0 })),
    reveal: (q) => `${hzSpan(q.c, 1.4)} <span class="py">${esc(q.py)}</span> ${esc(q.en)} · <span class="hz" style="color:var(--jade)">${esc(q.radical.r)}</span> ${esc(q.radical.en)} ${sayBtns(q.c, q.py, true)}`,
  });
}

// Radical -> meaning flashcards, self-graded.
function cardsQuiz(ui, el, radicals, { then, back }) {
  const queue = shuffleWith(radicals).slice(0, 12), total = queue.length;
  const again = new Set();
  let flipped = false, known = 0;
  const finish = () => {
    const missed = [...again];
    progress.addSession({ type: "radical-cards", lesson: 0, score: known, total, missed });
    if (then) return then({ title: "部首 · Cards", right: known, total, missed, missedItems: [] });
    el.innerHTML = `<div class="panel" style="justify-items:center;text-align:center"><div class="score">${known} / ${total}</div>
      <p>${again.size ? "Practice these again:" : "Every card right the first time!"}</p>
      ${again.size ? `<div class="result-list">${missed.map((w) => `<span>${esc(w)}</span>`).join("")}</div>` : ""}
      <div class="controls">${ui.backBtn()}</div></div>`;
    all$("[data-back]", el).forEach((b) => b.addEventListener("click", back));
  };
  const render = () => {
    const r = queue[0];
    if (!r) return finish();
    const ex = (r.examples || []).slice(0, 3).map((c) => hzSpan(c, 1.4)).join(" ");
    const frontHtml = `<div class="fc-front">${esc(r.r)}</div>`;
    const backHtml = `<div class="fc-back"><div class="en">${esc(r.en)}</div><div class="hz">${esc(r.r)}${r.full && r.full !== r.r ? ` · ${esc(r.full)}` : ""}</div>
      <div class="py">${esc(r.py)} · ${esc(r.name)}</div><div>${ex}</div></div>`;
    el.innerHTML = `<div class="fc-wrap">
      <div class="progress">${queue.length} left · ${known} known</div>
      <button class="fc" type="button" id="rcCard" aria-label="Flip card">${flipped ? backHtml : frontHtml + `<div class="tap">Tap to flip</div>`}</button>
      <div class="fc-controls">${flipped
        ? `<button class="btn big" type="button" id="rcAgain">Again</button>${sayBtns(r.full || r.r, r.py)}<button class="btn primary big" type="button" id="rcGot">${icon("check")} Got it</button>`
        : `<button class="btn primary big" type="button" id="rcFlip">Flip</button>`}</div>
      <div class="controls" style="justify-content:center">${ui.backBtn("Stop")}</div></div>`;
    all$("[data-back]", el).forEach((b) => b.addEventListener("click", back));
    const flip = () => { if (!flipped) { flipped = true; render(); autoSay(r.full || r.r); } };
    $("#rcCard", el).addEventListener("click", flip);
    $("#rcFlip", el)?.addEventListener("click", flip);
    const rate = (ok) => {
      progress.record(radicalKey(r.r), ok ? { ok: true } : { ok: false, miss: 1 });
      queue.shift();
      if (ok) known++; else { again.add(r.r); queue.push(r); }
      flipped = false; render();
    };
    $("#rcGot", el)?.addEventListener("click", () => rate(true));
    $("#rcAgain", el)?.addEventListener("click", () => rate(false));
  };
  render();
}

// First argument: the practice `ui`, or a container element (then the shared ui is used and we render into it).
export function startRadicalPractice(first, { mode, radicals, then, host, back } = {}) {
  const ui = first?.nodeType ? practiceUi : first || practiceUi;
  const container = first?.nodeType ? first : host ? $(host) : null;
  const done = { title: "部首", right: 0, total: 0, missed: [], missedItems: [] };
  const leave = back || (() => then?.(done));
  if (container && (container.id || host)) setHost(container.id ? "#" + container.id : host, { back: leave });
  const el = container || ui.body();
  back = leave;
  // Callers may pass radical strings ("氵") or core objects; work with core objects.
  const byR = new Map(allCoreRadicals().map((x) => [x.r, x]));
  const list = (radicals || []).map((x) => (typeof x === "string" ? byR.get(x) : x)).filter(Boolean);
  if (mode === "cards") return list.length ? cardsQuiz(ui, el, list, { then, back: leave }) : nothing(ui, el, "No radicals to practise yet.", leave);
  if (mode === "find") return findQuiz(ui, list, { then, back });
  if (mode === "guess") return guessQuiz(ui, list, { then, back });
  if (mode === "due") {
    const due = dueRadicals(list, progress.get);
    if (!due.length) return nothing(ui, el, "Nothing due. Come back later.", leave);
    // A short find round first, then cards for the same due radicals.
    return findQuiz(ui, shuffleWith(due).slice(0, 5), { back, title: "部首 · Due", then: () => cardsQuiz(ui, el, due, { then, back: leave }) });
  }
}
