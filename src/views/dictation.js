// Dictation tab (听写): hear a word, write it from memory.
import { $, $$, css, shuffle, esc } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { say, hasVoice } from "../lib/speech.js";
import { gridSVG, makeWriter, trackWriter, clearWriters } from "../lib/draw.js";
import { app } from "../app.js";
import * as progress from "../progress/store.js";

let dict = null;
let hostSel = "#tab-dict";

// words: optional list of word objects (Review passes the weak ones); default = whole lesson.
export function dictIntro(opts = {}) {
  dict = null;
  hostSel = opts.host || "#tab-dict";
  const words = opts.words || app.L().words;
  const title = opts.title || "听写 tīngxiě · Dictation";
  $(hostSel).innerHTML = `<div class="panel">
    <span class="lbl">${title}</span>
    <p style="margin:0">老师 says a word. You write it from memory, with no grey outline. After 3 mistakes on one stroke, it shows you a hint.</p>
    <p class="note">Turn your sound on. ${words.length} word${words.length > 1 ? "s" : ""}, in random order.</p>
    <div class="controls">
      <button class="btn primary big" type="button" id="dictStart">▶ Start dictation</button>
      ${opts.back ? `<button class="btn big" type="button" id="dictBack">← Back</button>` : ""}
    </div>
  </div>`;
  $("#dictStart").addEventListener("click", () => {
    dict = { words, order: shuffle(words.map((_, i) => i)), pos: 0, perfect: 0, missed: [], kind: opts.kind || "dict", back: opts.back };
    dictWord();
  });
  if (opts.back) $("#dictBack").addEventListener("click", opts.back);
}

export const dictActive = () => !!dict && dict.pos < dict.order.length;

export function dictWord() {
  clearWriters();
  const host = $(hostSel);
  const total = dict.order.length;
  if (dict.pos >= total) return dictEnd();
  const word = dict.words[dict.order[dict.pos]];
  const chars = [...word.w];
  host.innerHTML = `<div class="panel">
    <div class="progress">Word ${dict.pos + 1} of ${total} · ✓ ${dict.perfect} perfect</div>
    <div class="bar"><i style="width:${(dict.pos / total) * 100}%"></i></div>
    <div class="controls">
      <button class="btn primary big" type="button" data-say="${esc(word.w)}">🔊 Listen</button>
      <button class="btn big" type="button" data-say="${esc(word.w)}" data-slow>🐢 Slow</button>
      <button class="btn" type="button" id="dictHint">💡 Hint</button>
    </div>
    <div class="hint" id="dictHintText" hidden></div>
    <div class="dict-boxes">${chars.map(() => `<div class="box">${gridSVG()}<div class="hw"></div></div>`).join("")}</div>
    <div class="status" id="dictStatus" aria-live="polite">Write the word you hear.</div>
    <div class="answer" id="dictAnswer" hidden></div>
    <div class="controls">
      <button class="btn" type="button" id="dictShow">Show answer</button>
      <button class="btn primary" type="button" id="dictNext" hidden>Next word ▶</button>
    </div>
  </div>`;
  let hintLevel = 0, mistakes = 0, doneCount = 0, gaveUp = false, finished = false;
  const status = $("#dictStatus");
  const ws = $$(".dict-boxes .hw", host).map((b, i) => {
    const size = Math.round(b.getBoundingClientRect().width) || 160;
    const w = trackWriter(makeWriter(b, chars[i], size, { showOutline: false, highlightColor: css("--jade") }));
    w.quiz({
      showHintAfterMisses: 3, highlightOnComplete: true,
      onMistake: () => { mistakes++; },
      onComplete: () => { doneCount++; if (doneCount === chars.length) finish(); },
    });
    return w;
  });
  function finish() {
    if (finished) return;
    finished = true;
    const perfect = !gaveUp && mistakes === 0 && hintLevel === 0;
    if (perfect) dict.perfect++; else dict.missed.push(word.w);
    progress.record("d:" + word.w, { ok: perfect, miss: mistakes + (gaveUp ? 3 : 0) + hintLevel });
    status.textContent = gaveUp ? "Here's the answer. You'll get it next time!" : perfect ? "太好了! Perfect!" : mistakes ? `很好! Done with ${mistakes} mistake${mistakes > 1 ? "s" : ""}.` : "很好! Done, with a hint.";
    $("#dictAnswer").innerHTML = `<span class="hz">${word.w}</span><span class="py">${tonePy(word.py)}</span><span style="color:var(--muted)">${word.en}</span>`;
    $("#dictAnswer").hidden = false;
    $("#dictShow").hidden = true;
    $("#dictNext").hidden = false;
    $("#dictNext").textContent = dict.pos + 1 >= total ? "See results ▶" : "Next word ▶";
    $("#dictNext").focus({ preventScroll: true });
  }
  function showHint(level) {
    hintLevel = Math.max(hintLevel, level);
    const t = $("#dictHintText");
    t.hidden = false;
    t.innerHTML = hintLevel === 1 ? `Meaning: <b>${word.en}</b>` : `Meaning: <b>${word.en}</b> · <span class="py">${tonePy(word.py)}</span>`;
    $("#dictHint").disabled = hintLevel >= 2;
  }
  $("#dictHint").addEventListener("click", () => showHint(hintLevel + 1));
  $("#dictShow").addEventListener("click", () => {
    gaveUp = true;
    ws.forEach((w) => { w.cancelQuiz(); w.animateCharacter(); });
    finish();
  });
  $("#dictNext").addEventListener("click", () => { dict.pos++; dictWord(); });
  // Without a Chinese voice, dictation still works from meaning + pinyin (and that doesn't count as a hint).
  if (!hasVoice()) { showHint(2); hintLevel = 0; }
  setTimeout(() => say(word.w), 250);
}

function dictEnd() {
  clearWriters();
  const total = dict.order.length;
  progress.addSession({ type: dict.kind, lesson: app.L().n, score: dict.perfect, total, missed: dict.missed });
  const back = dict.back;
  $(hostSel).innerHTML = `<div class="panel">
    <span class="lbl">Results</span>
    <div class="score">${dict.perfect} / ${total} perfect</div>
    ${dict.missed.length ? `<p style="margin:0">Practice these again:</p><div class="result-list">${dict.missed.map((w) => `<span>${w}</span>`).join("")}</div>`
      : `<p style="margin:0">全对！Quán duì! Everything correct!</p>`}
    <div class="controls">
      <button class="btn primary big" type="button" id="dictAgain">↺ Try again</button>
      ${dict.missed.length ? `<button class="btn big" type="button" id="dictMissed">Only the missed ones</button>` : ""}
      ${back ? `<button class="btn big" type="button" id="dictBack2">← Back</button>` : ""}
    </div>
  </div>`;
  const words = dict.words, kind = dict.kind, missed = dict.missed;
  $("#dictAgain").addEventListener("click", () => dictIntro({ host: hostSel, words, kind, back }));
  $("#dictMissed")?.addEventListener("click", () =>
    dictIntro({ host: hostSel, words: words.filter((w) => missed.includes(w.w)), kind, back, title: "Missed words" }));
  $("#dictBack2")?.addEventListener("click", back);
  dict = null;
}

// Re-draw the current word after a resize / rotation (writers have a fixed size).
export function dictRedraw() {
  if (dictActive()) dictWord();
}
