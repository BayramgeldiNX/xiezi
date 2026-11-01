// Notebook review: flashcards, listening, writing and sentence gap over the saved words.
// Results go to the schedule key "nb:<word>" only; nothing here touches the book keys (w:, f:, d: ...).
import { $, $$, esc, shuffle, css } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { say, autoSay, canSay, sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { gridSVG, makeWriter, trackWriter, clearWriters } from "../lib/draw.js";
import { setting } from "../lib/settings.js";
import { LESSONS, wordsOf, ensureChars, STROKE_DATA } from "../data/index.js";
import * as progress from "../progress/store.js";
import * as nb from "../notebook/store.js";

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

/* ---------- the run ---------- */
function run(S) {
  S.pos = 0; S.right = 0; S.missed = [];
  S.dir = new Map();
  next(S);
}

function next(S) {
  clearWriters();
  if (S.pos >= S.items.length) return results(S);
  const it = S.items[S.pos];
  const ask = { flash, listen, write, gap }[it.type];
  ask(S, it);
}

const head = (S, it) => `<span class="lbl">${esc(S.title)}${S.title === "Review" ? ` · ${TITLE[it.type]}` : ""}</span>
  <div class="progress">${S.pos + 1} of ${S.items.length} · ${S.right} right</div>
  <div class="bar"><i style="width:${(S.pos / S.items.length) * 100}%"></i></div>`;
const stopBtn = `<button class="btn ghost" type="button" id="nbrStop">Stop</button>`;

// Save one answer and go on.
function answer(S, it, ok, miss = ok ? 0 : 1) {
  progress.record(nb.nbKey(it.e.w), { ok, miss });
  if (ok) S.right++; else S.missed.push(it);
}
const advance = (S) => { S.pos++; next(S); };

// What we show once the answer is known.
const reveal = (e) => `<span class="hz">${esc(e.w)}</span> <span class="py">${tonePy(esc(e.py || ""))}</span> <span class="muted">${esc(e.en || "")}</span>`;

/* ----- flashcards ----- */
function flash(S, it) {
  const e = it.e;
  if (!S.dir.has(e.w)) S.dir.set(e.w, S.flashDir === "mixed" ? (Math.random() < 0.5 ? "hz" : "en") : S.flashDir);
  // A card with no meaning can only be shown from the word side.
  const dir = e.en ? S.dir.get(e.w) : "hz";
  let flipped = false;
  const draw = () => {
    const front = dir === "hz" ? `<div class="fc-front">${esc(e.w)}</div>` : `<div class="fc-front en">${esc(e.en)}</div>`;
    const back = `<div class="fc-back"><div class="hz">${esc(e.w)}</div><div class="py">${tonePy(esc(e.py || ""))}</div><div class="en">${esc(e.en || "")}</div></div>`;
    body().innerHTML = `<div class="fc-wrap">${head(S, it)}
      <button class="fc" type="button" id="fcCard" aria-label="Flip card">${flipped ? back : front + `<div class="tap">Tap to flip</div>`}</button>
      <div class="fc-controls">${flipped
        ? `<button class="btn big" type="button" id="fcNo">Again</button>${sayBtns(e.w, e.py || e.w)}<button class="btn primary big" type="button" id="fcYes">${icon("check")} Got it</button>`
        : `<button class="btn primary big" type="button" id="fcFlip">Flip</button>`}</div>
      ${stopBtn}</div>`;
    const flip = () => { if (!flipped) { flipped = true; draw(); autoSay(e.w); } };
    $("#fcCard").addEventListener("click", flip);
    $("#fcFlip")?.addEventListener("click", flip);
    $("#fcYes")?.addEventListener("click", () => { answer(S, it, true); advance(S); });
    $("#fcNo")?.addEventListener("click", () => { answer(S, it, false); advance(S); });
    $("#nbrStop").addEventListener("click", () => results(S, true));
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
    if (!seen.has(x.w)) { seen.add(x.w); out.push({ w: x.w, py: x.py || "" }); }
  }
  return out;
}

function choice(S, it, { prompt, say: toSay, revealHtml }) {
  const e = it.e;
  const opts = shuffle([{ w: e.w, py: e.py || "", correct: true }, ...distractors(e).map((d) => ({ ...d, correct: false }))]);
  body().innerHTML = `<div class="panel">${head(S, it)}${prompt}
    ${toSay ? `<div class="controls"><button class="btn primary big" type="button" data-say="${esc(toSay)}">${icon("speaker")} Listen</button>
      <button class="btn big" type="button" data-say="${esc(toSay)}" data-slow>${icon("slow")} Slow</button></div>` : ""}
    <div class="choices">${opts.map((o, i) => `<button class="choice" type="button" data-i="${i}"><span class="hz" style="font-size:1.3rem">${esc(o.w)}</span>${o.py ? ` <span class="py">${tonePy(esc(o.py))}</span>` : ""}</button>`).join("")}</div>
    <div class="status" id="qStatus" aria-live="polite"></div>
    <div class="answer" id="qAnswer" hidden></div>
    <div class="controls"><button class="btn primary" type="button" id="qNext" hidden>${S.pos + 1 >= S.items.length ? "See results" : "Next"}</button>${stopBtn}</div></div>`;
  $("#nbrStop").addEventListener("click", () => results(S, true));
  $$(".choice", body()).forEach((b) => b.addEventListener("click", () => {
    const ok = opts[+b.dataset.i].correct;
    $$(".choice", body()).forEach((c) => {
      c.disabled = true;
      if (opts[+c.dataset.i].correct) c.classList.add("right"); else if (c === b) c.classList.add("wrong");
    });
    answer(S, it, ok);
    $("#qStatus").style.color = ok ? "" : "var(--cinnabar)";
    $("#qStatus").textContent = ok ? "对了！Correct!" : "Not quite.";
    $("#qAnswer").innerHTML = revealHtml;
    $("#qAnswer").hidden = false;
    $("#qNext").hidden = false;
    $("#qNext").focus({ preventScroll: true });
    if (!toSay) autoSay(e.w);
  }));
  $("#qNext").addEventListener("click", () => advance(S));
  if (toSay) setTimeout(() => say(toSay), 250); // the question is the sound, so always play it
}

function listen(S, it) {
  choice(S, it, { prompt: `<p>Which word do you hear?</p>`, say: it.e.w, revealHtml: reveal(it.e) });
}

function gap(S, it) {
  const e = it.e, s = e.sentence;
  const blanked = esc(s.cn).replace(esc(e.w), `<span class="gr-blank">？</span>`);
  const filled = esc(s.cn).replace(esc(e.w), `<u class="gr-fill">${esc(e.w)}</u>`);
  choice(S, it, {
    prompt: `<p class="hz gr-q">${blanked}</p><p class="muted">${esc(s.en || "")}</p>`,
    revealHtml: `<span class="hz">${filled}</span> ${sayBtns(s.cn, "sentence", true)}<br>${reveal(e)}`,
  });
}

/* ----- writing ----- */
function write(S, it) {
  const e = it.e, chars = [...e.w].filter(isHan);
  body().innerHTML = `<div class="panel">${head(S, it)}
    ${e.py ? `<div class="prompt-big py">${tonePy(esc(e.py))}</div>` : ""}${e.en ? `<div class="prompt-big">${esc(e.en)}</div>` : ""}
    <div class="controls"><button class="btn primary" type="button" data-say="${esc(e.w)}">${icon("speaker")} Listen</button></div>
    <div class="dict-boxes">${chars.map(() => `<div class="box">${gridSVG()}<div class="hw"></div></div>`).join("")}</div>
    <div class="status" id="wStatus" aria-live="polite">Write the word.</div>
    <div class="answer" id="wAnswer" hidden></div>
    <div class="controls"><button class="btn" type="button" id="wShow">Show answer</button>
      <button class="btn primary" type="button" id="wNext" hidden>${S.pos + 1 >= S.items.length ? "See results" : "Next"}</button>${stopBtn}</div></div>`;
  $("#nbrStop").addEventListener("click", () => { clearWriters(); results(S, true); });
  let mistakes = 0, done = 0, gaveUp = false, finished = false;
  const ws = $$(".dict-boxes .hw", body()).map((b, i) => {
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
    answer(S, it, ok, mistakes + (gaveUp ? 3 : 0));
    $("#wStatus").textContent = gaveUp ? "Here's the answer. You'll get it next time!" : ok ? "太好了! Perfect!" : `很好! Done with ${mistakes} mistake${mistakes > 1 ? "s" : ""}.`;
    $("#wAnswer").innerHTML = reveal(e);
    $("#wAnswer").hidden = false;
    $("#wShow").hidden = true;
    $("#wNext").hidden = false;
    $("#wNext").focus({ preventScroll: true });
    autoSay(e.w);
  }
  $("#wShow").addEventListener("click", () => { gaveUp = true; ws.forEach((w) => { w.cancelQuiz(); w.animateCharacter(); }); finish(); });
  $("#wNext").addEventListener("click", () => advance(S));
}

/* ---------- results ---------- */
function results(S, stopped = false) {
  clearWriters();
  const asked = stopped ? S.pos : S.items.length;
  const retry = S.missed.length ? () => run({ ...S, items: S.missed.slice() }) : null;
  body().innerHTML = `<div class="panel">
    <span class="lbl">Results · ${esc(S.title)}</span>
    <div class="score">${S.right} / ${asked}</div>
    ${S.missed.length ? `<p>Practise these again:</p><div class="result-list">${S.missed.map((m) => `<span>${esc(m.e.w)}</span>`).join("")}</div>` : `<p>${asked ? "全对！Quán duì! Everything correct!" : "Nothing answered yet."}</p>`}
    <div class="controls">${retry ? `<button class="btn primary big" type="button" id="resRetry">Retry missed</button>` : ""}
      <button class="btn big" type="button" id="resBack">Back</button></div></div>`;
  $("#resRetry")?.addEventListener("click", retry);
  $("#resBack").addEventListener("click", S.back);
}
