// Write a word from memory. Used by the lesson's Dictation tab, Review, and the Writing section.
// prompt: "audio" (听写: hear it), "pinyin" (see the pinyin) or "meaning" (see the English).
import { $, $$, css, shuffle, esc } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { say, canSay } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { gridSVG, makeWriter, trackWriter, clearWriters } from "../lib/draw.js";
import { app } from "../app.js";
import * as progress from "../progress/store.js";

const PROMPT = {
  audio: { title: "听写 tīngxiě · Dictation", how: "老师 says a word. Write it from memory, with no grey outline." },
  pinyin: { title: "看拼音写汉字 · From pinyin", how: "Read the pinyin, then write the characters from memory." },
  meaning: { title: "看意思写汉字 · From meaning", how: "Read the English meaning, then write the Chinese word." },
  mixed: { title: "写 · Writing review", how: "Each word comes as sound, pinyin or meaning. Write it from memory." },
};

let dict = null;
let hostSel = "#tab-dict";

// opts: { host, words, title, prompt, kind, back, lesson, autostart, then }
// autostart: skip the start screen (Review). then(result): continue a review chain instead of showing results.
export function dictIntro(opts = {}) {
  dict = null;
  hostSel = opts.host || "#tab-dict";
  const words = opts.words || app.L().words;
  const prompt = opts.prompt || "audio";
  const p = PROMPT[prompt];
  $(hostSel).innerHTML = `<div class="panel">
    <span class="lbl">${opts.title || p.title}</span>
    <p>${p.how} After 3 mistakes on one stroke, it shows you a hint.</p>
    <p class="note">${prompt === "audio" ? "Turn your sound on. " : ""}${words.length} word${words.length > 1 ? "s" : ""}, in random order.</p>
    <div class="controls">
      <button class="btn primary big" type="button" id="dictStart">${icon("play")} Start</button>
      ${opts.back ? `<button class="btn big" type="button" id="dictBack">Back</button>` : ""}
    </div>
  </div>`;
  const start = () => {
    dict = { ...opts, words, prompt, order: shuffle(words.map((_, i) => i)), pos: 0, perfect: 0, missed: [], kind: opts.kind || "dict" };
    dictWord();
  };
  if (opts.autostart) return start();
  $("#dictStart").addEventListener("click", start);
  if (opts.back) $("#dictBack").addEventListener("click", opts.back);
}

// A dictation is on screen (not just left unfinished on another page).
export const dictActive = () => {
  const host = $(hostSel);
  return !!dict && dict.pos < dict.order.length && !!host?.querySelector(".dict-boxes") && !host.closest("[hidden]");
};

export function dictWord() {
  clearWriters();
  const host = $(hostSel);
  const total = dict.order.length;
  if (dict.pos >= total) return dictEnd();
  const word = dict.words[dict.order[dict.pos]];
  const chars = [...word.w];
  const prompt = dict.prompt === "mixed" ? ["audio", "pinyin", "meaning"][dict.pos % 3] : dict.prompt;
  const audio = prompt === "audio";
  const promptHtml = audio ? "" : prompt === "pinyin"
    ? `<div class="prompt-big py">${tonePy(word.py)}</div>`
    : `<div class="prompt-big">${esc(word.en)}</div>`;
  host.innerHTML = `<div class="panel">
    <div class="progress">Word ${dict.pos + 1} of ${total} · ${dict.perfect} perfect</div>
    <div class="bar"><i style="width:${(dict.pos / total) * 100}%"></i></div>
    ${promptHtml}
    <div class="controls">
      ${audio ? `<button class="btn primary" type="button" data-say="${esc(word.w)}">${icon("speaker")} Listen</button>
      <button class="btn" type="button" data-say="${esc(word.w)}" data-slow>${icon("slow")} Slow</button>` : ""}
      <button class="btn" type="button" id="dictHint">${icon("hint")} Hint</button>
    </div>
    <div class="hint" id="dictHintText" hidden></div>
    <div class="dict-boxes">${chars.map(() => `<div class="box">${gridSVG()}<div class="hw"></div></div>`).join("")}</div>
    <div class="status" id="dictStatus" aria-live="polite">Write the word${audio ? " you hear" : ""}.</div>
    <div class="answer" id="dictAnswer" hidden></div>
    <div class="controls">
      <button class="btn" type="button" id="dictShow">Show answer</button>
      <button class="btn primary" type="button" id="dictNext" hidden>Next word</button>
      ${dict.back ? `<button class="btn ghost" type="button" id="dictStop">${dict.then ? "Stop" : "Back"}</button>` : ""}
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
    $("#dictAnswer").innerHTML = `<span class="hz">${word.w}</span><span class="py">${tonePy(word.py)}</span><span class="muted">${esc(word.en)}</span>`;
    $("#dictAnswer").hidden = false;
    $("#dictShow").hidden = true;
    $("#dictNext").hidden = false;
    $("#dictNext").textContent = dict.pos + 1 >= total ? (dict.then ? "Continue" : "See results") : "Next word";
    $("#dictNext").focus({ preventScroll: true });
    if (!audio) say(word.w);
  }
  // Hints: audio prompt → meaning, then pinyin. Pinyin prompt → meaning, then sound. Meaning prompt → pinyin, then sound.
  function showHint(level) {
    hintLevel = Math.max(hintLevel, level);
    const t = $("#dictHintText");
    t.hidden = false;
    const mean = `Meaning: <b>${esc(word.en)}</b>`, py = `<span class="py">${tonePy(word.py)}</span>`;
    if (prompt === "audio") t.innerHTML = hintLevel === 1 ? mean : `${mean} · ${py}`;
    else if (prompt === "pinyin") { t.innerHTML = mean; if (hintLevel >= 2) say(word.w); }
    else { t.innerHTML = py; if (hintLevel >= 2) say(word.w); }
    $("#dictHint").disabled = hintLevel >= 2;
  }
  $("#dictHint").addEventListener("click", () => showHint(hintLevel + 1));
  $("#dictShow").addEventListener("click", () => {
    gaveUp = true;
    ws.forEach((w) => { w.cancelQuiz(); w.animateCharacter(); });
    finish();
  });
  $("#dictNext").addEventListener("click", () => { dict.pos++; dictWord(); });
  $("#dictStop")?.addEventListener("click", () => { const back = dict.back; dict = null; clearWriters(); back(); });
  if (audio) {
    // Without any sound for this word, dictation still works from meaning + pinyin (and that doesn't count as a hint).
    if (!canSay(word.w)) { showHint(2); hintLevel = 0; }
    setTimeout(() => say(word.w), 250);
  }
}

function dictEnd() {
  clearWriters();
  const total = dict.order.length;
  progress.addSession({ type: dict.kind, lesson: dict.lesson ?? app.L()?.n ?? 0, score: dict.perfect, total, missed: dict.missed });
  const { words, missed } = dict, opts = { ...dict };
  if (opts.then) { dict = null; return opts.then({ title: "Writing", right: opts.perfect, total, missed }); }
  $(hostSel).innerHTML = `<div class="panel">
    <span class="lbl">Results</span>
    <div class="score">${dict.perfect} / ${total} perfect</div>
    ${missed.length ? `<p>Practice these again:</p><div class="result-list">${missed.map((w) => `<span>${w}</span>`).join("")}</div>`
      : `<p>全对！Quán duì! Everything correct!</p>`}
    <div class="controls">
      <button class="btn primary big" type="button" id="dictAgain">${icon("replay")} Again</button>
      ${missed.length ? `<button class="btn big" type="button" id="dictMissed">Only the missed ones</button>` : ""}
      ${opts.back ? `<button class="btn big" type="button" id="dictBack2">Back</button>` : ""}
    </div>
  </div>`;
  const restart = (ws, title) => dictIntro({ host: hostSel, words: ws, prompt: opts.prompt, kind: opts.kind, back: opts.back, lesson: opts.lesson, title });
  $("#dictAgain").addEventListener("click", () => restart(words, opts.title));
  $("#dictMissed")?.addEventListener("click", () => restart(words.filter((w) => missed.includes(w.w)), "Missed words"));
  $("#dictBack2")?.addEventListener("click", opts.back);
  dict = null;
}

// Re-draw the current word after a resize / rotation (writers have a fixed size).
export function dictRedraw() {
  if (dictActive()) dictWord();
}
