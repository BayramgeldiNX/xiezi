// Notebook review: flashcards, listening, writing and sentence gap over the saved words.
// Results go to the schedule key "nb:<word>" only; nothing here touches the book keys (w:, f:, d: ...).
import { $, $$, esc, shuffle, css } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { autoSay, sayLater, canSay, sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { gridSVG, makeWriter, trackWriter, clearWriters } from "../lib/draw.js";
import { setting } from "../lib/settings.js";
import { LESSONS, wordsOf, ensureChars, STROKE_DATA } from "../data/index.js";
import * as progress from "../progress/store.js";
import * as nb from "../notebook/store.js";
import { animate, flipOut, flipIn } from "../lib/motion.js";
import { runRound } from "./quiz-round.js";

const isHan = (c) => /\p{Script=Han}/u.test(c);
const TYPES = ["flash", "listen", "write", "gap"];
const TITLE = { flash: "Flashcards", listen: "Listening", write: "Writing", gap: "Sentence gap" };
const MAX_DUE = 20;

let host = "#notebookBody";
const body = () => $(host);

// Can this word be asked in this way? (Writing needs stroke data, so call prepare() first.)
const writable = (e) => [...e.w].filter(isHan).length > 0 && [...e.w].filter(isHan).every((c) => STROKE_DATA[c]);
const can = {
  flash: () => true,
  listen: (e) => canSay(e.w),
  write: writable,
  gap: (e) => !!e.sentence?.cn && e.sentence.cn.includes(e.w),
};
const prepare = (entries) => ensureChars(new Set(entries.flatMap((e) => [...e.w].filter(isHan)).join("")));

const empty = (back, text = "No words to practise here yet.") => {
  clearWriters();
  body().innerHTML = `<div class="panel"><p class="muted">${esc(text)}</p><div class="controls"><button class="btn" type="button" id="nbrBack">Back</button></div></div>`;
  $("#nbrBack").addEventListener("click", back);
};

/* ---------- entry points ---------- */
// The Review button: words that are due (or new), at most 20, each asked once in the way its turn comes up.
export async function reviewDue(h, back) {
  host = h;
  const words = shuffle(nb.dueWords()).slice(0, MAX_DUE);
  if (!words.length) return empty(back, "Nothing to review right now. Come back later.");
  body().innerHTML = `<div class="panel"><p class="muted">Getting ready…</p></div>`;
  await prepare(words);
  const items = words.map((e) => {
    const types = TYPES.filter((t) => can[t](e));
    return { e, type: types[(progress.get(nb.nbKey(e.w))?.n || 0) % types.length] };
  });
  run({ items, title: "Review", back, flashDir: "mixed" });
}

// A practice button: one type, all words that can do it.
export async function practice(h, type, back) {
  host = h;
  let words = shuffle(nb.list());
  if (type === "write") {
    body().innerHTML = `<div class="panel"><p class="muted">Getting ready…</p></div>`;
    words = words.slice(0, 40);
    await prepare(words);
  }
  words = words.filter(can[type]).slice(0, type === "write" ? 10 : 20);
  if (!words.length) {
    return empty(back, type === "gap" ? "Sentence gap needs words that have a sentence. Claude adds them soon."
      : type === "write" ? "None of your words has stroke order yet." : "No words to practise here yet.");
  }
  if (type === "flash") return flashChoice(words, back);
  run({ items: words.map((e) => ({ e, type })), title: TITLE[type], back });
}

function flashChoice(words, back) {
  body().innerHTML = `<div class="panel"><span class="lbl">Flashcards</span>
    <p>Which side first?</p>
    <div class="controls">
      <button class="btn primary big" type="button" data-dir="hz">汉字 → meaning</button>
      <button class="btn big" type="button" data-dir="en">Meaning → 汉字</button>
      <button class="btn big" type="button" data-dir="mixed">Mixed</button>
      <button class="btn ghost" type="button" id="nbrBack">Back</button></div></div>`;
  $("#nbrBack").addEventListener("click", back);
  $$("[data-dir]", body()).forEach((b) => b.addEventListener("click", () =>
    run({ items: words.map((e) => ({ e, type: "flash" })), title: "Flashcards", back, flashDir: b.dataset.dir })));
}

/* ---------- the run: the shared quiz round, one item asked in its own way ---------- */
// S: { items: [{ e, type }], title, back, flashDir? }
function run(S) {
  const dir = new Map(); // a flashcard keeps its side for the whole run, Retry included
  runRound({
    kind: "notebook", title: S.title, items: S.items, label: (it) => it.e.w,
    head: (it) => (S.title === "Review" ? `${S.title} · ${TITLE[it.type]}` : S.title),
    skip: (it) => ({ listen: "不知道 · Don't know", gap: "不知道 · Don't know", write: "Show answer" })[it.type],
    host: body, back: () => { clearWriters(); S.back(); }, pinyin: { annotateText: false },
    ask: (it, q) => ({ flash, listen, write, gap })[it.type](it, q, S, dir),
  });
}

// Save one answer to the Notebook schedule.
const record = (it, ok, miss = ok ? 0 : 1, opts) => progress.record(nb.nbKey(it.e.w), { ok, miss }, opts);

// What we show once the answer is known.
const reveal = (e) => `<span class="hz">${esc(e.w)}</span> <span class="py">${tonePy(esc(e.py || ""))}</span> <span class="muted">${esc(e.en || "")}</span>`;

/* ----- flashcards: you say whether you knew it, then the next card comes ----- */
function flash(it, q, S, dirs) {
  const e = it.e;
  if (!dirs.has(e.w)) dirs.set(e.w, S.flashDir === "mixed" ? (Math.random() < 0.5 ? "hz" : "en") : S.flashDir || "hz");
  // A card with no meaning can only be shown from the word side.
  const dir = e.en ? dirs.get(e.w) : "hz";
  let flipped = false, anim = "next", turning = false;
  q.draw(`<div class="fc-wrap" id="nbCard"></div>`);
  const wrap = $("#nbCard", q.el);
  const draw = () => {
    const front = dir === "hz" ? `<div class="fc-front">${esc(e.w)}</div>` : `<div class="fc-front en">${esc(e.en)}</div>`;
    const back = `<div class="fc-back"><div class="hz">${esc(e.w)}</div><div class="py">${tonePy(esc(e.py || ""))}</div><div class="en">${esc(e.en || "")}</div></div>`;
    wrap.innerHTML = `<button class="fc" type="button" id="fcCard" aria-label="Flip card">${flipped ? back : front + `<div class="tap">Tap to flip</div>`}</button>
      <div class="fc-controls">${flipped
        ? `<button class="btn big" type="button" id="fcNo">Again</button>${sayBtns(e.w, e.py || e.w)}<button class="btn primary big" type="button" id="fcYes">${icon("check")} Got it</button>`
        : `<button class="btn primary big" type="button" id="fcFlip">Flip</button>`}</div>`;
    const card = $("#fcCard", wrap);
    const flip = () => {
      if (flipped || turning) return;
      turning = true;
      autoSay(e.w);
      flipOut(card, () => { turning = false; if (flipped || !card.isConnected) return; flipped = true; anim = "flip"; draw(); });
    };
    // The same motion as the lesson flashcards: the card turns over, the next one slides in.
    if (anim === "flip") flipIn(card);
    else if (anim === "next" && q.pos > 0) animate(card, [{ transform: "translateX(24px)", opacity: 0 }, { transform: "none", opacity: 1 }]);
    anim = null;
    card.addEventListener("click", flip);
    $("#fcFlip", wrap)?.addEventListener("click", flip);
    const rate = (ok) => { record(it, ok, ok ? 0 : 1, { quiet: true }); q.done(ok); q.next(); };
    $("#fcYes", wrap)?.addEventListener("click", () => rate(true));
    $("#fcNo", wrap)?.addEventListener("click", () => rate(false));
  };
  draw();
}

/* ----- choices (listening, sentence gap) ----- */
// Three other words: other Notebook words first, then words from the books.
function distractors(e, n = 3) {
  const pool = [shuffle(nb.list().filter((x) => x.w !== e.w)), shuffle(wordsOf(LESSONS).filter((x) => x.w !== e.w))];
  const seen = new Set([e.w]), out = [];
  for (const group of pool) for (const x of group) {
    if (out.length >= n) break;
    if (!seen.has(x.w)) { seen.add(x.w); out.push({ w: x.w, py: x.py || "", en: x.en || "" }); }
  }
  return out;
}

function choice(it, q, { prompt, say: toSay, revealHtml, noPy = false }) {
  const e = it.e;
  const opts = shuffle([{ w: e.w, py: e.py || "", correct: true }, ...distractors(e).map((d) => ({ ...d, correct: false }))]);
  q.draw(`${prompt}
    ${toSay ? `<div class="controls"><button class="btn primary big" type="button" data-say="${esc(toSay)}">${icon("speaker")} Listen</button>
      <button class="btn big" type="button" data-say="${esc(toSay)}" data-slow>${icon("slow")} Slow</button></div>` : ""}
    <div class="choices">${opts.map((o, i) => `<button class="choice" type="button" data-i="${i}"><span class="hz" style="font-size:1.3rem">${esc(o.w)}</span>${o.py && !noPy ? ` <span class="py">${tonePy(esc(o.py))}</span>` : ""}</button>`).join("")}</div>
    <div class="status" id="qStatus" aria-live="polite"></div>
    <div class="answer" id="qAnswer" hidden></div>`);
  const el = q.el, st = $("#qStatus", el), ans = $("#qAnswer", el);
  let done = false;
  const pick = (b) => {
    if (done) return;
    done = true;
    const ok = b ? opts[+b.dataset.i].correct : false;
    $$(".choice", el).forEach((c) => {
      c.disabled = true;
      if (opts[+c.dataset.i].correct) c.classList.add("right"); else if (c === b) c.classList.add("wrong");
    });
    record(it, ok);
    st.style.color = ok ? "" : "var(--cinnabar)";
    st.textContent = ok ? "对了！Correct!" : b ? "Not quite." : "No problem. Here is the answer.";
    ans.innerHTML = revealHtml;
    // A mistake also shows what the chosen word is.
    if (b && !ok) ans.insertAdjacentHTML("beforeend", `<div class="why"><p><span class="why-lbl">You chose</span> ${reveal(opts[+b.dataset.i])}</p></div>`);
    ans.hidden = false;
    q.done(ok);
    if (!toSay) autoSay(e.w);
  };
  $$(".choice", el).forEach((b) => b.addEventListener("click", () => pick(b)));
  if (toSay) sayLater(toSay, { auto: false }); // the question is the sound, so always play it
  return { skip: () => pick(null) };
}

function listen(it, q) {
  return choice(it, q, { prompt: `<p>Which word do you hear?</p>`, say: it.e.w, revealHtml: reveal(it.e), noPy: true });
}

function gap(it, q) {
  const e = it.e, s = e.sentence;
  const blanked = esc(s.cn).replace(esc(e.w), `<span class="gr-blank">？</span>`);
  const filled = esc(s.cn).replace(esc(e.w), `<u class="gr-fill">${esc(e.w)}</u>`);
  return choice(it, q, {
    prompt: `<p class="hz gr-q" data-en-done="1">${blanked}</p>${s.en ? `<p class="muted q-en" lang="en">${esc(s.en)}</p>` : ""}`,
    revealHtml: `<span class="hz">${filled}</span> ${sayBtns(s.cn, "sentence", true)}<br>${reveal(e)}`,
  });
}

/* ----- writing ----- */
function write(it, q) {
  const e = it.e, chars = [...e.w].filter(isHan);
  q.draw(`${e.py ? `<div class="prompt-big py">${tonePy(esc(e.py))}</div>` : ""}${e.en ? `<div class="prompt-big">${esc(e.en)}</div>` : ""}
    <div class="controls"><button class="btn primary" type="button" data-say="${esc(e.w)}">${icon("speaker")} Listen</button></div>
    <div class="dict-boxes">${chars.map(() => `<div class="box">${gridSVG()}<div class="hw"></div></div>`).join("")}</div>
    <div class="status" id="wStatus" aria-live="polite">Write the word.</div>
    <div class="answer" id="wAnswer" hidden></div>`);
  const el = q.el;
  let mistakes = 0, done = 0, gaveUp = false, finished = false;
  const ws = $$(".dict-boxes .hw", el).map((b, i) => {
    const size = Math.round(b.getBoundingClientRect().width) || 160;
    const w = trackWriter(makeWriter(b, chars[i], size, { showOutline: false, highlightColor: css("--jade") }));
    w.quiz({
      showHintAfterMisses: setting("hintAfter") ? setting("hintAfter") + 1 : false, highlightOnComplete: true,
      onMistake: () => { mistakes++; },
      onComplete: () => { done++; if (done === chars.length) finish(); },
    });
    return w;
  });
  function finish() {
    if (finished) return;
    finished = true;
    const ok = !gaveUp && mistakes === 0;
    record(it, ok, mistakes + (gaveUp ? 3 : 0));
    $("#wStatus", el).textContent = gaveUp ? "Here's the answer. You'll get it next time!" : ok ? "太好了! Perfect!" : `很好! Done with ${mistakes} mistake${mistakes > 1 ? "s" : ""}.`;
    $("#wAnswer", el).innerHTML = reveal(e);
    $("#wAnswer", el).hidden = false;
    q.done(ok);
    autoSay(e.w);
  }
  return {
    skip() { gaveUp = true; ws.forEach((w) => { w.cancelQuiz(); w.animateCharacter(); }); finish(); },
    stop: clearWriters,
  };
}
