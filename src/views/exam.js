// A test, from the cover to handing in: #/test/<book>/<id>. State lives in src/exam/run.js (pure); this file draws it,
// runs the clock, saves the run (localStorage xz-exam-run) and hands the paper to exam-result.js. Terms: GLOSSARY.md.
import { $, $$, esc, NUM } from "../lib/util.js";
import { icon } from "../lib/icons.js";
import { tonePy, syllables } from "../lib/pinyin.js";
import { say, stopSpeech, canSay, hasRecording } from "../lib/speech.js";
import { gridSVG, makeWriter, trackWriter, clearWriters } from "../lib/draw.js";
import { sentencePy } from "../lib/sentence-py.js";
import { BOOKS, CHARINFO } from "../data/index.js";
import { testOf } from "../exam/plan.js";
import { buildPaper, optsFor } from "../exam/build.js";
import * as R from "../exam/run.js";
import * as screen from "../lib/screen.js";
import excludeJson from "../data/exam-exclude.json";
import LINES from "../data/exam-lines.json";
import { showResult } from "./exam-result.js";
import { sfx } from "../lib/sfx.js";
import { resultOf } from "../exam/store.js";

const KEY = "xz-exam-run";
const HOW = {
  listen: "Each recording plays twice by itself. You cannot go back.",
  vocab: "Choose the right answer. Skip, mark and come back.",
  grammar: "Choose the word that fits the blank. Skip, mark and come back.",
  read: "Read carefully and choose the answer. Skip, mark and come back.",
  write: "Build each sentence, then write each word by hand.",
};
const PART_NAMES = { listen: ["听力", "Listening"], vocab: ["词汇", "Vocabulary"], grammar: ["语法", "Grammar"], read: ["阅读", "Reading"], write: ["书写", "Writing"] };
// PC: the answer sheet stays open at the side. The same query desktop.css uses for its docked sheet.
const DOCK_QUERY = "screen and (min-width: 1200px) and (hover: hover) and (pointer: fine)";
const docked = () => matchMedia(DOCK_QUERY).matches;
// A sheet that blocks the page: the phone sheet and every confirm. The docked sheet does not.
const modal = () => !!S && (!!S.sure || (S.sheet && !docked()));
const HAN = /\p{Script=Han}/u;
const TONE_LETTERS = /[^A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g;

/* ---------- Saved run ---------- */
function load() {
  try {
    const r = R.restore(localStorage.getItem(KEY));
    return r && ["card", "q", "confirm"].includes(r.stage) ? r : null;
  } catch { return null; }
}
const clearSaved = () => { try { localStorage.removeItem(KEY); } catch {} };
const count = (run) => {
  let answered = 0, total = 0;
  run.paper.parts.forEach((_, i) => { const s = R.partStats(run, i); answered += s.answered; total += s.total; });
  return { answered, total };
};
// For the book page and the result: the test waiting to be continued, or null.
export function savedRun() {
  const r = load();
  return r ? { book: r.book, test: r.test, left: r.left, ...count(r) } : null;
}

/* ---------- Pinyin above characters the book has not taught yet ---------- */
const readCache = new Map();
// One reading per Han character of the sentence, right in context (sentence-py.js); the character's own reading
// where the sentence cannot be lined up with its characters.
function readings(sentence) {
  if (readCache.has(sentence)) return readCache.get(sentence);
  const hans = [...sentence].filter((c) => HAN.test(c));
  let out = [];
  try {
    for (const tok of sentencePy(sentence).split(/\s+/)) {
      const n = [...tok].filter((c) => HAN.test(c)).length;
      if (n) { for (let i = 0; i < n; i++) out.push(""); continue; }
      const letters = tok.replace(TONE_LETTERS, "");
      if (letters) for (const [p] of syllables(letters)) out.push(p);
    }
  } catch { out = []; }
  if (out.length !== hans.length) out = hans.map(() => "");
  out = out.map((p, i) => p || CHARINFO[hans[i]]?.py?.split(/[;,/ ]/)[0] || "");
  readCache.set(sentence, out);
  return out;
}
// text: a piece of `sentence` starting at Han character number `base`. Only characters in `fresh` get a reading.
function ruby(text, fresh, sentence = text, base = 0) {
  if (!fresh.size) return esc(text);
  const py = readings(sentence);
  let k = base;
  return [...text].map((c) => {
    if (!HAN.test(c)) return esc(c);
    const p = py[k++];
    return p && fresh.has(c) ? `<ruby>${c}<rt>${esc(p)}</rt></ruby>` : esc(c);
  }).join("");
}

/* ---------- The screen ---------- */
let S = null; // { host, book, test, run, over, last, token, sheet, sure, timer }

const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const partName = (p, i) => `${NUM[i + 1]}、${p.cn} ${p.en}`;
const leaveTo = () => { location.hash = "#/book/" + (S?.book?.id || ""); };

function persist() {
  if (!S?.run || S.over) return;
  try { localStorage.setItem(KEY, JSON.stringify(S.run)); } catch { noteUnsaved(); }
}
// Saving failed (private mode, full storage): say so once, quietly, and carry on.
function noteUnsaved() {
  if (S.unsaved) return;
  S.unsaved = true;
  S.host.insertAdjacentHTML("afterbegin", `<p class="note ex-unsaved" role="status">This test cannot be saved on this device.</p>`);
}
function set(run) { S.run = run; persist(); }

// The clock runs only while a question page is on screen and the app is visible.
function flush() {
  if (S?.last == null) return;
  const now = performance.now();
  S.run = R.tick(S.run, Math.min(now - S.last, 5000)); // a sleeping laptop or frozen tab must not burn the test
  S.last = now;
}
function syncClock() {
  if (!S || S.over) return;
  const should = S.run?.stage === "q" && !document.hidden;
  if (should && S.last == null) S.last = performance.now();
  if (!should && S.last != null) { flush(); S.last = null; persist(); }
}
function tickLoop() {
  if (!S || S.over || S.last == null) return;
  flush();
  if (S.run.stage === "done") return finish(true);
  S.sinceSave = (S.sinceSave || 0) + 1;
  if (S.sinceSave >= 10) { S.sinceSave = 0; persist(); } // every 5 seconds
  const c = $("#exClock", S.host);
  if (c) { c.textContent = mmss(S.run.left); c.classList.toggle("low", S.run.left <= 300000); }
}

export function openExam(bookId, testId) {
  const book = BOOKS.find((b) => b.id === bookId), test = book && testOf(book, testId);
  const me = S = { host: $("#testBody"), book, test, run: null, over: false, last: null, token: 0, sheet: false, sure: null, timer: 0 };
  const onHide = () => {
    if (S !== me) return;
    if (document.hidden) stopSpeech(); // playTwice sees the cut and gives the round back
    syncClock();
    if (document.hidden) persist(); else resumeAudio();
  };
  const onPageHide = () => { if (S !== me) return; flush(); persist(); };
  // Esc closes the sheet first; main.js would otherwise take it as Back.
  const onEsc = (e) => {
    if (S !== me || !modal()) return;
    if (e.key === "Tab") { // keep Tab inside the open overlay
      const f = $$("button:not([disabled])", $("#exOver", me.host));
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (e.key !== "Escape") return;
    e.stopPropagation(); e.preventDefault();
    me.sheet = false; me.sure = null; overlays();
  };
  me.timer = setInterval(tickLoop, 500);
  document.addEventListener("visibilitychange", onHide);
  addEventListener("pagehide", onPageHide);
  document.addEventListener("keydown", onEsc, true);
  const mq = matchMedia(DOCK_QUERY);
  const onDock = () => { // the window crossed the query: draw the sheet in the right mode
    if (S !== me) return;
    if (me.run?.stage === "q") me.sheet = mq.matches;
    else if (mq.matches) me.sheet = false;
    overlays();
  };
  mq.addEventListener?.("change", onDock);
  screen.onKey(keys);
  screen.onResize(() => { // a writing box has a fixed pixel size
    const q = S === me && me.run?.stage === "q" ? R.current(me.run) : null;
    if (q?.shape === "write" && !(q.n in me.run.answers) && !me.run.started[q.n]) render();
  });
  screen.onLeave(() => {
    if (S !== me) return;
    flush(); me.last = null;
    if (!me.over && me.run) { me.run = R.settle(me.run); persist(); } // a word begun and left is wrong (the cover has no run yet)
    clearInterval(me.timer); me.token++;
    document.removeEventListener("visibilitychange", onHide);
    removeEventListener("pagehide", onPageHide);
    document.removeEventListener("keydown", onEsc, true);
    mq.removeEventListener?.("change", onDock);
    clearWriters(); stopSpeech();
    S = null;
  });
  if (!test) return noSuch();
  document.title = `${test.cn} · ${book.title} · 写字本`;
  render();
}

function noSuch() {
  S.host.innerHTML = `<div class="panel ex-none"><h2>No such test</h2><p class="note">This address does not match a test.</p>
    <button class="btn primary" type="button" data-leave>Back</button></div>`;
  wireLeave();
}
const wireLeave = () => $$("[data-leave]", S.host).forEach((b) => b.addEventListener("click", leaveTo));

function render() {
  clearWriters(); stopSpeech(); S.token++; S.audio = null;
  S.sure = null;
  S.sheet = docked() && S.run?.stage === "q"; // PC: the sheet stays open on question pages
  if (S.run?.stage === "q") S.run = R.settle(S.run); // a word begun and not finished is not redrawn clean
  const st = S.run?.stage;
  if (!S.run) cover();
  else if (st === "card") card();
  else if (st === "q") question();
  else if (st === "confirm") confirmPage();
  overlays();
  if (S.unsaved) S.host.insertAdjacentHTML("afterbegin", `<p class="note ex-unsaved" role="status">This test cannot be saved on this device.</p>`);
  syncClock();
  scrollTo(0, 0);
}

/* ---------- Cover ---------- */
function cover() {
  const { book, test } = S, saved = load();
  const mine = saved && saved.book === book.id && saved.test === test.id;
  let other = "";
  if (saved && !mine) {
    const ob = BOOKS.find((b) => b.id === saved.book), ot = ob && testOf(ob, saved.test);
    other = `<div class="ex-note">A test is waiting: <a href="#/test/${esc(saved.book)}/${esc(saved.test)}">${esc(ob ? ob.title : saved.book)} · ${esc(ot ? ot.cn : saved.test)}</a>.
      Continue it, or give it up before you begin this one. <button class="btn ghost" type="button" id="exGiveUp">Give it up</button></div>`;
  }
  const c = mine ? count(saved) : null;
  let best = null;
  try { best = resultOf(book.id, test.id); } catch {}
  S.host.innerHTML = `<div class="topbar"><button class="back" type="button" data-leave aria-label="Book">${icon("back")}</button>
      <div><h2>${esc(book.title)}</h2><span class="eyebrow">试卷 · Test paper</span></div></div>
    <div class="panel ex-cover">
      <div class="ex-seal" aria-hidden="true"><span>试</span><span>卷</span></div>
      <h1 class="ex-title">${esc(test.cn)}</h1><p class="ex-sub">${esc(test.en)} · Lessons ${test.lessons[0].n}–${test.lessons[test.lessons.length - 1].n}</p>
      ${best ? `<p class="ex-best">Best ${best.best.total} / 500 · ${best.n} attempt${best.n === 1 ? "" : "s"} · <a href="#/test/${esc(book.id)}/${esc(test.id)}/report">成绩单</a></p>` : ""}
      <table class="ex-parts"><tbody>${Object.keys(PART_NAMES).map((id, i) => {
        const n = Object.values(test.counts[id]).reduce((a, b) => a + b, 0), p = PART_NAMES[id];
        return `<tr><td>${NUM[i + 1]}</td><td>${p[0]} <span class="muted">${p[1]}</span></td><td class="num">${n}</td></tr>`;
      }).join("")}<tr class="ex-sum"><td></td><td>${test.total} questions · ${test.minutes} minutes</td><td></td></tr></tbody></table>
      <ul class="ex-rules"><li>No help: nothing is marked until you hand in.</li><li>Listening plays twice and does not go back.</li>
        <li>A finished part cannot be reopened.</li><li>Leaving saves the test and stops the clock.</li></ul>
      ${other}
      <div class="controls ex-go">
        ${mine ? `<button class="btn primary big" type="button" id="exBegin">Continue · ${mmss(saved.left)} left · ${c.answered} / ${c.total} answered</button>
          <button class="btn ghost" type="button" id="exAgain">Start again</button>`
          : `<button class="btn primary big" type="button" id="exBegin" ${other ? "disabled" : ""}>开始 Begin</button>`}
      </div>
    </div>`;
  wireLeave();
  $("#exGiveUp", S.host)?.addEventListener("click", () => ask("Give it up?", "The other saved test, its answers and its time used will be lost.", "Give it up", () => { clearSaved(); render(); }));
  $("#exAgain", S.host)?.addEventListener("click", () => ask("Start again?", "Your saved answers and the time used will be lost.", "Start again", () => { clearSaved(); render(); }));
  $("#exBegin", S.host).addEventListener("click", () => {
    if (mine) { S.run = saved; return render(); }
    sfx("bell");
    try {
      const seed = Date.now() % 2147483647;
      const paper = buildPaper(test, book, seed, optsFor(book, BOOKS, excludeJson));
      set(R.begin(R.newRun({ book: book.id, test: test.id, seed, paper, minutes: test.minutes, now: Date.now() })));
      render();
    } catch (e) { console.error(e); S.run = null; S.host.insertAdjacentHTML("beforeend", `<p class="note">The paper could not be made.</p>`); }
  });
}

/* ---------- Part card ---------- */
function card() {
  const { run } = S, p = run.paper.parts[run.part];
  S.host.innerHTML = `<div class="panel ex-card">
    <button class="btn ghost ex-leave" type="button" data-leave>Leave</button>
    <div class="ex-no">${NUM[run.part + 1]}、</div>
    <h2 class="ex-title">${esc(p.cn)}</h2><p class="ex-sub">${esc(p.en)} · ${p.questions.length} questions</p>
    <p>${esc(HOW[p.id] || "")}</p><p class="note">The clock is stopped. It starts when you press Start.</p>
    <div class="controls"><button class="btn primary big" type="button" id="exStart">开始 Start</button></div>
  </div>`;
  wireLeave();
  $("#exStart").addEventListener("click", () => { set(R.startPart(S.run)); render(); });
  if (LINES[p.id]) Promise.resolve(say(LINES[p.id])).catch(() => {});
}

/* ---------- Question ---------- */
function question() {
  const { run } = S, p = run.paper.parts[run.part], q = R.current(run);
  const total = p.questions.length, last = run.pos === total - 1, one = p.id === "listen";
  const fresh = new Set([...(q.newChars || "")]);
  S.host.innerHTML = `<div class="panel focus ex-q">
    <div class="q-head ex-head"><button class="q-x" type="button" data-leave aria-label="Leave" title="Leave">${icon("x")}</button>
      <div class="bar"><i style="width:${((run.pos + 1) / total) * 100}%"></i></div>
      <span class="progress" aria-label="Question ${run.pos + 1} of ${total}">${run.pos + 1} / ${total}</span>
      <span class="ex-clock" id="exClock" aria-label="Time left">${mmss(run.left)}</span>
      <button class="ex-sheet-btn" type="button" id="exSheet" aria-label="Answer sheet" title="答题卡 Answer sheet">${icon("check")}</button></div>
    <span class="lbl">${esc(partName(p, run.part))}</span>
    <div class="ex-stage" id="exStage"></div>
    <div class="controls dock ex-dock">
      <button class="btn ghost" type="button" id="exPrev" ${one || !run.pos ? "hidden" : ""}>Back</button>
      <button class="btn ghost" type="button" id="exMark" aria-pressed="${!!run.marks[q.n]}">Mark</button>
      <button class="btn primary" type="button" id="exNext">${last ? (run.part === run.paper.parts.length - 1 ? "交卷 Hand in" : "Finish part") : "Next"}</button>
    </div>
  </div>`;
  wireLeave();
  $("#exClock", S.host).classList.toggle("low", run.left <= 300000);
  ({ choice: drawChoice, order: drawOrder, write: drawWrite })[q.shape]($("#exStage", S.host), q, fresh);
  $("#exSheet").addEventListener("click", () => { S.sheet = !S.sheet; overlays(); });
  $("#exPrev").addEventListener("click", () => go(R.prev));
  $("#exNext").addEventListener("click", onNext);
  $("#exMark").addEventListener("click", () => { set(R.toggleMark(S.run, q.n)); $("#exMark").setAttribute("aria-pressed", !!S.run.marks[q.n]); refreshSheet(); });
}
function go(fn) { set(fn(S.run)); render(); }
function onNext() {
  const { run } = S, p = run.paper.parts[run.part];
  if (run.pos < p.questions.length - 1) return go(R.next);
  const left = R.unanswered(run)[run.part];
  const done = () => { set(R.finishPart(S.run)); render(); };
  // The last part goes to the hand-in page, which can come back to it; the others cannot be reopened.
  if (!left || run.part === run.paper.parts.length - 1) return done();
  ask(`${left} unanswered in this part.`, "You cannot come back to it.", "Finish", done);
}

// What the audio says: the "男：" tag names a recording in a man's voice and is never shown or spoken.
const spoken = (a) => (hasRecording(a) ? a : a.replace(/^男：/, ""));
const shown = (a) => a.replace(/^男：/, "");

function drawChoice(el, q, fresh) {
  const zh = (t) => ruby(t, fresh);
  const everyChar = { size: 1, has: (c) => HAN.test(c) };
  const zhOpt = (t) => (q.pyOptions ? ruby(t, everyChar) : zh(t)); // pyOptions: pinyin over every character of every option
  const ctx = (q.context || []).map((l) => `<p>${zh(l)}</p>`).join("");
  const audio = q.audio && q.audio.length;
  const voice = audio && q.audio.every((a) => canSay(spoken(a)));
  el.innerHTML = `${ctx ? `<div class="ex-ctx">${ctx}</div>` : ""}
    ${q.text ? `<div class="ex-text ${q.textLang === "en" ? "en" : "zh"}">${q.textLang === "en" ? esc(q.text) : zh(q.text)}</div>` : ""}
    ${audio && voice ? `<div class="ex-audio" id="exAudio" aria-live="polite"></div>` : ""}
    ${audio && !voice ? `<div class="ex-ctx">${q.audio.map((a) => `<p>${zh(shown(a))}</p>`).join("")}</div><p class="note">This device cannot play the sound, so the text is shown.</p>` : ""}
    <div class="choices ex-choices" role="group">${q.options.map((o, i) => `<button class="choice" type="button" data-i="${i}" aria-pressed="false"><span class="${q.lang === "en" ? "en" : "hz"}">${q.lang === "en" ? esc(o) : zhOpt(o)}</span></button>`).join("")}</div>`;
  const btns = $$(".choice", el);
  const paint = () => btns.forEach((b, i) => { const on = S.run.answers[q.n] === i; b.classList.toggle("sel", on); b.setAttribute("aria-pressed", on); });
  btns.forEach((b, i) => b.addEventListener("click", () => { set(R.answer(S.run, q.n, i)); paint(); refreshSheet(); }));
  paint();
  if (audio && voice) { S.audio = { q, lines: q.audio.map(spoken) }; playTwice(); }
}

// Twice, by itself, about 1.5 s apart. No replay: rounds already started are in the run (run.heard), so a redraw,
// Continue or a reload plays only what is still owed. A round cut off by hiding the app is given back.
async function playTwice() {
  const job = S?.audio, t = S.token, live = () => S && S.token === t;
  if (!job || job.busy) return;
  const el = $("#exAudio", S.host), n = job.q.n;
  if (!el) return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (R.heardOf(S.run, n) >= R.ROUNDS) { el.textContent = "Played twice"; return; }
  if (document.hidden) { job.pending = true; return; }
  job.busy = true; job.pending = false;
  while (live() && R.heardOf(S.run, n) < R.ROUNDS) {
    const round = R.heardOf(S.run, n) + 1;
    set(R.heardRound(S.run, n)); // saved before the sound starts
    el.textContent = `Playing ${round} of 2`;
    for (const line of job.lines) {
      const r = await say(line);
      if (!live()) return;
      if (r === null) { // cut off: the app was hidden. Give the round back and play it when we are back.
        set(R.heardUndo(S.run, n)); job.busy = false; job.pending = true; el.textContent = "Paused"; return;
      }
      await wait(400);
    }
    if (R.heardOf(S.run, n) < R.ROUNDS) await wait(1100);
  }
  job.busy = false;
  if (live()) el.textContent = "Played twice";
}
function resumeAudio() {
  if (S?.run?.stage === "q" && S.audio?.pending && R.current(S.run)?.n === S.audio.q.n) playTwice();
}

function drawOrder(el, q, fresh) {
  const sentence = q.answer.join(""), base = {};
  let off = 0;
  for (const w of q.answer) { if (!(w in base)) base[w] = off; off += [...w].filter((c) => HAN.test(c)).length; }
  const chip = (w, attr, on) => `<button type="button" class="chip${on ? " on" : ""}" ${attr}>${ruby(w, fresh, sentence, base[w] ?? 0)}</button>`;
  el.innerHTML = `<p class="ex-text en">${esc(q.en)}</p>
    <div class="build ex-line" id="exLine" aria-label="Your sentence"></div>
    <div class="build pool" id="exPool"></div>`;
  const line = $("#exLine", el), pool = $("#exPool", el);
  const draw = () => {
    const placed = [...(Array.isArray(S.run.answers[q.n]) ? S.run.answers[q.n] : [])];
    const rest = [...q.tiles];
    for (const w of placed) { const i = rest.indexOf(w); if (i >= 0) rest.splice(i, 1); }
    line.innerHTML = (placed.map((w, k) => chip(w, `data-k="${k}"`, true)).join("") || `<span class="muted">Tap the words below in the right order</span>`) + (placed.length ? `<span class="ex-tail">${esc(q.tail || "")}</span>` : "");
    pool.innerHTML = rest.map((w, k) => chip(w, `data-p="${k}"`, false)).join("");
    const save = (next) => { set(next.length ? R.answer(S.run, q.n, next) : R.clearAnswer(S.run, q.n)); draw(); refreshSheet(); };
    $$("[data-k]", line).forEach((b) => b.addEventListener("click", () => save(placed.filter((_, i) => i !== +b.dataset.k))));
    $$("[data-p]", pool).forEach((b) => b.addEventListener("click", () => save([...placed, rest[+b.dataset.p]])));
  };
  draw();
}

// Written right by Dictation's rule: not given up and no wrong stroke (a test gives no hints). A word is written once:
// the first stroke starts it, the first wrong stroke makes it wrong at once, and leaving it unfinished leaves it wrong.
function drawWrite(el, q) {
  const chars = [...q.word], head = `<div class="ex-write-head"><span class="ex-py">${tonePy(String(q.py).replace(/[<>&"']/g, ""))}</span><p class="ex-text en">${esc(q.en)}</p></div>`;
  if (q.n in S.run.answers) { // written, skipped or failed: one neutral word
    el.innerHTML = `${head}<p class="ex-written">Done</p>`;
    return;
  }
  el.innerHTML = `${head}
    <div class="dict-slots" ${chars.length > 1 ? "" : "hidden"}>${chars.map((_, i) => `<button class="dict-slot" type="button" aria-label="Character ${i + 1} of ${chars.length}">${i + 1}</button>`).join("")}</div>
    <div class="dict-boxes stack">${chars.map((_, i) => `<div class="box${i ? "" : " on"}">${gridSVG()}<div class="hw"></div></div>`).join("")}</div>
    <button class="btn ghost" type="button" id="exSkipWord">Skip this word</button>`;
  const boxes = $$(".dict-boxes .box", el), slots = $$(".dict-slot", el), written = new Set();
  let active = 0, finished = false;
  const showBox = (i) => { active = i; boxes.forEach((b, j) => b.classList.toggle("on", j === i)); slots.forEach((s, j) => s.setAttribute("aria-pressed", j === i)); };
  slots.forEach((s, i) => s.addEventListener("click", () => showBox(i)));
  showBox(0);
  const begun = () => { if (S && !S.run.started[q.n]) set(R.startWrite(S.run, q.n)); };
  const record = (ok) => { // a wrong stroke already made it false; the run refuses a second answer
    if (finished || !S) return;
    finished = true;
    set(R.answer(S.run, q.n, ok));
    render();
  };
  $$(".dict-boxes .hw", el).forEach((b, i) => {
    const size = Math.round(b.getBoundingClientRect().width) || 160;
    const w = trackWriter(makeWriter(b, chars[i], size, { showOutline: false }));
    w.quiz({
      showHintAfterMisses: false, highlightOnComplete: false,
      onCorrectStroke: begun,
      onMistake: () => { begun(); if (S) set(R.answer(S.run, q.n, false)); },
      onComplete: () => {
        written.add(i);
        if (slots[i]) { slots[i].textContent = chars[i]; slots[i].classList.add("done"); }
        if (written.size === chars.length) return setTimeout(() => { if (S && !finished && el.isConnected) record(true); }, 500);
        setTimeout(() => {
          if (finished || active !== i || !el.isConnected) return;
          const rest = chars.map((_, j) => j).filter((j) => !written.has(j));
          showBox(rest.find((j) => j > i) ?? rest[0]);
        }, 500);
      },
    });
  });
  $("#exSkipWord", el).addEventListener("click", () => record(false));
}

/* ---------- Overlays: answer sheet and "are you sure" ---------- */
function ask(title, text, yes, onYes) {
  S.sure = { title, text, yes, onYes };
  overlays();
}
const refreshSheet = () => { if (S.sheet && docked() && !S.sure) overlays(); };
function overlays() {
  const was = $("#exOver", S.host), keep = $(".ex-sheet", was || document.createElement("i"))?.scrollTop || 0;
  was?.remove();
  if (!S.sheet && !S.sure) { // closed: focus goes back to what opened it
    const t = S.trigger;
    if (was && t?.isConnected) t.focus({ preventScroll: true });
    if (was) S.trigger = null;
    return;
  }
  const dock = !S.sure && docked();
  if (!was && !dock) S.trigger = document.activeElement;
  const el = document.createElement("div");
  el.id = "exOver";
  el.className = "ex-scrim";
  if (S.sure) {
    const { title, text, yes, onYes } = S.sure;
    el.innerHTML = `<div class="ex-sheet ex-sure" role="alertdialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="controls"><button class="btn big" type="button" data-no>Stay</button><button class="btn primary big" type="button" data-yes>${esc(yes)}</button></div></div>`;
    S.host.append(el);
    $("[data-yes]", el).addEventListener("click", () => { S.sure = null; overlays(); onYes(); });
    $("[data-no]", el).addEventListener("click", () => { S.sure = null; overlays(); });
  } else {
    const { run } = S;
    el.innerHTML = `<div class="ex-sheet${dock ? " ex-docked" : ""}" ${dock ? 'role="complementary"' : 'role="dialog" aria-modal="true"'} aria-label="答题卡 Answer sheet">
      <div class="ex-sheet-top"><h3>答题卡 <span class="muted">Answer sheet</span></h3><button class="btn" type="button" data-no>Close</button></div>
      ${run.paper.parts.map((p, i) => `<div class="ex-row${i < run.part ? " done" : i > run.part ? " later" : ""}"><span class="lbl">${esc(partName(p, i))}${i < run.part ? " · finished" : ""}</span>
        <div class="ex-bubs">${p.questions.map((q, k) => {
          const a = R.isAnswered(q, run.answers[q.n]), cls = ["ex-bub", a ? "ans" : "", run.marks[q.n] ? "mk" : "", i === run.part && k === run.pos ? "cur" : ""].join(" ");
          const off = i !== run.part || (p.id === "listen" && k < run.pos);
          return `<button type="button" class="${cls}" data-k="${k}" ${off ? "disabled" : ""} aria-label="Question ${k + 1}${a ? ", answered" : ""}${run.marks[q.n] ? ", marked" : ""}">${k + 1}</button>`;
        }).join("")}</div></div>`).join("")}</div>`;
    S.host.append(el);
    const sh = $(".ex-sheet", el);
    if (sh && keep) sh.scrollTop = keep;
    $("[data-no]", el).addEventListener("click", () => { S.sheet = false; overlays(); });
    // The bubble of the question on screen only closes the sheet (it must not redraw it: listening would replay).
    $$(".ex-bub:not([disabled])", el).forEach((b) => b.addEventListener("click", () => {
      if (+b.dataset.k === run.pos) { if (!dock) S.sheet = false; return overlays(); }
      if (!dock) S.sheet = false;
      go((r) => R.goto(r, +b.dataset.k));
    }));
    if (!keep) $(".ex-bub.cur", el)?.scrollIntoView?.({ block: "center" });
  }
  el.addEventListener("click", (e) => { if (e.target === el && !dock) { S.sheet = false; S.sure = null; overlays(); } });
  if (!was && !dock) $("button", el)?.focus({ preventScroll: true }); // a docked sheet never takes focus
}

/* ---------- Hand in ---------- */
function confirmPage() {
  const { run } = S, un = R.unanswered(run), sum = un.reduce((a, b) => a + b, 0);
  S.host.innerHTML = `<div class="panel ex-card">
    <button class="btn ghost ex-leave" type="button" data-leave>Leave</button>
    <div class="ex-no">交卷</div><h2 class="ex-title">Hand in?</h2>
    <table class="ex-parts"><tbody>${run.paper.parts.map((p, i) => `<tr><td>${NUM[i + 1]}</td><td>${esc(p.cn)} <span class="muted">${esc(p.en)}</span></td><td class="num">${un[i] ? un[i] + " unanswered" : "all answered"}</td></tr>`).join("")}
      <tr class="ex-sum"><td></td><td>${sum ? `${sum} unanswered in all` : "Everything is answered"} · ${mmss(run.left)} left</td><td></td></tr></tbody></table>
    <div class="controls"><button class="btn primary big" type="button" id="exHand">交卷 Hand in</button><button class="btn big" type="button" id="exBackPaper">Back to the paper</button></div>
  </div>`;
  wireLeave();
  $("#exHand").addEventListener("click", () => finish(false));
  $("#exBackPaper").addEventListener("click", () => go(R.backToPart));
}

function finish(timeUp) {
  flush(); S.last = null;
  const run = timeUp ? S.run : R.handIn(S.run);
  const me = S, { host, book, test } = S;
  me.over = true; me.token++; me.run = run;
  clearWriters(); stopSpeech(); clearSaved();
  const show = () => {
    if (S !== me) return;
    showResult({
      book, test, paper: run.paper, answers: run.answers, secs: Math.round(run.spent / 1000), timeUp: !!timeUp, host,
      again: () => { if (S === me) { clearSaved(); me.run = null; me.over = false; me.last = null; render(); } },
    });
    scrollTo(0, 0);
  };
  show(); // on time up too: the result page carries the "time is up" note, and the run is already cleared
}

/* ---------- Keys ---------- */
function keys(e) {
  if (!S) return false;
  if (modal()) return /^[1-9]$/.test(e.key) || e.key === "Enter"; // swallowed: nothing under the overlay changes
  const run = S.run, st = run?.stage;
  const click = (sel) => { const b = $(sel, S.host); if (b && !b.disabled && !b.hidden) { b.click(); return true; } return false; };
  if (e.key === "Enter") {
    if (!run) return click("#exBegin");
    if (st === "card") return click("#exStart");
    if (st === "q") return click("#exNext");
    return false;
  }
  if (st !== "q") return false;
  if (/^[1-9]$/.test(e.key)) { const b = $$(".ex-choices .choice", S.host)[+e.key - 1]; if (b) { b.click(); return true; } return false; }
  if (e.key === "ArrowLeft") return click("#exPrev");
  if (e.key === "ArrowRight") return run.pos < run.paper.parts[run.part].questions.length - 1 && click("#exNext");
  if (e.key.toLowerCase() === "m") return click("#exMark");
  return false;
}
