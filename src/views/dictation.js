// Write a word from memory. Used by the lesson practice menu, Review, and the Writing section.
// prompt: "audio" (听写: hear it), "pinyin" (see the pinyin) or "meaning" (see the English).
import { $, $$, css, shuffle, esc, revealNext } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { say, autoSay, sayLater, canSay } from "../lib/speech.js";
import { setting } from "../lib/settings.js";
import { icon } from "../lib/icons.js";
import { gridSVG, makeWriter, trackWriter, clearWriters } from "../lib/draw.js";
import { app } from "../app.js";
import { charLinks } from "./charsheet.js";
import * as progress from "../progress/store.js";
import { quizHead } from "../lib/qpinyin.js";
import * as screen from "../lib/screen.js";

const PROMPT = {
  audio: { title: "听写 tīngxiě · Dictation", how: "老师 says a word. Write it from memory, with no grey outline." },
  pinyin: { title: "看拼音写汉字 · From pinyin", how: "Read the pinyin, then write the characters from memory." },
  meaning: { title: "看意思写汉字 · From meaning", how: "Read the English meaning, then write the Chinese word." },
  mixed: { title: "写 · Writing review", how: "Each word comes as sound, pinyin or meaning. Write it from memory." },
};

let dict = null;
let hostSel = null;

// opts: { host, words, title, prompt, kind, back, lesson, autostart, then }
// words: a list, or a function that picks one ("Again" then picks anew).
// autostart: skip the start screen (Review). then(result): continue a review chain instead of showing results.
export function dictIntro(opts = {}) {
  dict = null;
  screen.onResize(dictRedraw); // writing boxes have a fixed pixel size
  hostSel = opts.host;
  const pick = typeof opts.words === "function" ? opts.words : null;
  const words = (pick ? pick() : opts.words) || app.L().words;
  const prompt = opts.prompt || "audio";
  const p = PROMPT[prompt];
  const hintAfter = setting("hintAfter");
  const hintNote = hintAfter ? ` After ${hintAfter} mistake${hintAfter > 1 ? "s" : ""} on one stroke, it shows you a hint.` : "";
  $(hostSel).innerHTML = `<div class="panel">
    <span class="lbl">${opts.title || p.title}</span>
    <p>${p.how}${hintNote}</p>
    <p class="note">${prompt === "audio" ? "Turn your sound on. " : ""}${words.length} word${words.length > 1 ? "s" : ""}, in random order.</p>
    <div class="controls">
      <button class="btn primary big" type="button" id="dictStart">${icon("play")} Start</button>
      ${opts.back ? `<button class="btn big" type="button" id="dictBack">Back</button>` : ""}
    </div>
  </div>`;
  const start = () => {
    dict = { ...opts, pick, words, prompt, order: shuffle(words.map((_, i) => i)), pos: 0, perfect: 0, missed: [], kind: opts.kind || "dict" };
    dictWord();
  };
  if (opts.autostart) return start();
  $("#dictStart").addEventListener("click", start);
  if (opts.back) $("#dictBack").addEventListener("click", opts.back);
}

// A dictation is on screen (not just left unfinished on another page).
export const dictActive = () => {
  if (!dict) return false;
  const host = $(hostSel);
  return dict.pos < dict.order.length && !!host?.querySelector(".dict-boxes") && !host.closest("[hidden]");
};

// `redraw`: the same word drawn again (the screen changed size), so it is not said again.
export function dictWord({ redraw = false } = {}) {
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
  if (!dict.pos) scrollTo(0, 0);
  host.innerHTML = `<div class="panel dict focus">
    ${quizHead({ title: dict.title || PROMPT[dict.prompt]?.title.split(" · ").pop(), pos: dict.pos, total, toggles: false, leave: dict.back ? (dict.then ? "Stop" : "Back") : null, leaveAttr: 'id="dictStop"' })}
    ${promptHtml}
    <div class="controls">
      ${audio ? `<button class="btn primary" type="button" data-say="${esc(word.w)}">${icon("speaker")} Listen</button>
      <button class="btn" type="button" data-say="${esc(word.w)}" data-slow>${icon("slow")} Slow</button>` : ""}
      <button class="btn" type="button" id="dictHint">${icon("hint")} Hint</button>
    </div>
    <div class="hint" id="dictHintText" hidden></div>
    <div class="dict-slots" ${chars.length > 1 ? "" : "hidden"}>${chars.map((_, i) => `<button class="dict-slot" type="button" aria-label="Character ${i + 1} of ${chars.length}">${i + 1}</button>`).join("")}</div>
    <div class="dict-boxes stack">${chars.map((_, i) => `<div class="box${i ? "" : " on"}">${gridSVG()}<div class="hw"></div></div>`).join("")}</div>
    <div class="status" id="dictStatus" aria-live="polite">Write the word${audio ? " you hear" : ""}.</div>
    <div class="answer" id="dictAnswer" hidden></div>
    <div class="controls dock">
      <button class="btn" type="button" id="dictShow">Show answer</button>
      <button class="btn primary" type="button" id="dictNext" hidden>Next word</button>
    </div>
  </div>`;
  let hintLevel = 0, mistakes = 0, doneCount = 0, gaveUp = false, finished = false;
  const status = $("#dictStatus");
  // On a phone one big box shows at a time; the squares above it are the word's characters.
  const boxes = $$(".dict-boxes .box", host), slots = $$(".dict-slot", host);
  const written = new Set();
  let active = 0;
  const showBox = (i) => {
    active = i;
    boxes.forEach((b, j) => b.classList.toggle("on", j === i));
    slots.forEach((s, j) => s.setAttribute("aria-pressed", j === i));
  };
  const markSlot = (i) => { if (slots[i]) { slots[i].textContent = chars[i]; slots[i].classList.add("done"); } };
  slots.forEach((s, i) => s.addEventListener("click", () => showBox(i)));
  showBox(0);
  const ws = $$(".dict-boxes .hw", host).map((b, i) => {
    const size = Math.round(b.getBoundingClientRect().width) || 160;
    const w = trackWriter(makeWriter(b, chars[i], size, { showOutline: false, highlightColor: css("--jade") }));
    w.quiz({
      showHintAfterMisses: setting("hintAfter") || false, highlightOnComplete: true,
      onMistake: () => { mistakes++; },
      onComplete: () => {
        doneCount++;
        written.add(i);
        markSlot(i);
        if (doneCount === chars.length) return finish();
        // Move on to the next character still to write, after a moment to see this one finished.
        setTimeout(() => {
          if (finished || active !== i || !host.contains(boxes[i])) return;
          const rest = chars.map((_, j) => j).filter((j) => !written.has(j));
          showBox(rest.find((j) => j > i) ?? rest[0]);
        }, 600);
      },
    });
    return w;
  });
  function finish() {
    if (finished) return;
    finished = true;
    const perfect = !gaveUp && mistakes === 0 && hintLevel === 0;
    if (perfect) dict.perfect++; else dict.missed.push(word.w);
    progress.record("d:" + word.w, { ok: perfect, miss: mistakes + (gaveUp ? 3 : 0) + hintLevel, fix: !gaveUp });
    status.textContent = gaveUp ? "Here's the answer. You'll get it next time!" : perfect ? "太好了! Perfect!" : mistakes ? `很好! Done with ${mistakes} mistake${mistakes > 1 ? "s" : ""}.` : "很好! Done, with a hint.";
    $("#dictAnswer").innerHTML = `<span class="hz">${charLinks(word.w)}</span><span class="py">${tonePy(word.py)}</span><span class="muted">${esc(word.en)}</span>`;
    $("#dictAnswer").hidden = false;
    $("#dictShow").hidden = true;
    $("#dictNext").textContent = dict.pos + 1 >= total ? (dict.then ? "Continue" : "See results") : "Next word";
    revealNext($("#dictNext"));
    if (!audio) autoSay(word.w);
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
    chars.forEach((_, i) => markSlot(i));
    ws.forEach((w) => { w.cancelQuiz(); w.animateCharacter(); });
    finish();
  });
  $("#dictNext").addEventListener("click", () => { dict.pos++; dictWord(); });
  $("#dictStop")?.addEventListener("click", () => { const back = dict.back; dict = null; clearWriters(); back(); });
  if (audio) {
    // Without any sound for this word, dictation still works from meaning + pinyin (and that doesn't count as a hint).
    if (!canSay(word.w)) { showHint(2); hintLevel = 0; }
    if (!redraw) sayLater(word.w);
  }
}

function dictEnd() {
  clearWriters();
  const total = dict.order.length;
  progress.addSession({ type: dict.kind, lesson: dict.lesson ?? app.L()?.n ?? 0, score: dict.perfect, total, missed: dict.missed });
  const { words, missed } = dict, opts = { ...dict };
  if (opts.then) { dict = null; return opts.then({ title: "Writing", right: opts.perfect, total, missed, missedItems: words.filter((w) => missed.includes(w.w)) }); }
  $(hostSel).innerHTML = `<div class="panel">
    <span class="lbl">Results</span>
    <div class="score">${dict.perfect} / ${total} perfect</div>
    ${missed.length ? `<p>Practice these again:</p><div class="result-list">${missed.map((w) => `<span>${w}</span>`).join("")}</div>`
      : `<p>全对！Quán duì! Everything correct!</p>`}
    <div class="controls">
      <button class="btn primary big" type="button" id="dictAgain">${icon("replay")} Again</button>
      ${missed.length ? `<button class="btn big" type="button" id="dictMissed">Retry missed</button>` : ""}
      ${opts.back ? `<button class="btn big" type="button" id="dictBack2">Back</button>` : ""}
    </div>
  </div>`;
  const restart = (ws, title) => dictIntro({ host: hostSel, words: ws, prompt: opts.prompt, kind: opts.kind, back: opts.back, lesson: opts.lesson, title });
  $("#dictAgain").addEventListener("click", () => restart(opts.pick || words, opts.title));
  $("#dictMissed")?.addEventListener("click", () => restart(words.filter((w) => missed.includes(w.w)), "Missed words"));
  $("#dictBack2")?.addEventListener("click", opts.back);
  dict = null;
}

// Re-draw the current word after a resize / rotation (writers have a fixed size).
function dictRedraw() {
  if (dictActive()) dictWord({ redraw: true });
}
