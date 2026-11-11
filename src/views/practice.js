// Practice engine: the exercises behind each lesson's 写 听 说 读 词 练 tabs and the book Review.
// openPractice(host, skill, ctx) shows a skill's exercises for ctx.words inside `host`.
// Every exercise can also run on its own with fixed items and a `then` callback, so the
// book Review can chain several of them into one mixed session.
import { $, $$, esc, shuffle, directionPicker, revealNext } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { quizHead, wirePinyin } from "../lib/qpinyin.js";
import { matchesWord } from "../lib/search.js";
import { say, autoSay, sayLater, sayBtns, stopSpeech } from "../lib/speech.js";
import { sfx } from "../lib/sfx.js";
import { icon } from "../lib/icons.js";
import { clearWriters } from "../lib/draw.js";
import { overlap } from "../lib/compare.js";
import { LESSONS, wordsOf, wordChars, grammarOf } from "../data/index.js";
import { textList, textQuiz, orderGame, pinyinQuiz, hideGloss } from "./reading.js";
import * as progress from "../progress/store.js";
import { wordStatus } from "../progress/model.js";
import { dictIntro } from "./dictation.js";
import { charLinks } from "./charsheet.js";
import { cardsOpen } from "./cards.js";
import { tonesIntro } from "./tones.js";
import { lessonContent } from "../sync/content.js";
import { showWhy } from "../lib/explain.js";
import { keyOf } from "../lib/explain-key.js";
import { workbookOf, workbookQuiz, fillQuiz, radicalQuiz } from "./workbook.js";
import { hanziLesson, pronTips } from "./hanzi.js";
import { noteHtml } from "./lessonmeter.js";
import { pickRound, openFirst } from "../lib/round.js";

// A lesson round: only what is not done yet while there is any (see lib/round.js).
const round = (list, itemOf, n) => pickRound(list, itemOf, progress.get, n);
const wordItem = (w) => ["f:" + w.w, "q:" + w.w]; // Flashcards, Match and Word quiz count together

// Modes that only exist when the lesson has that content.
export const modeAvailable = (id, L) =>
  id.startsWith("wb-") ? workbookOf(L ? [L] : []).some((d) => "wb-" + d.kind === id)
  : id === "gr-fill" ? grammarOf(L ? [L] : []).length > 0
  : id === "hanzi" ? !!L?.hanzi : id === "pron" ? !!L?.pron?.length : true;

export const SKILLS = {
  write: {
    seal: "写", name: "Write",
    modes: [
      { id: "dict", seal: "听", name: "Dictation", sub: "Hear a word, write it from memory" },
      { id: "pinyin", seal: "拼", name: "From pinyin", sub: "See the pinyin, write the characters" },
      { id: "meaning", seal: "意", name: "From meaning", sub: "See the English, write the Chinese" },
      { id: "hanzi", seal: "汉", name: "Character lesson", sub: "Strokes, radicals and where characters come from" },
    ],
  },
  listen: {
    seal: "听", name: "Listen",
    modes: [
      { id: "hear", seal: "听", name: "Hear the word", sub: "Listen, then pick the word or its meaning" },
      { id: "sentence", seal: "句", name: "Sentences", sub: "Listen to a sentence, choose what it means" },
      { id: "tones", seal: "声", name: "Tones", sub: "Hear a syllable, pick its tone" },
      { id: "pron", seal: "音", name: "Pronunciation tips", sub: "Tone changes and sound rules, with examples" },
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
      { id: "grammar", seal: "法", name: "Grammar", sub: "This lesson's grammar points with examples" },
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
      { id: "word-quiz", seal: "选", name: "Word quiz", sub: "See a word or its meaning, pick the match" },
      { id: "radical", seal: "部", name: "Which radical?", sub: "Find the radical (部首) in each character" },
      { id: "list", seal: "表", name: "Word list", sub: "All words with pinyin and sound" },
    ],
  },
  exercises: {
    seal: "练", name: "Exercises",
    modes: [
      { id: "gr-fill", seal: "法", name: "Grammar", sub: "Fill the blank in this lesson's grammar points" },
      { id: "wb-dialog", seal: "对", name: "Dialogues", sub: "Hear a short dialogue, answer the question" },
      { id: "wb-judge", seal: "判", name: "True or false", sub: "Does the ★ sentence match the text?" },
      { id: "wb-reply", seal: "答", name: "Pick the reply", sub: "Choose the right answer to each sentence" },
      { id: "fill", seal: "填", name: "Fill in the word", sub: "Choose the word that completes the sentence" },
    ],
  },
};

// Current place: where exercises draw (host), which skill, and the words / texts to use.
// ctx: { words, readings, lesson, back }  (back: where "Back" goes; default = this skill's menu)
let P = { host: "#tab-listen", skill: "listen", ctx: { words: [], readings: [] } };
const body = () => $(P.host);
const goBack = () => (P.ctx.back || showMenu)();
const backBtn = (label = "Back") => `<button class="btn ghost leave" type="button" data-back>${label}</button>`;
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
  // Workbook exercises only where the lesson has them.
  const inLesson = String(P.host).startsWith("#tab-") && !!thisLesson(); // only there: how much of each exercise is left
  body().innerHTML = `<div class="mode-grid">${s.modes.filter((m) => modeAvailable(m.id, thisLesson())).map((m) => `<button class="mode-card" type="button" data-mode="${m.id}">
      <span class="seal" aria-hidden="true">${m.seal}</span><b>${m.name}</b><small>${m.sub}</small>${inLesson ? noteHtml(P.skill, m.id) : ""}</button>`).join("")}</div>`;
  $$("[data-mode]", body()).forEach((b) => b.addEventListener("click", () => startMode(b.dataset.mode)));
}

// Run one exercise in a host (used by the Write tab's practice buttons).
export function runMode(host, mode, ctx) {
  P = { host, skill: P.skill, ctx };
  startMode(mode);
}

/* ---------- Exercise builders (also used by the book Review) ---------- */
const reveal = (w) => `<span class="hz">${w.w}</span> <span class="py c-py">${tonePy(w.py)}</span> <span class="muted">${esc(w.en)}</span> ${sayBtns(w.w, w.py, true)}`;

// Four choices for a word: the word and 3 others with a different label.
function wordChoices(w, pool, label) {
  const en = (x) => (x.en || "").replace(/\s+/g, " ").trim().toLowerCase();
  const ok = (x) => x.w !== w.w && label(x) !== label(w) && en(x) !== en(w);
  const others = pool.filter(ok);
  const extra = wordsOf(LESSONS).filter((x) => ok(x) && !others.some((o) => o.w === x.w));
  // Two wrong choices must not look the same (杯子 and 杯 are both "cup; glass").
  const seen = new Set(), picks = [];
  for (const o of shuffle(others).concat(shuffle(extra))) {
    const k = label === enLabel ? en(o) : o.w;
    if (seen.has(k)) continue;
    seen.add(k); picks.push(o);
    if (picks.length === 3) break;
  }
  return [w, ...picks].map((o) => ({ html: label(o), correct: o.w === w.w, note: wordNote(o) }));
}
// What a wrongly chosen word is: shown under the answer, so a mistake teaches that word too.
export const wordNote = (o) => `<span class="hz">${esc(o.w)}</span> <span class="py">${tonePy(o.py || "")}</span> ${esc(o.en || "")}`;
const hzLabel = (x) => `<span class="hz">${x.w}</span>`;
const enLabel = (x) => `<span class="en">${esc(x.en)}</span>`;

// Listening: hear a word, pick the word or its meaning. mode: "word" | "meaning" | "mixed"
export function listenQuiz({ items, pool, mode = "mixed", title = "Listening", kind = "listen", then }) {
  const pick = directionPicker(mode, "word", "meaning");
  choiceQuiz({ kind, title, items, key: "l:", then,
    ask: (w) => ({ html: `<p class="hint">${pick(w) === "word" ? "Which word do you hear?" : "What does it mean?"}</p>`, say: w.w }),
    makeOptions: (w) => wordChoices(w, pool || items, pick(w) === "word" ? hzLabel : enLabel),
    reveal });
}

// Vocabulary: see the word → pick the meaning, or see the meaning → pick the word.
export function vocabQuiz({ items, pool, mode = "mixed", title = "Vocabulary", kind = "vocab", then }) {
  const pick = directionPicker(mode, "word", "meaning");
  choiceQuiz({ kind, title, items, key: "q:", then,
    ask: (w) => ({ html: pick(w) === "meaning" ? `<div class="big-hz">${w.w}</div>` : `<div class="prompt-big">${esc(w.en)}</div>` }),
    makeOptions: (w) => wordChoices(w, pool || items, pick(w) === "meaning" ? enLabel : hzLabel),
    reveal });
}

const sentenceItems = (words) => words.filter((w) => w.ex?.hz);
// Two words can share one example sentence; the Sentences quiz asks it once (as the first word).
export const uniqueSentences = (words) => sentenceItems(words).filter((w, i, a) => a.findIndex((x) => x.ex.hz === w.ex.hz) === i);
const lessonSentences = (words, readings) => [
  ...sentenceItems(words).map((w) => ({ hz: w.ex.hz.replace(/[AB]: /g, ""), py: w.ex.py.replace(/[AB]: /g, ""), en: w.ex.en })),
  ...readings.flatMap((r) => r.lines),
].filter((s, i, a) => a.findIndex((x) => x.hz === s.hz) === i);
export { lessonSentences };

const thisLesson = () => LESSONS.find((l) => l.book === P.ctx.book && l.n === P.ctx.lesson);

// "What's next": the next exercise of this tab, or the next tab, so a finished exercise leads somewhere.
// Only inside a lesson (not in the book Review, which chains its own exercises).
export function nextStep() {
  if (!P.ctx.book || !P.ctx.lesson || !P.mode || !String(P.host).startsWith("#tab-")) return null;
  const modes = SKILLS[P.skill].modes.filter((m) => modeAvailable(m.id, thisLesson()));
  const next = modes[modes.findIndex((m) => m.id === P.mode) + 1];
  if (next) return { label: next.name, go: () => startMode(next.id) };
  const tabs = $$("[data-tab]").map((b) => b.dataset.tab);
  const nt = tabs[tabs.indexOf(P.skill) + 1];
  const btn = nt && $('[data-tab="' + nt + '"]');
  return btn ? { label: SKILLS[nt] ? `${SKILLS[nt].seal} ${SKILLS[nt].name}` : btn.textContent.trim(), go: () => btn.click() } : null;
}
export const nextHtml = (id = "resNext") => { const n = nextStep(); return n ? '<button class="btn primary big" type="button" id="' + id + '">Next: ' + esc(n.label) + "</button>" : ""; };
export const wireNext = (root, id = "resNext") => { const n = nextStep(); $("#" + id, root)?.addEventListener("click", () => n?.go()); };

function startMode(mode) {
  P.mode = mode;
  const { words, readings = [] } = P.ctx;
  const host = P.host, back = goBack, lesson = P.ctx.lesson;
  // Rounds are functions, so "Again" picks a new round from what is still open.
  const ten = (prefix, list = words, suffix = "") => () => round(list, (w) => prefix + w.w + suffix, 10);
  const dictWords = () => round(words, (w) => "d:" + w.w);
  scrollTo(0, 0);
  switch (mode) {
    case "dict": return dictIntro({ host, words: dictWords, prompt: "audio", kind: "dict", back, lesson });
    case "pinyin": return dictIntro({ host, words: dictWords, prompt: "pinyin", kind: "dict-pinyin", back, lesson });
    case "meaning": return dictIntro({ host, words: dictWords, prompt: "meaning", kind: "dict-meaning", back, lesson });
    case "hear": return words.length < 2 ? notEnough() : listenQuiz({ items: ten("l:"), pool: words, mode: "mixed", title: "Hear the word" });
    case "sentence": {
      const sw = uniqueSentences(words);
      if (sw.length < 2) return notEnough();
      return choiceQuiz({ kind: "listen-sentence", title: "Sentences", items: () => round(sw, (w) => "ls:" + w.w, 8), key: "ls:",
        ask: (w) => ({ html: `<p class="hint">What does this sentence mean?</p>`, say: w.ex.hz }),
        makeOptions: (w) => [w, ...shuffle(sw.filter((x) => x.ex.en !== w.ex.en)).slice(0, 3)].map((o) => ({ html: `<span class="en">${esc(o.ex.en)}</span>`, correct: o === w, note: `<span class="hz">${esc(o.ex.hz)}</span> <span class="py">${tonePy(o.ex.py)}</span>` })),
        reveal: (w) => `<span class="hz" style="font-size:1.3rem">${w.ex.hz}</span> ${sayBtns(w.ex.hz, "sentence", true)}<span class="py c-py">${tonePy(w.ex.py)}</span>` });
    }
    case "tones": return tonesIntro({ host, words, label: "Characters from this lesson", lesson, back });
    case "say-word": return speak({ title: "Say the word", items: () => ten("s:")().map((w) => ({ w, text: w.w, py: w.py, en: w.en })) });
    case "say-sentence": return speak({ title: "Say the sentence", items: () => ten("s:", sentenceItems(words), "#ex")().map((w) => ({ w, text: w.ex.hz.replace(/[AB]: /g, ""), py: w.ex.py.replace(/[AB]: /g, ""), en: w.ex.en, sentence: true })) });
    case "cards": return cardsOpen({ host, words: () => round(words, wordItem), lesson, back, next: nextStep });
    case "match": return matchGame(words);
    case "word-quiz": return words.length < 2 ? notEnough() : vocabQuiz({ items: () => round(words, wordItem, 10), pool: words, mode: "mixed", title: "Word quiz" });
    case "list": return wordList(words);
    case "texts": return bookTexts(readings);
    case "grammar": return grammarNotes();
    case "gr-fill": return grammarQuiz({ items: grammarRound(grammarOf(thisLesson() ? [thisLesson()] : [])), title: "Grammar · fill the blank" });
    case "text-quiz": return textQuiz(ui, readings);
    case "order": return orderGame(ui, lessonSentences(words, readings));
    case "read-pinyin": return pinyinQuiz(ui, words);
    case "wb-dialog": case "wb-judge": case "wb-reply": {
      const kind = { "wb-dialog": "dialog", "wb-judge": "judge", "wb-reply": "reply" }[mode];
      const items = workbookOf(thisLesson() ? [thisLesson()] : []).filter((d) => d.kind === kind);
      return items.length ? workbookQuiz(ui, { items: () => round(items, (d) => "wb:" + d.id), title: SKILLS[P.skill].modes.find((m) => m.id === mode).name, kind: mode }) : notEnough();
    }
    case "fill": return words.filter((w) => w.ex?.hz?.includes(w.w)).length < 2 ? notEnough() : fillQuiz(ui, words);
    case "radical": return thisLesson() ? radicalQuiz(ui, thisLesson()) : notEnough();
    case "hanzi": return thisLesson()?.hanzi ? hanziLesson(ui, thisLesson(), { onRadicals: () => radicalQuiz(ui, thisLesson()) }) : notEnough();
    case "pron": return thisLesson()?.pron ? pronTips(ui, thisLesson()) : notEnough();
  }
}

/* ---------- The printed book's texts and grammar (private, after sign-in) ---------- */
function withBook(show) {
  const { book, lesson } = P.ctx;
  const empty = { status: "none", texts: [], notes: [] };
  if (!book || !lesson) return show(empty);
  const host = body();
  host.innerHTML = `<div class="panel"><p class="muted">Loading the book…</p></div>`;
  lessonContent(book, lesson).then((b) => { if (body() === host) show(b); }, () => show(empty));
}
// The app's own practice texts show at once; the book's texts join the list when they arrive.
function bookTexts(readings) {
  const { book, lesson } = P.ctx;
  const slot = (inner) => `<div data-texts-note>${inner}</div>`;
  if (!book || !lesson) return textList(ui, readings);
  const show = (note, list) => {
    textList(ui, list, slot(note));
    $("#txRetry")?.addEventListener("click", () => bookTexts(readings));
  };
  show(`<p class="muted">Loading the book's texts…</p>`, readings);
  lessonContent(book, lesson).then((b) => {
    if (!$("[data-texts-note]", body())) return; // already left this screen
    const retry = b.status === "error" ? `<p class="note">Couldn't load the book's texts. Check your internet or VPN. <button class="btn ghost" type="button" id="txRetry">Try again</button></p>` : bookNote(b);
    show(retry, [...b.texts, ...readings]);
  });
}
const bookNote = (b) =>
  b.status === "signed-out" ? `<p class="note">Sign in (Sync, on the home screen) to see this lesson's texts and grammar from the book.</p>`
  : b.status === "error" ? `<p class="note">Couldn't load the book's texts. Check your internet or VPN.</p>` : "";

// The practice questions show at once; the book's notes fill in below them when they arrive.
function grammarNotes() {
  const L = thisLesson();
  const drills = L ? grammarOf([L]) : [];
  const points = L?.grammar || [];
  body().innerHTML = `<div class="panel gr">
    <span class="lbl">语法 · Grammar</span>
    ${points.length ? `<section class="gr-note">
      <h3>Practice</h3>
      <ul>${points.map((g) => `<li><b>${esc(g.point)}</b> <span class="muted">${esc(g.en)}</span></li>`).join("")}</ul>
      <div class="controls"><button class="btn primary" type="button" id="grGo">${icon("play")} Fill the blanks · ${grammarRound(drills)().length} questions</button></div>
    </section>` : ""}
    <div id="grBook"><p class="muted">Loading the book's notes…</p></div>
    ${backBtn()}
  </div>`;
  wireBack(body());
  $("#grGo")?.addEventListener("click", () => grammarQuiz({ items: grammarRound(drills), title: "Grammar · fill the blank" }));
  const slot = $("#grBook");
  const fill = (b) => {
    if (!slot.isConnected) return; // already moved on, for example into the questions
    const notes = b.notes || [];
    slot.innerHTML = notes.length ? notes.map((x, i) => `<section class="gr-note">
      <h3><span class="gr-n">${i + 1}</span> ${esc(x.cn)}</h3>
      <p>${esc(x.en)}</p>
      <ul>${(x.examples || []).map((e) => `<li><span class="hz">${charLinks(e)}</span> ${sayBtns(e, "example", true)}</li>`).join("")}</ul>
    </section>`).join("") : bookNote(b) || (points.length ? "" : `<p>No grammar notes for this lesson yet.</p>`);
  };
  lessonContent(P.ctx.book, P.ctx.lesson).then(fill, () => fill({ status: "error" }));
}

// The lesson's grammar drills still open (all of them once every one is done).
const grammarRound = (drills) => () => round(drills, (d) => "g:" + d.id);

// Fill the blank: choose the word that completes the sentence. Results are saved as g:<drill id>.
export function grammarQuiz(cfg) {
  const blank = (q, fill) => esc(q).replace("___", fill ? `<u class="gr-fill">${esc(fill)}</u>` : `<span class="gr-blank">？</span>`);
  return choiceQuiz({ kind: "grammar", key: "g:", id: (d) => d.id, label: (d) => d.q.replace("___", d.options[d.answer]), ...cfg,
    ask: (d) => ({ html: `<p class="hint">${esc(d.point)}</p><p class="hz gr-q" data-en-done="1">${blank(d.q)}</p><p class="muted q-en">${esc(d.en)}</p>` }),
    explain: keyOf.grammar,
    makeOptions: (d) => d.options.map((o, i) => ({ t: o, html: `<span class="hz" style="font-size:1.3rem">${esc(o)}</span>`, correct: i === d.answer })),
    reveal: (d) => { const s = d.q.replace("___", d.options[d.answer]); return `<span class="hz" style="font-size:1.3rem">${blank(d.q, d.options[d.answer])}</span> ${sayBtns(s, "sentence", true)}<br><span class="muted">${esc(d.rule)}</span>`; },
  });
}

// What the reading screens need from this module.
export const ui = { nextHtml, wireNext, wordNote, body: () => body(), backBtn: (l) => backBtn(l), wireBack: (el) => wireBack(el), choiceQuiz: (cfg) => choiceQuiz(cfg) };
export const setHost = (host, ctx) => { P = { ...P, host, ctx: { ...P.ctx, ...ctx } }; };

/* ---------- Multiple choice ---------- */
// cfg: { items (a list, or a function that picks one: "Again" then picks anew; or words + count),
//        makeOptions(w) → [{html, correct}], ask(w) → {html, say?},
//        reveal(w), key, id?(w), label?(w), title, kind, silent?, back?, onDone?, then?,
//        explain?(w) → key in explain.gen.json (options then carry `t`, their text, to explain a wrong choice)
//        why?(w) → html, a reason made from the data. An option's `note` (html) says what that wrong choice is. }
export function choiceQuiz(cfg) {
  const items = typeof cfg.items === "function" ? cfg.items() : cfg.items || shuffle(cfg.words).slice(0, cfg.count || 10);
  const leave = cfg.back || goBack;
  const wire = (el) => $$("[data-back]", el).forEach((b) => b.addEventListener("click", leave));
  if (!items.length) return notEnough();
  let pos = 0, right = 0;
  const missed = [], missedItems = [];
  function ask() {
    if (pos >= items.length) return end();
    const w = items[pos];
    const q = cfg.ask(w);
    const opts = shuffle(cfg.makeOptions(w));
    if (!pos) scrollTo(0, 0);
    body().innerHTML = `<div class="panel focus">
      ${quizHead({ title: cfg.title, pos, total: items.length, toggles: !cfg.noPinyin, leave: cfg.then ? "Stop" : "Back" })}
      <div class="q-stage">${q.html}
      ${q.say ? `<div class="controls"><button class="btn primary big" type="button" data-say="${esc(q.say)}" id="qListen">${icon("speaker")} Listen</button>
        <button class="btn big" type="button" data-say="${esc(q.say)}" data-slow>${icon("slow")} Slow</button></div>` : ""}</div>
      ${q.peek ? `<details class="peek"><summary>Show the text</summary>${q.peek}</details>` : ""}
      <div class="choices">${opts.map((o, i) => `<button class="choice" type="button" data-i="${i}">${o.html}</button>`).join("")}</div>
      <div class="status" id="qStatus" aria-live="polite"></div>
      <div class="answer" id="qAnswer" hidden></div>
      <div class="controls dock"><button class="btn primary" type="button" id="qNext" hidden>${pos + 1 >= items.length ? (cfg.then ? "Continue" : "See results") : "Next"}</button><button class="btn ghost" type="button" id="qSkip">不知道 · Don't know</button></div>
    </div>`;
    wire(body());
    if (!cfg.noPinyin) wirePinyin(body().firstElementChild);
    const answer = (b) => {
      const ok = b ? opts[+b.dataset.i].correct : false;
      $("#qSkip").hidden = true;
      $$(".choice", body()).forEach((c) => {
        c.disabled = true;
        if (opts[+c.dataset.i].correct) c.classList.add("right");
        else if (c === b) c.classList.add("wrong");
      });
      progress.record(cfg.key + (cfg.id ? cfg.id(w) : w.w), { ok, miss: ok ? 0 : 1 });
      if (ok) right++; else { missed.push(cfg.label ? cfg.label(w) : w.w); missedItems.push(w); }
      const st = $("#qStatus");
      st.style.color = ok ? "" : "var(--cinnabar)";
      st.textContent = ok ? "对了！Correct!" : b ? "Not quite." : "No problem. Here is the answer.";
      $("#qAnswer").innerHTML = cfg.reveal(w);
      // Every mistake gets a reason: what you chose, and why the answer is the answer.
      const mine = b && !ok ? opts[+b.dataset.i].note : "";
      const why = cfg.why?.(w) || "";
      if (mine || (why && !ok)) $("#qAnswer").insertAdjacentHTML("beforeend", `<div class="why">${mine ? `<p><span class="why-lbl">You chose</span> ${mine}</p>` : ""}${why && !ok ? `<p><span class="why-lbl">Why</span> ${why}</p>` : ""}</div>`);
      if (cfg.explain) showWhy($("#qAnswer"), cfg.explain(w), b && !ok ? opts[+b.dataset.i].t : null);
      $("#qAnswer").hidden = false;
      revealNext($("#qNext"));
      const after = cfg.sayAfter ? cfg.sayAfter(w) : w.w;
      if (!q.say && !cfg.silent && after) autoSay(after);
    };
    $$(".choice", body()).forEach((b) => b.addEventListener("click", () => answer(b)));
    $("#qSkip").addEventListener("click", () => answer(null));
    $("#qNext").addEventListener("click", () => { pos++; ask(); });
    if (q.say) sayLater(q.say);
  }
  function end() {
    progress.addSession({ type: cfg.kind, lesson: P.ctx.lesson ?? 0, score: right, total: items.length, missed });
    cfg.onDone?.(right, items.length);
    if (cfg.then) return cfg.then({ title: cfg.title, right, total: items.length, missed, missedItems });
    const full = cfg.fullCfg || cfg; // "Again" starts the original round (or picks a new one), even after "Retry missed"
    showResults(cfg.title, right, items.length, missed, () => choiceQuiz(full), "全对！Quán duì! Everything correct!",
      missedItems.length && (() => choiceQuiz({ ...cfg, items: missedItems, onDone: undefined, fullCfg: full })));
  }
  ask();
}

// Shared results screen.
// retry: given when something was missed; runs the same exercise on just those items.
export function showResults(title, right, total, missed, again, perfect = "全对！Quán duì!", retry) {
  body().innerHTML = `<div class="panel">
    <span class="lbl">Results · ${esc(title)}</span>
    <div class="score">${right} / ${total}</div>
    ${missed.length ? `<p>Practice these again:</p><div class="result-list">${missed.map((w) => `<span>${esc(w)}</span>`).join("")}</div>` : `<p>${perfect}</p>`}
    <div class="controls">${nextHtml()}${again ? `<button class="btn big" type="button" id="resAgain">${icon("replay")} Again</button>` : ""}${retry ? `<button class="btn big" type="button" id="resRetry">Retry missed</button>` : ""}${backBtn()}</div>
  </div>`;
  wireBack(body());
  wireNext(body());
  $("#resAgain")?.addEventListener("click", again);
  $("#resRetry")?.addEventListener("click", retry);
}

/* ---------- Match pairs ---------- */
function matchGame(words) {
  // Two words can share one meaning (for example two "happy"); keep only one so every pair is clear.
  // Words not done yet come first; done ones only fill up the board.
  const seenEn = new Set(), set = [];
  for (const w of openFirst(words, wordItem, progress.get)) {
    const k = (w.en || "").trim().toLowerCase();
    if (seenEn.has(k)) continue;
    seenEn.add(k); set.push(w);
    if (set.length === 6) break;
  }
  if (set.length < 2) return notEnough();
  // Words in the left column, meanings in the right one, each in its own random order.
  const left = shuffle(set), right = shuffle(set);
  if (set.length > 2 && left.every((w, i) => w === right[i])) right.push(right.shift()); // never already lined up
  const tiles = left.flatMap((w, i) => [{ w, side: "hz" }, { w: right[i], side: "en" }]);
  let sel = null, done = 0, errors = 0;
  const firstTry = new Set(set.map((w) => w.w));
  const t0 = Date.now();
  body().innerHTML = `<div class="panel">
    <span class="lbl">配对 · Match pairs</span>
    <p>Tap a word on the left, then its meaning on the right.</p>
    <div class="match-grid">${tiles.map((t, i) => `<button class="tile ${t.side}" type="button" data-i="${i}">${t.side === "hz" ? t.w.w : esc(t.w.en)}</button>`).join("")}</div>
    <div class="status" id="mStatus" aria-live="polite"></div>
    <div class="controls" id="mEnd">${backBtn()}</div>
  </div>`;
  wireBack(body());
  $$(".tile", body()).forEach((b) => b.addEventListener("click", () => {
    const t = tiles[+b.dataset.i];
    if (!sel) { sel = { t, b }; b.classList.add("sel"); if (t.side === "hz") say(t.w.w); return; }
    if (sel.b === b) { b.classList.remove("sel"); sel = null; return; }
    if (sel.t.side === t.side) { sel.b.classList.remove("sel"); sel = { t, b }; b.classList.add("sel"); if (t.side === "hz") say(t.w.w); return; }
    const a = sel; sel = null;
    a.b.classList.remove("sel");
    if (a.t.w === t.w && a.t.side !== t.side) {
      a.b.classList.add("done"); b.classList.add("done");
      $("#mStatus").style.color = ""; $("#mStatus").textContent = "";
      progress.record("q:" + t.w.w, { ok: firstTry.has(t.w.w), miss: firstTry.has(t.w.w) ? 0 : 1 }, { sfx: "right" });
      say(t.w.w);
      if (++done === set.length) {
        const secs = Math.round((Date.now() - t0) / 1000);
        progress.addSession({ type: "match", lesson: P.ctx.lesson ?? 0, score: firstTry.size, total: set.length, missed: set.filter((w) => !firstTry.has(w.w)).map((w) => w.w) });
        $("#mStatus").textContent = `全部配对！All matched in ${secs} s${errors ? ` with ${errors} mistake${errors > 1 ? "s" : ""}` : ", no mistakes"}.`;
        const notFirst = set.filter((w) => !firstTry.has(w.w));
        $("#mEnd").innerHTML = `${nextHtml()}<button class="btn big" type="button" id="mAgain">${icon("replay")} New round</button>${notFirst.length >= 2 ? `<button class="btn big" type="button" id="mRetry">Retry missed</button>` : ""}${backBtn()}`;
        wireBack(body());
        wireNext(body());
        $("#mAgain").addEventListener("click", () => matchGame(words));
        $("#mRetry")?.addEventListener("click", () => matchGame(notFirst));
      }
    } else {
      errors++;
      sfx("wrong");
      firstTry.delete(a.t.w.w); firstTry.delete(t.w.w);
      // Say what the word really means, so the mistake teaches it.
      const hw = a.t.side === "hz" ? a.t.w : t.w;
      $("#mStatus").style.color = "var(--cinnabar)";
      $("#mStatus").innerHTML = `Not a pair. ${wordNote(hw)}`;
      [a.b, b].forEach((x) => { x.classList.add("bad"); setTimeout(() => x.classList.remove("bad"), 400); });
    }
  }));
}

/* ---------- Speaking ---------- */
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const sKey = (it) => "s:" + it.w.w + (it.sentence ? "#ex" : "");

// items: [{ w, text, py, en, sentence? }], or a function that picks them ("Again" then picks anew)
export function speak({ title, items: pick, then, fullItems = pick }) {
  const items = typeof pick === "function" ? pick() : pick;
  if (!items.length) return notEnough();
  let pos = 0, right = 0, useRecorder = !Recognition, answered = false, wrong = false, recTimer = null, recog = null, media = null, starting = false;
  const missed = [], missedItems = [];
  // Stop anything still listening or recording (next item, skip, leaving the screen).
  const abortAll = () => {
    clearTimeout(recTimer); recTimer = null;
    if (media) { const m = media; media = null; m.onstop = null; try { if (m.state === "recording") m.stop(); } catch {} m.stream?.getTracks().forEach((t) => t.stop()); }
    if (recog) { const r = recog; recog = null; r.onresult = r.onend = r.onerror = null; try { r.abort(); } catch {} }
  };
  function show() {
    abortAll();
    if (pos >= items.length) return end();
    answered = false; wrong = false;
    const it = items[pos];
    if (!pos) scrollTo(0, 0);
    body().innerHTML = `<div class="panel focus">
      ${quizHead({ title: `说 · ${title}`, pos, total: items.length, leave: then ? "Stop" : "Back" })}
      <div class="speak-card">
        <div class="${it.sentence ? "prompt-big" : "big-hz"}" data-en-done="1" style="font-family:var(--display)">${it.text}</div>
        <div class="py q-py">${tonePy(it.py)}</div>
        <div class="muted q-en">${esc(it.en)}</div>
        <div class="controls" style="justify-content:center">${sayBtns(it.text, it.py)}</div>
        <button class="mic" type="button" id="micBtn" aria-label="Speak">${icon("mic")}</button>
        <div class="note" id="micNote">${useRecorder ? "Tap to record yourself, tap again to stop." : "Tap the microphone and say it."}</div>
        <div class="heard" id="heard" aria-live="polite"></div>
        <div class="controls" id="judge" style="justify-content:center"></div>
      </div>
      <div class="controls dock"><button class="btn primary" type="button" id="sNext" hidden>${pos + 1 >= items.length ? (then ? "Continue" : "See results") : "Next"}</button>
        <button class="btn ghost" type="button" id="sSkip">Skip</button></div>
    </div>`;
    wireBack(body());
    wirePinyin(body().firstElementChild, { annotateText: false });
    $("#micBtn").addEventListener("click", () => (useRecorder ? recordToggle(it) : listen(it)));
    $("#sNext").addEventListener("click", () => { pos++; show(); });
    $("#sSkip").addEventListener("click", () => {
      if (!answered && !wrong) { progress.record(sKey(it), { ok: false, miss: 1 }); missed.push(it.text); missedItems.push(it); }
      answered = true;
      pos++; show();
    });
    $$("[data-back]", body()).forEach((b) => b.addEventListener("click", abortAll));
  }
  function result(it, ok, msg) {
    if (answered) return;
    answered = true;
    abortAll();
    const mic = $("#micBtn");
    if (mic) { mic.disabled = true; mic.classList.remove("on"); }
    // Right after a "Not yet": done for the lesson, but it was already counted as missed.
    if (wrong) { if (ok) progress.record(sKey(it), { ok: false, fix: true }, { sfx: "right" }); }
    else {
      progress.record(sKey(it), { ok, miss: ok ? 0 : 1 });
      if (ok) right++; else { missed.push(it.text); missedItems.push(it); }
    }
    $("#heard").innerHTML = msg;
    $("#judge").innerHTML = "";
    revealNext($("#sNext"));
    $("#sSkip").hidden = true;
  }
  // Recorder "Not yet": counted as a miss once, then record again; "Sounded right" later still finishes it.
  function tryAgain(it) {
    if (!wrong) { wrong = true; progress.record(sKey(it), { ok: false, miss: 1 }); missed.push(it.text); missedItems.push(it); }
    $("#heard").innerHTML = `Keep practicing <span class="hz">${it.text}</span>.`;
    $("#judge").innerHTML = "";
    $("#micNote").textContent = "Listen to the model, then tap to record again.";
  }
  function listen(it) {
    const mic = $("#micBtn");
    if (answered) return;
    abortAll();
    const rec = recog = new Recognition();
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
    let failed = false;
    const onerr = rec.onerror;
    rec.onerror = (e) => { failed = true; onerr(e); };
    rec.onend = () => { mic.classList.remove("on"); if ((got || !failed) && !answered) $("#micNote").textContent = "Tap the microphone to try again."; };
    try { stopSpeech(); rec.start(); } catch { mic.classList.remove("on"); }
  }
  // Fallback without speech recognition: record, play it back next to the model, judge yourself.
  async function recordToggle(it) {
    const mic = $("#micBtn");
    if (answered || starting) return;
    if (media?.state === "recording") { media.stop(); return; }
    starting = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      starting = false;
      if (answered || $("#micBtn") !== mic) { stream.getTracks().forEach((t) => t.stop()); return; }
      const chunks = [];
      const m = media = new MediaRecorder(stream);
      m.ondataavailable = (e) => chunks.push(e.data);
      m.onstop = () => {
        clearTimeout(recTimer); recTimer = null;
        stream.getTracks().forEach((t) => t.stop());
        mic.classList.remove("on");
        const url = URL.createObjectURL(new Blob(chunks, { type: m.mimeType }));
        $("#micNote").textContent = "Compare your voice with the model, then judge:";
        $("#heard").innerHTML = `<audio controls src="${url}" style="width:min(100%,320px)"></audio>`;
        $("#judge").innerHTML = `<button class="btn" type="button" id="jNo">Not yet</button><button class="btn primary" type="button" id="jYes">${icon("check")} Sounded right</button>`;
        $("#jYes").addEventListener("click", () => result(it, true, `<span class="ok-c">很好！</span>`));
        $("#jNo").addEventListener("click", () => tryAgain(it));
      };
      m.start();
      mic.classList.add("on");
      $("#micNote").textContent = "Recording… tap again to stop.";
      clearTimeout(recTimer);
      recTimer = setTimeout(() => { if (media === m && m.state === "recording") m.stop(); }, it.sentence ? 8000 : 4000);
    } catch {
      starting = false;
      $("#micNote").textContent = "Microphone not available. Allow microphone access for this app in Settings.";
    }
  }
  function end() {
    progress.addSession({ type: "speak", lesson: P.ctx.lesson ?? 0, score: right, total: items.length, missed });
    if (then) return then({ title, right, total: items.length, missed, missedItems });
    showResults(title, right, items.length, missed, () => speak({ title, items: fullItems }), "说得很好！Shuō de hěn hǎo!", // "Again" replays the whole round, even after "Retry missed"
      missedItems.length && (() => speak({ title, items: missedItems, fullItems })));
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
    const list = words.filter((w) => matchesWord(w, q));
    rows.innerHTML = list.map((w) => `<tr><td class="hz">${charLinks(w.w)} ${dot(w)}</td><td><span class="py">${tonePy(w.py)}</span><br><span class="en">${esc(w.en)}</span></td><td style="text-align:right;white-space:nowrap">${sayBtns(w.w, w.py, true)}</td></tr>`).join("")
      || `<tr><td class="muted">No words match.</td></tr>`;
  };
  $("#wlSearch").addEventListener("input", (e) => render(e.target.value));
  render();
}
