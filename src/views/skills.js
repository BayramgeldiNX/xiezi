// The four skill sections on the home screen: 写 Writing, 听 Listening, 说 Speaking, 词 Vocabulary.
// Each works on the words of the lessons you pick (all lessons by default).
import { $, $$, esc, shuffle, store } from "../lib/util.js";
import { tonePy, stripTone } from "../lib/pinyin.js";
import { say, sayBtns, stopSpeech } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { clearWriters } from "../lib/draw.js";
import { overlap } from "../lib/compare.js";
import { LESSONS, wordsOf, lessonChars, wordChars } from "../data/index.js";
import * as progress from "../progress/store.js";
import { charStatus, wordStatus } from "../progress/model.js";
import { dictIntro } from "./dictation.js";
import { cardsOpen } from "./cards.js";
import { tonesIntro } from "./tones.js";
import { buildCharCard } from "./write.js";

export const SKILLS = {
  writing: {
    seal: "写", name: "Writing", cn: "写字", sub: "Dictation, pinyin, stroke order",
    modes: [
      { id: "dict", seal: "听", name: "Dictation", sub: "Hear a word, write it from memory" },
      { id: "pinyin", seal: "拼", name: "From pinyin", sub: "See the pinyin, write the characters" },
      { id: "meaning", seal: "意", name: "From meaning", sub: "See the English, write the Chinese" },
      { id: "chars", seal: "笔", name: "Stroke order", sub: "Every character: watch, step through, trace" },
    ],
  },
  listening: {
    seal: "听", name: "Listening", cn: "听力", sub: "Words, sentences, tones",
    modes: [
      { id: "pick-word", seal: "字", name: "Hear & pick the word", sub: "Listen, then choose the characters" },
      { id: "pick-meaning", seal: "意", name: "Hear & pick the meaning", sub: "Listen, then choose the English" },
      { id: "sentence", seal: "句", name: "Sentences", sub: "Listen to a sentence, choose what it means" },
      { id: "tones", seal: "声", name: "Tones", sub: "Hear a syllable, pick its tone" },
    ],
  },
  speaking: {
    seal: "说", name: "Speaking", cn: "口语", sub: "Say it, the app listens",
    modes: [
      { id: "say-word", seal: "词", name: "Say the word", sub: "Read the word aloud; the app checks it" },
      { id: "say-sentence", seal: "句", name: "Say the sentence", sub: "Read a whole sentence aloud" },
    ],
  },
  vocab: {
    seal: "词", name: "Vocabulary", cn: "词汇", sub: "Cards, matching, quizzes",
    modes: [
      { id: "cards", seal: "卡", name: "Flashcards", sub: "Flip, then say if you knew it" },
      { id: "match", seal: "配", name: "Match pairs", sub: "Match each word to its meaning" },
      { id: "quiz-meaning", seal: "意", name: "What does it mean?", sub: "See the word, pick the English" },
      { id: "quiz-word", seal: "选", name: "Which word?", sub: "See the English, pick the word" },
      { id: "list", seal: "表", name: "Word list", sub: "All words with pinyin and sound" },
    ],
  },
};

let skill = null;   // current skill id
const body = () => $("#skillBody");

/* ---------- Which lessons ---------- */
function scopeIds() {
  const saved = store.get("xz-scope", "all");
  const ids = saved === "all" ? LESSONS.map((l) => l.id) : saved.filter((id) => LESSONS.some((l) => l.id === id));
  return ids.length ? ids : LESSONS.map((l) => l.id);
}
const scopeWords = () => wordsOf(LESSONS.filter((l) => scopeIds().includes(l.id)));

function renderScope() {
  const el = $("#skillScope");
  if (LESSONS.length < 2) { el.hidden = true; return; }
  el.hidden = false;
  const ids = scopeIds(), all = ids.length === LESSONS.length;
  el.innerHTML = `<button type="button" data-id="all" aria-pressed="${all}">All lessons</button>` +
    LESSONS.map((l) => `<button type="button" data-id="${l.id}" aria-pressed="${!all && ids.includes(l.id)}"><span class="zh">${l.cn}</span> ${esc(l.title)}</button>`).join("");
  $$("button", el).forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.id === "all") store.set("xz-scope", "all");
    else {
      const cur = all ? [] : scopeIds();
      const next = cur.includes(b.dataset.id) ? cur.filter((x) => x !== b.dataset.id) : [...cur, b.dataset.id];
      store.set("xz-scope", next.length ? next : "all");
    }
    renderScope();
    showMenu();
  }));
}

/* ---------- Section page ---------- */
export function openSkill(id) {
  skill = SKILLS[id] ? id : "writing";
  const s = SKILLS[skill];
  $("#skillEyebrow").textContent = `${s.seal} · ${s.cn}`;
  $("#skillTitle").textContent = s.name;
  document.title = `${s.name} · 写字本`;
  renderScope();
  showMenu();
}

function showMenu() {
  clearWriters();
  stopSpeech();
  const s = SKILLS[skill];
  const n = scopeWords().length;
  body().innerHTML = `<p class="note">${n} word${n === 1 ? "" : "s"} from ${scopeIds().length === LESSONS.length ? "all lessons" : "the lessons you picked"}.</p>
    <div class="mode-grid">${s.modes.map((m) => `<button class="mode-card" type="button" data-mode="${m.id}">
      <span class="seal">${m.seal}</span><b>${m.name}</b><small>${m.sub}</small></button>`).join("")}</div>`;
  $$("[data-mode]", body()).forEach((b) => b.addEventListener("click", () => startMode(b.dataset.mode)));
  scrollTo(0, 0);
}

function startMode(mode) {
  const words = scopeWords();
  const back = showMenu;
  const host = "#skillBody";
  const lesson = 0;
  scrollTo(0, 0);
  switch (mode) {
    case "dict": return dictIntro({ host, words, prompt: "audio", kind: "dict", back, lesson });
    case "pinyin": return dictIntro({ host, words, prompt: "pinyin", kind: "dict-pinyin", back, lesson });
    case "meaning": return dictIntro({ host, words, prompt: "meaning", kind: "dict-meaning", back, lesson });
    case "chars": return charGrid();
    case "pick-word": return choiceQuiz({ kind: "listen-word", title: "Hear & pick the word", words, key: "l:",
      ask: (w) => ({ html: `<p class="hint">Which word do you hear?</p>`, say: w.w }),
      option: (w) => `<span class="hz">${w.w}</span>`, reveal: (w) => `<span class="hz">${w.w}</span> <span class="py">${tonePy(w.py)}</span> <span class="muted">${esc(w.en)}</span>` });
    case "pick-meaning": return choiceQuiz({ kind: "listen-meaning", title: "Hear & pick the meaning", words, key: "l:",
      ask: (w) => ({ html: `<p class="hint">What does it mean?</p>`, say: w.w }),
      option: (w) => `<span class="en">${esc(w.en)}</span>`, reveal: (w) => `<span class="hz">${w.w}</span> <span class="py">${tonePy(w.py)}</span>` });
    case "sentence": {
      const sw = words.filter((w) => w.ex?.hz);
      return choiceQuiz({ kind: "listen-sentence", title: "Sentences", words: sw, key: "ls:", count: 8,
        ask: (w) => ({ html: `<p class="hint">What does this sentence mean?</p>`, say: w.ex.hz }),
        option: (w) => `<span class="en">${esc(w.ex.en)}</span>`,
        reveal: (w) => `<span class="hz" style="font-size:1.3rem">${w.ex.hz}</span> ${sayBtns(w.ex.hz, "sentence", true)}<br><span class="py">${tonePy(w.ex.py)}</span>` });
    }
    case "tones": return tonesIntro({ host, words, label: "Characters from your lessons", lesson, back });
    case "say-word": return speak({ title: "Say the word", items: words.map((w) => ({ w, text: w.w, py: w.py, en: w.en })) });
    case "say-sentence": return speak({ title: "Say the sentence", items: words.filter((w) => w.ex?.hz).map((w) => ({ w, text: w.ex.hz, py: w.ex.py, en: w.ex.en, sentence: true })) });
    case "cards": return cardsOpen({ host, words, lesson, back });
    case "match": return matchGame(words);
    case "quiz-meaning": return choiceQuiz({ kind: "quiz-meaning", title: "What does it mean?", words, key: "q:",
      ask: (w) => ({ html: `<div class="big-hz">${w.w}</div>` }),
      option: (w) => `<span class="en">${esc(w.en)}</span>`, reveal: (w) => `<span class="hz">${w.w}</span> <span class="py">${tonePy(w.py)}</span> ${sayBtns(w.w, w.py, true)}` });
    case "quiz-word": return choiceQuiz({ kind: "quiz-word", title: "Which word?", words, key: "q:",
      ask: (w) => ({ html: `<div class="prompt-big">${esc(w.en)}</div>` }),
      option: (w) => `<span class="hz">${w.w}</span>`, reveal: (w) => `<span class="hz">${w.w}</span> <span class="py">${tonePy(w.py)}</span> ${sayBtns(w.w, w.py, true)}` });
    case "list": return wordList(words);
  }
}

const backBtn = () => `<button class="btn ghost" type="button" data-back>Back</button>`;
const wireBack = (el) => $$("[data-back]", el).forEach((b) => b.addEventListener("click", showMenu));

/* ---------- Multiple choice (listening + vocabulary quizzes) ---------- */
// Wrong answers come from the chosen words; if there are too few, from every lesson.
function distractors(w, pool, label) {
  const others = pool.filter((x) => x.w !== w.w && label(x) !== label(w));
  const extra = wordsOf(LESSONS).filter((x) => x.w !== w.w && label(x) !== label(w) && !others.includes(x));
  return shuffle(others).concat(shuffle(extra)).slice(0, 3);
}

function choiceQuiz(cfg) {
  const items = shuffle(cfg.words).slice(0, cfg.count || 10);
  if (items.length < 2) { body().innerHTML = `<div class="panel"><p>Not enough words here yet.</p>${backBtn()}</div>`; return wireBack(body()); }
  let pos = 0, right = 0;
  const missed = [];
  function ask() {
    if (pos >= items.length) return end();
    const w = items[pos];
    const q = cfg.ask(w);
    const opts = shuffle([w, ...distractors(w, cfg.words, cfg.option)]);
    body().innerHTML = `<div class="panel">
      <span class="lbl">${cfg.title}</span>
      <div class="progress">Question ${pos + 1} of ${items.length} · ${right} right</div>
      <div class="bar"><i style="width:${(pos / items.length) * 100}%"></i></div>
      ${q.html}
      ${q.say ? `<div class="controls"><button class="btn primary big" type="button" data-say="${esc(q.say)}" id="qListen">${icon("speaker")} Listen</button>
        <button class="btn big" type="button" data-say="${esc(q.say)}" data-slow>${icon("slow")} Slow</button></div>` : ""}
      <div class="choices">${opts.map((o, i) => `<button class="choice" type="button" data-i="${i}">${cfg.option(o)}</button>`).join("")}</div>
      <div class="status" id="qStatus" aria-live="polite"></div>
      <div class="answer" id="qAnswer" hidden></div>
      <div class="controls"><button class="btn primary" type="button" id="qNext" hidden>${pos + 1 >= items.length ? "See results" : "Next"}</button>${backBtn()}</div>
    </div>`;
    wireBack(body());
    $$(".choice", body()).forEach((b) => b.addEventListener("click", () => {
      const ok = opts[+b.dataset.i] === w;
      $$(".choice", body()).forEach((c) => {
        c.disabled = true;
        if (opts[+c.dataset.i] === w) c.classList.add("right");
        else if (c === b) c.classList.add("wrong");
      });
      progress.record(cfg.key + w.w, { ok, miss: ok ? 0 : 1 });
      if (ok) right++; else missed.push(w.w);
      const st = $("#qStatus");
      st.style.color = ok ? "" : "var(--cinnabar)";
      st.textContent = ok ? "对了！Correct!" : "Not quite.";
      $("#qAnswer").innerHTML = cfg.reveal(w);
      $("#qAnswer").hidden = false;
      $("#qNext").hidden = false;
      $("#qNext").focus({ preventScroll: true });
      if (!q.say) say(w.w);
    }));
    $("#qNext").addEventListener("click", () => { pos++; ask(); });
    if (q.say) setTimeout(() => say(q.say), 250);
  }
  function end() {
    progress.addSession({ type: cfg.kind, lesson: 0, score: right, total: items.length, missed });
    body().innerHTML = `<div class="panel">
      <span class="lbl">Results · ${cfg.title}</span>
      <div class="score">${right} / ${items.length} right</div>
      ${missed.length ? `<p>Practice these again:</p><div class="result-list">${missed.map((w) => `<span>${w}</span>`).join("")}</div>` : `<p>全对！Quán duì! Everything correct!</p>`}
      <div class="controls"><button class="btn primary big" type="button" id="qAgain">${icon("replay")} Again</button>${backBtn()}</div>
    </div>`;
    wireBack(body());
    $("#qAgain").addEventListener("click", () => choiceQuiz(cfg));
  }
  ask();
}

/* ---------- Match pairs ---------- */
function matchGame(words) {
  const set = shuffle(words).slice(0, 6);
  if (set.length < 2) { body().innerHTML = `<div class="panel"><p>Not enough words here yet.</p>${backBtn()}</div>`; return wireBack(body()); }
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
        progress.addSession({ type: "match", lesson: 0, score: set.length - (set.length - firstTry.size), total: set.length, missed: set.filter((w) => !firstTry.has(w.w)).map((w) => w.w) });
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

function speak({ title, items }) {
  items = shuffle(items).slice(0, 10);
  if (!items.length) { body().innerHTML = `<div class="panel"><p>Not enough words here yet.</p>${backBtn()}</div>`; return wireBack(body()); }
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
      <div class="controls"><button class="btn primary" type="button" id="sNext" hidden>${pos + 1 >= items.length ? "See results" : "Next"}</button>
        <button class="btn ghost" type="button" id="sSkip">Skip</button>${backBtn()}</div>
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
    progress.addSession({ type: "speak", lesson: 0, score: right, total: items.length, missed });
    body().innerHTML = `<div class="panel">
      <span class="lbl">Results · ${title}</span>
      <div class="score">${right} / ${items.length}</div>
      ${missed.length ? `<p>Practice these again:</p><div class="result-list">${missed.map((t) => `<span>${t}</span>`).join("")}</div>` : `<p>说得很好！Shuō de hěn hǎo!</p>`}
      <div class="controls"><button class="btn primary big" type="button" id="sAgain">${icon("replay")} Again</button>${backBtn()}</div>
    </div>`;
    wireBack(body());
    $("#sAgain").addEventListener("click", () => speak({ title, items }));
  }
  show();
}

/* ---------- Stroke order: every character ---------- */
function charGrid() {
  clearWriters();
  const chars = [...new Set(LESSONS.filter((l) => scopeIds().includes(l.id)).flatMap(lessonChars))];
  body().innerHTML = `<div class="panel">
    <span class="lbl">笔顺 · Stroke order</span>
    <p>${chars.length} characters. Dots: <span style="color:var(--amber)">●</span> learning, <span style="color:var(--jade)">●</span> mastered.</p>
    <div class="char-grid">${chars.map((c) => `<button type="button" data-c="${c}" data-status="${charStatus(progress.get("w:" + c))}">${c}</button>`).join("")}</div>
    ${backBtn()}
  </div>`;
  wireBack(body());
  $$("[data-c]", body()).forEach((b) => b.addEventListener("click", () => {
    clearWriters();
    body().innerHTML = `<div style="display:grid;gap:12px"><div class="controls"><button class="btn" type="button" id="cgBack">${icon("back")} All characters</button></div><div id="cgCard"></div></div>`;
    $("#cgBack").addEventListener("click", charGrid);
    buildCharCard($("#cgCard"), b.dataset.c);
    scrollTo(0, 0);
  }));
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

/* ---------- Home: section cards ---------- */
export function skillCards() {
  return Object.entries(SKILLS).map(([id, s]) => `<button class="hub-card" type="button" data-skill="${id}">
    <span class="seal">${s.seal}</span>
    <span class="hub-txt"><b>${s.name}<span class="hub-cn">${s.cn}</span></b><span class="hub-sub">${s.sub}</span></span>
  </button>`).join("");
}
