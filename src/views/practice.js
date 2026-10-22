// Practice engine: the exercises behind each lesson's 写 听 说 读 词 tabs and the book Review.
// openPractice(host, skill, ctx) shows a skill's exercises for ctx.words inside `host`.
// Every exercise can also run on its own with fixed items and a `then` callback, so the
// book Review can chain several of them into one mixed session.
import { $, $$, esc, shuffle } from "../lib/util.js";
import { tonePy, stripTone } from "../lib/pinyin.js";
import { say, sayBtns, stopSpeech } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { clearWriters } from "../lib/draw.js";
import { overlap } from "../lib/compare.js";
import { LESSONS, wordsOf, wordChars } from "../data/index.js";
import { textList, textQuiz, orderGame, pinyinQuiz, hideGloss } from "./reading.js";
import * as progress from "../progress/store.js";
import { wordStatus } from "../progress/model.js";
import { dictIntro } from "./dictation.js";
import { cardsOpen } from "./cards.js";
import { tonesIntro } from "./tones.js";

export const SKILLS = {
  write: {
    seal: "写", name: "Write",
    modes: [
      { id: "dict", seal: "听", name: "Dictation", sub: "Hear a word, write it from memory" },
      { id: "pinyin", seal: "拼", name: "From pinyin", sub: "See the pinyin, write the characters" },
      { id: "meaning", seal: "意", name: "From meaning", sub: "See the English, write the Chinese" },
    ],
  },
  listen: {
    seal: "听", name: "Listen",
    modes: [
      { id: "pick-word", seal: "字", name: "Hear & pick the word", sub: "Listen, then choose the characters" },
      { id: "pick-meaning", seal: "意", name: "Hear & pick the meaning", sub: "Listen, then choose the English" },
      { id: "sentence", seal: "句", name: "Sentences", sub: "Listen to a sentence, choose what it means" },
      { id: "tones", seal: "声", name: "Tones", sub: "Hear a syllable, pick its tone" },
    ],
  },
  speak: {
    seal: "说", name: "Speak",
    modes: [
      { id: "say-word", seal: "词", name: "Say the word", sub: "Read the word aloud; the app checks it" },
      { id: "say-sentence", seal: "句", name: "Say the sentence", sub: "Read a whole sentence aloud" },
    ],
  },
  read: {
    seal: "读", name: "Read",
    modes: [
      { id: "texts", seal: "文", name: "Read texts", sub: "Dialogues line by line; tap any word for its meaning" },
      { id: "text-quiz", seal: "问", name: "Read & answer", sub: "Questions about the texts" },
      { id: "order", seal: "组", name: "Build the sentence", sub: "Put the words in the right order" },
      { id: "read-pinyin", seal: "音", name: "How do you read it?", sub: "See the word, pick the right pinyin" },
    ],
  },
  words: {
    seal: "词", name: "Words",
    modes: [
      { id: "cards", seal: "卡", name: "Flashcards", sub: "Flip, then say if you knew it" },
      { id: "match", seal: "配", name: "Match pairs", sub: "Match each word to its meaning" },
      { id: "quiz-meaning", seal: "意", name: "What does it mean?", sub: "See the word, pick the English" },
      { id: "quiz-word", seal: "选", name: "Which word?", sub: "See the English, pick the word" },
      { id: "list", seal: "表", name: "Word list", sub: "All words with pinyin and sound" },
    ],
  },
};

// Current place: where exercises draw (host), which skill, and the words / texts to use.
// ctx: { words, readings, lesson, back }  (back: where "Back" goes; default = this skill's menu)
let P = { host: "#tab-listen", skill: "listen", ctx: { words: [], readings: [] } };
const body = () => $(P.host);
const goBack = () => (P.ctx.back || showMenu)();
const backBtn = (label = "Back") => `<button class="btn ghost" type="button" data-back>${label}</button>`;
const wireBack = (el) => $$("[data-back]", el).forEach((b) => b.addEventListener("click", goBack));
const notEnough = () => { body().innerHTML = `<div class="panel"><p>Not enough words here yet.</p>${backBtn()}</div>`; wireBack(body()); };

export function openPractice(host, skill, ctx) {
  P = { host, skill, ctx };
  showMenu();
}

export function showMenu() {
  clearWriters();
  stopSpeech();
  hideGloss();
  const s = SKILLS[P.skill];
  body().innerHTML = `<div class="mode-grid">${s.modes.map((m) => `<button class="mode-card" type="button" data-mode="${m.id}">
      <span class="seal">${m.seal}</span><b>${m.name}</b><small>${m.sub}</small></button>`).join("")}</div>`;
  $$("[data-mode]", body()).forEach((b) => b.addEventListener("click", () => startMode(b.dataset.mode)));
}

// Run one exercise in a host (used by the Write tab's practice buttons).
export function runMode(host, mode, ctx) {
  P = { host, skill: P.skill, ctx };
  startMode(mode);
}

/* ---------- Exercise builders (also used by the book Review) ---------- */
const reveal = (w) => `<span class="hz">${w.w}</span> <span class="py">${tonePy(w.py)}</span> <span class="muted">${esc(w.en)}</span> ${sayBtns(w.w, w.py, true)}`;

// Four choices for a word: the word and 3 others with a different label.
function wordChoices(w, pool, label) {
  const others = pool.filter((x) => x.w !== w.w && label(x) !== label(w));
  const extra = wordsOf(LESSONS).filter((x) => x.w !== w.w && label(x) !== label(w) && !others.some((o) => o.w === x.w));
  const picks = shuffle(others).concat(shuffle(extra)).slice(0, 3);
  return [w, ...picks].map((o) => ({ html: label(o), correct: o.w === w.w }));
}
const hzLabel = (x) => `<span class="hz">${x.w}</span>`;
const enLabel = (x) => `<span class="en">${esc(x.en)}</span>`;

// Listening: hear a word, pick the word or its meaning. mode: "word" | "meaning" | "mixed"
export function listenQuiz({ items, pool, mode = "mixed", title = "Listening", kind = "listen", then }) {
  const pick = (x) => (mode === "mixed" ? (x.w.charCodeAt(0) + x.w.length) % 2 ? "word" : "meaning" : mode);
  choiceQuiz({ kind, title, items, key: "l:", then,
    ask: (w) => ({ html: `<p class="hint">${pick(w) === "word" ? "Which word do you hear?" : "What does it mean?"}</p>`, say: w.w }),
    makeOptions: (w) => wordChoices(w, pool || items, pick(w) === "word" ? hzLabel : enLabel),
    reveal });
}

// Vocabulary: see the word → pick the meaning, or see the meaning → pick the word.
export function vocabQuiz({ items, pool, mode = "mixed", title = "Vocabulary", kind = "vocab", then }) {
  const pick = (x) => (mode === "mixed" ? (x.w.charCodeAt(0) + x.w.length) % 2 ? "meaning" : "word" : mode);
  choiceQuiz({ kind, title, items, key: "q:", then,
    ask: (w) => ({ html: pick(w) === "meaning" ? `<div class="big-hz">${w.w}</div>` : `<div class="prompt-big">${esc(w.en)}</div>` }),
    makeOptions: (w) => wordChoices(w, pool || items, pick(w) === "meaning" ? enLabel : hzLabel),
    reveal });
}

const sentenceItems = (words) => words.filter((w) => w.ex?.hz);
const lessonSentences = (words, readings) => [
  ...sentenceItems(words).map((w) => ({ hz: w.ex.hz.replace(/[AB]: /g, ""), py: w.ex.py.replace(/[AB]: /g, ""), en: w.ex.en })),
  ...readings.flatMap((r) => r.lines),
].filter((s, i, a) => a.findIndex((x) => x.hz === s.hz) === i);
export { lessonSentences };

function startMode(mode) {
  const { words, readings = [] } = P.ctx;
  const host = P.host, back = goBack, lesson = P.ctx.lesson;
  const ten = (list) => shuffle(list).slice(0, 10);
  scrollTo(0, 0);
  switch (mode) {
    case "dict": return dictIntro({ host, words, prompt: "audio", kind: "dict", back, lesson });
    case "pinyin": return dictIntro({ host, words, prompt: "pinyin", kind: "dict-pinyin", back, lesson });
    case "meaning": return dictIntro({ host, words, prompt: "meaning", kind: "dict-meaning", back, lesson });
    case "pick-word": return words.length < 2 ? notEnough() : listenQuiz({ items: ten(words), pool: words, mode: "word", title: "Hear & pick the word" });
    case "pick-meaning": return words.length < 2 ? notEnough() : listenQuiz({ items: ten(words), pool: words, mode: "meaning", title: "Hear & pick the meaning" });
    case "sentence": {
      const sw = sentenceItems(words);
      if (sw.length < 2) return notEnough();
      return choiceQuiz({ kind: "listen-sentence", title: "Sentences", items: shuffle(sw).slice(0, 8), key: "ls:",
        ask: (w) => ({ html: `<p class="hint">What does this sentence mean?</p>`, say: w.ex.hz }),
        makeOptions: (w) => [w, ...shuffle(sw.filter((x) => x.ex.en !== w.ex.en)).slice(0, 3)].map((o) => ({ html: `<span class="en">${esc(o.ex.en)}</span>`, correct: o === w })),
        reveal: (w) => `<span class="hz" style="font-size:1.3rem">${w.ex.hz}</span> ${sayBtns(w.ex.hz, "sentence", true)}<br><span class="py">${tonePy(w.ex.py)}</span>` });
    }
    case "tones": return tonesIntro({ host, words, label: "Characters from this lesson", lesson, back });
    case "say-word": return speak({ title: "Say the word", items: ten(words).map((w) => ({ w, text: w.w, py: w.py, en: w.en })) });
    case "say-sentence": return speak({ title: "Say the sentence", items: ten(sentenceItems(words)).map((w) => ({ w, text: w.ex.hz.replace(/[AB]: /g, ""), py: w.ex.py.replace(/[AB]: /g, ""), en: w.ex.en, sentence: true })) });
    case "cards": return cardsOpen({ host, words, lesson, back });
    case "match": return matchGame(words);
    case "quiz-meaning": return words.length < 2 ? notEnough() : vocabQuiz({ items: ten(words), pool: words, mode: "meaning", title: "What does it mean?" });
    case "quiz-word": return words.length < 2 ? notEnough() : vocabQuiz({ items: ten(words), pool: words, mode: "word", title: "Which word?" });
    case "list": return wordList(words);
    case "texts": return textList(ui, readings);
    case "text-quiz": return textQuiz(ui, readings);
    case "order": return orderGame(ui, lessonSentences(words, readings));
    case "read-pinyin": return pinyinQuiz(ui, words);
  }
}

// What the reading screens need from this module.
export const ui = { body: () => body(), backBtn: (l) => backBtn(l), wireBack: (el) => wireBack(el), choiceQuiz: (cfg) => choiceQuiz(cfg) };
export const setHost = (host, ctx) => { P = { ...P, host, ctx: { ...P.ctx, ...ctx } }; };

/* ---------- Multiple choice ---------- */
// cfg: { items (or words + count), makeOptions(w) → [{html, correct}], ask(w) → {html, say?},
//        reveal(w), key, id?(w), label?(w), title, kind, silent?, back?, onDone?, then? }
export function choiceQuiz(cfg) {
  const items = cfg.items || shuffle(cfg.words).slice(0, cfg.count || 10);
  const leave = cfg.back || goBack;
  const wire = (el) => $$("[data-back]", el).forEach((b) => b.addEventListener("click", leave));
  if (!items.length) return notEnough();
  let pos = 0, right = 0;
  const missed = [];
  function ask() {
    if (pos >= items.length) return end();
    const w = items[pos];
    const q = cfg.ask(w);
    const opts = shuffle(cfg.makeOptions(w));
    body().innerHTML = `<div class="panel">
      <span class="lbl">${cfg.title}</span>
      <div class="progress">Question ${pos + 1} of ${items.length} · ${right} right</div>
      <div class="bar"><i style="width:${(pos / items.length) * 100}%"></i></div>
      ${q.html}
      ${q.say ? `<div class="controls"><button class="btn primary big" type="button" data-say="${esc(q.say)}" id="qListen">${icon("speaker")} Listen</button>
        <button class="btn big" type="button" data-say="${esc(q.say)}" data-slow>${icon("slow")} Slow</button></div>` : ""}
      <div class="choices">${opts.map((o, i) => `<button class="choice" type="button" data-i="${i}">${o.html}</button>`).join("")}</div>
      <div class="status" id="qStatus" aria-live="polite"></div>
      <div class="answer" id="qAnswer" hidden></div>
      <div class="controls"><button class="btn primary" type="button" id="qNext" hidden>${pos + 1 >= items.length ? (cfg.then ? "Continue" : "See results") : "Next"}</button>${backBtn(cfg.then ? "Stop" : "Back")}</div>
    </div>`;
    wire(body());
    $$(".choice", body()).forEach((b) => b.addEventListener("click", () => {
      const ok = opts[+b.dataset.i].correct;
      $$(".choice", body()).forEach((c) => {
        c.disabled = true;
        if (opts[+c.dataset.i].correct) c.classList.add("right");
        else if (c === b) c.classList.add("wrong");
      });
      progress.record(cfg.key + (cfg.id ? cfg.id(w) : w.w), { ok, miss: ok ? 0 : 1 });
      if (ok) right++; else missed.push(cfg.label ? cfg.label(w) : w.w);
      const st = $("#qStatus");
      st.style.color = ok ? "" : "var(--cinnabar)";
      st.textContent = ok ? "对了！Correct!" : "Not quite.";
      $("#qAnswer").innerHTML = cfg.reveal(w);
      $("#qAnswer").hidden = false;
      $("#qNext").hidden = false;
      $("#qNext").focus({ preventScroll: true });
      if (!q.say && !cfg.silent) say(w.w);
    }));
    $("#qNext").addEventListener("click", () => { pos++; ask(); });
    if (q.say) setTimeout(() => say(q.say), 250);
  }
  function end() {
    progress.addSession({ type: cfg.kind, lesson: P.ctx.lesson ?? 0, score: right, total: items.length, missed });
    cfg.onDone?.(right, items.length);
    if (cfg.then) return cfg.then({ title: cfg.title, right, total: items.length, missed });
    showResults(cfg.title, right, items.length, missed, () => choiceQuiz(cfg), "全对！Quán duì! Everything correct!");
  }
  ask();
}

// Shared results screen.
export function showResults(title, right, total, missed, again, perfect = "全对！Quán duì!") {
  body().innerHTML = `<div class="panel">
    <span class="lbl">Results · ${esc(title)}</span>
    <div class="score">${right} / ${total}</div>
    ${missed.length ? `<p>Practice these again:</p><div class="result-list">${missed.map((w) => `<span>${esc(w)}</span>`).join("")}</div>` : `<p>${perfect}</p>`}
    <div class="controls">${again ? `<button class="btn primary big" type="button" id="resAgain">${icon("replay")} Again</button>` : ""}${backBtn()}</div>
  </div>`;
  wireBack(body());
  $("#resAgain")?.addEventListener("click", again);
}

/* ---------- Match pairs ---------- */
function matchGame(words) {
  const set = shuffle(words).slice(0, 6);
  if (set.length < 2) return notEnough();
  const tiles = shuffle([...set.map((w) => ({ w, side: "hz" })), ...set.map((w) => ({ w, side: "en" }))]);
  let sel = null, done = 0, errors = 0;
  const firstTry = new Set(set.map((w) => w.w));
  const t0 = Date.now();
  body().innerHTML = `<div class="panel">
    <span class="lbl">配对 · Match pairs</span>
    <p>Tap a word, then its meaning.</p>
    <div class="match-grid">${tiles.map((t, i) => `<button class="tile ${t.side}" type="button" data-i="${i}">${t.side === "hz" ? t.w.w : esc(t.w.en)}</button>`).join("")}</div>
    <div class="status" id="mStatus" aria-live="polite"></div>
    <div class="controls" id="mEnd">${backBtn()}</div>
  </div>`;
  wireBack(body());
  $$(".tile", body()).forEach((b) => b.addEventListener("click", () => {
    const t = tiles[+b.dataset.i];
    if (!sel) { sel = { t, b }; b.classList.add("sel"); if (t.side === "hz") say(t.w.w); return; }
    if (sel.b === b) { b.classList.remove("sel"); sel = null; return; }
    const a = sel; sel = null;
    a.b.classList.remove("sel");
    if (a.t.w === t.w && a.t.side !== t.side) {
      a.b.classList.add("done"); b.classList.add("done");
      progress.record("q:" + t.w.w, { ok: firstTry.has(t.w.w), miss: firstTry.has(t.w.w) ? 0 : 1 });
      say(t.w.w);
      if (++done === set.length) {
        const secs = Math.round((Date.now() - t0) / 1000);
        progress.addSession({ type: "match", lesson: P.ctx.lesson ?? 0, score: firstTry.size, total: set.length, missed: set.filter((w) => !firstTry.has(w.w)).map((w) => w.w) });
        $("#mStatus").textContent = `全部配对！All matched in ${secs} s${errors ? ` with ${errors} mistake${errors > 1 ? "s" : ""}` : ", no mistakes"}.`;
        $("#mEnd").innerHTML = `<button class="btn primary big" type="button" id="mAgain">${icon("replay")} New round</button>${backBtn()}`;
        wireBack(body());
        $("#mAgain").addEventListener("click", () => matchGame(words));
      }
    } else {
      errors++;
      firstTry.delete(a.t.w.w); firstTry.delete(t.w.w);
      [a.b, b].forEach((x) => { x.classList.add("bad"); setTimeout(() => x.classList.remove("bad"), 400); });
    }
  }));
}

/* ---------- Speaking ---------- */
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// items: [{ w, text, py, en, sentence? }]
export function speak({ title, items, then }) {
  if (!items.length) return notEnough();
  let pos = 0, right = 0, useRecorder = !Recognition;
  const missed = [];
  function show() {
    if (pos >= items.length) return end();
    const it = items[pos];
    body().innerHTML = `<div class="panel">
      <span class="lbl">说 · ${title}</span>
      <div class="progress">${pos + 1} of ${items.length} · ${right} correct</div>
      <div class="bar"><i style="width:${(pos / items.length) * 100}%"></i></div>
      <div class="speak-card">
        <div class="${it.sentence ? "prompt-big" : "big-hz"}" style="font-family:var(--display)">${it.text}</div>
        <div class="py">${tonePy(it.py)}</div>
        <div class="muted">${esc(it.en)}</div>
        <div class="controls" style="justify-content:center">${sayBtns(it.text, it.py)}</div>
        <button class="mic" type="button" id="micBtn" aria-label="Speak">${icon("mic")}</button>
        <div class="note" id="micNote">${useRecorder ? "Tap to record yourself, tap again to stop." : "Tap the microphone and say it."}</div>
        <div class="heard" id="heard" aria-live="polite"></div>
        <div class="controls" id="judge" style="justify-content:center"></div>
      </div>
      <div class="controls"><button class="btn primary" type="button" id="sNext" hidden>${pos + 1 >= items.length ? (then ? "Continue" : "See results") : "Next"}</button>
        <button class="btn ghost" type="button" id="sSkip">Skip</button>${backBtn(then ? "Stop" : "Back")}</div>
    </div>`;
    wireBack(body());
    $("#micBtn").addEventListener("click", () => (useRecorder ? recordToggle(it) : listen(it)));
    $("#sNext").addEventListener("click", () => { pos++; show(); });
    $("#sSkip").addEventListener("click", () => { pos++; show(); });
  }
  function result(it, ok, msg) {
    progress.record("s:" + it.w.w + (it.sentence ? "#ex" : ""), { ok, miss: ok ? 0 : 1 });
    if (ok) right++; else missed.push(it.text);
    $("#heard").innerHTML = msg;
    $("#judge").innerHTML = "";
    $("#sNext").hidden = false;
    $("#sSkip").hidden = true;
  }
  function listen(it) {
    const mic = $("#micBtn");
    const rec = new Recognition();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    mic.classList.add("on");
    $("#micNote").textContent = "Listening… say it now.";
    let got = false;
    rec.onresult = (e) => {
      got = true;
      const alts = [...e.results[0]].map((a) => a.transcript);
      const best = alts.reduce((b, t) => (overlap(it.text, t) > overlap(it.text, b) ? t : b), alts[0] || "");
      const score = overlap(it.text, best);
      const need = it.sentence ? 0.8 : 1;
      if (score >= need) result(it, true, `<span class="ok-c">${icon("check")} 很好！</span> I heard <span class="hz">${esc(best)}</span>`);
      else {
        $("#heard").innerHTML = `I heard <span class="hz">${esc(best) || "nothing clear"}</span>. ${score >= 0.5 ? "Close! " : ""}Try again, or listen to the model first.`;
        $("#judge").innerHTML = `<button class="btn" type="button" id="giveUp">Mark as not yet</button>`;
        $("#giveUp").addEventListener("click", () => result(it, false, `Keep practicing <span class="hz">${it.text}</span>.`));
      }
    };
    rec.onerror = (e) => {
      mic.classList.remove("on");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        $("#micNote").textContent = e.error === "not-allowed"
          ? "Microphone blocked. Allow it in your browser settings, or use record-and-compare instead."
          : "Speech checking isn't available here. Switched to record-and-compare.";
        useRecorder = true;
      } else if (e.error === "network") {
        $("#micNote").textContent = "Speech checking needs internet. Switched to record-and-compare.";
        useRecorder = true;
      } else if (e.error === "no-speech") $("#micNote").textContent = "I didn't hear anything. Tap and try again.";
      else $("#micNote").textContent = `Couldn't listen (${e.error}). Tap to try again.`;
    };
    rec.onend = () => { mic.classList.remove("on"); if (got) $("#micNote").textContent = "Tap the microphone to try again."; };
    try { stopSpeech(); rec.start(); } catch { mic.classList.remove("on"); }
  }
  // Fallback without speech recognition: record, play it back next to the model, judge yourself.
  let media = null;
  async function recordToggle(it) {
    const mic = $("#micBtn");
    if (media?.state === "recording") { media.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      media = new MediaRecorder(stream);
      media.ondataavailable = (e) => chunks.push(e.data);
      media.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mic.classList.remove("on");
        const url = URL.createObjectURL(new Blob(chunks, { type: media.mimeType }));
        $("#micNote").textContent = "Compare your voice with the model, then judge:";
        $("#heard").innerHTML = `<audio controls src="${url}" style="width:min(100%,320px)"></audio>`;
        $("#judge").innerHTML = `<button class="btn" type="button" id="jNo">Not yet</button><button class="btn primary" type="button" id="jYes">${icon("check")} Sounded right</button>`;
        $("#jYes").addEventListener("click", () => result(it, true, `<span class="ok-c">很好！</span>`));
        $("#jNo").addEventListener("click", () => result(it, false, `Keep practicing <span class="hz">${it.text}</span>.`));
      };
      media.start();
      mic.classList.add("on");
      $("#micNote").textContent = "Recording… tap again to stop.";
      setTimeout(() => { if (media?.state === "recording") media.stop(); }, it.sentence ? 8000 : 4000);
    } catch {
      $("#micNote").textContent = "Microphone not available. Allow microphone access for this app in Settings.";
    }
  }
  function end() {
    progress.addSession({ type: "speak", lesson: P.ctx.lesson ?? 0, score: right, total: items.length, missed });
    if (then) return then({ title, right, total: items.length, missed });
    showResults(title, right, items.length, missed, () => speak({ title, items }), "说得很好！Shuō de hěn hǎo!");
  }
  show();
}

/* ---------- Word list ---------- */
function wordList(words) {
  body().innerHTML = `<div class="panel">
    <span class="lbl">词表 · Word list</span>
    <input class="search" id="wlSearch" type="search" placeholder="Search 汉字, pinyin or English" autocomplete="off">
    <table class="word-table"><tbody id="wlRows"></tbody></table>
    ${backBtn()}
  </div>`;
  wireBack(body());
  const rows = $("#wlRows");
  const dot = (w) => {
    const st = wordStatus({ word: w.w, list: wordChars(w) }, progress.get);
    return st === "new" ? "" : `<span style="color:var(--${st === "known" ? "jade" : "amber"})">●</span>`;
  };
  const render = (q = "") => {
    const t = stripTone(q.trim().toLowerCase());
    const list = words.filter((w) => !t || w.w.includes(q.trim()) || stripTone(w.py.toLowerCase()).replace(/\s/g, "").includes(t.replace(/\s/g, "")) || w.en.toLowerCase().includes(t));
    rows.innerHTML = list.map((w) => `<tr><td class="hz">${w.w} ${dot(w)}</td><td><span class="py">${tonePy(w.py)}</span><br><span class="en">${esc(w.en)}</span></td><td style="text-align:right;white-space:nowrap">${sayBtns(w.w, w.py, true)}</td></tr>`).join("")
      || `<tr><td class="muted">No words match.</td></tr>`;
  };
  $("#wlSearch").addEventListener("input", (e) => render(e.target.value));
  render();
}
