// 复习 Review for one book: per type (vocabulary, listening, writing, speaking, reading, grammar),
// with spaced repetition. A word is due in a type when that type's schedule says so.
import { $, $$, esc, shuffle } from "../lib/util.js";
import { icon } from "../lib/icons.js";
import { wordsOf, READINGS, grammarOf } from "../data/index.js";
import * as progress from "../progress/store.js";
import { latest, nextReview, isDue } from "../progress/model.js";
import { setHost, listenQuiz, vocabQuiz, speak, lessonSentences, grammarQuiz, ui } from "./practice.js";
import { dictIntro } from "./dictation.js";
import { workbookOf, workbookQuiz } from "./workbook.js";
import { orderGame, buildable } from "./reading.js";

const MAX = 10;     // items per type in one session
const MIXED = 12;   // items in a mixed session

// Each type: which results count for its schedule (keys), what its items are, and how it is practiced.
const TYPES = [
  { id: "vocab", seal: "词", name: "Vocabulary", sub: "Meanings and words", keys: ["q:", "f:", "rp:"] },
  { id: "listen", seal: "听", name: "Listening", sub: "Hear a word, pick it or its meaning", keys: ["l:"] },
  { id: "write", seal: "写", name: "Writing", sub: "Write words from sound, pinyin or meaning", keys: ["d:"] },
  { id: "speak", seal: "说", name: "Speaking", sub: "Say words aloud", keys: ["s:"] },
  { id: "read", seal: "读", name: "Reading", sub: "Build sentences from the lessons", keys: ["o:"], sentences: true },
  { id: "grammar", seal: "法", name: "Grammar", sub: "Fill the blank in sentences", keys: ["g:"], grammar: true },
  { id: "workbook", seal: "练", name: "Workbook", sub: "Dialogues, true or false, replies", keys: ["wb:"], workbook: true },
];

let book = null;
let host = "#bookReview";
const body = () => $(host);

function itemsOf(t) {
  const lessons = book.lessons;
  if (t.sentences) return buildable(lessonSentences(wordsOf(lessons), READINGS.filter((r) => r.book === book.id || lessons.some((l) => l.id === r.lesson))))
    .map((s) => ({ id: s.hz, s }));
  if (t.grammar) return grammarOf(lessons).map((d) => ({ id: d.id, d }));
  if (t.workbook) return workbookOf(lessons).map((d) => ({ id: d.id, d }));
  return wordsOf(lessons).map((w) => ({ id: w.w, w }));
}

// For every item of a type: its schedule state.
function scan(t) {
  if (t.soon) return { due: [], practiced: 0, total: 0, next: null };
  const now = Date.now();
  const rows = itemsOf(t).map((it) => {
    const stat = latest(t.keys.map((k) => progress.get(k + it.id)));
    return { ...it, stat, due: isDue(stat, now), at: nextReview(stat) };
  });
  const practiced = rows.filter((r) => r.stat);
  const due = practiced.filter((r) => r.due).sort((a, b) => a.at - b.at);
  const upcoming = practiced.filter((r) => !r.due).sort((a, b) => a.at - b.at);
  return { due, upcoming, practiced: practiced.length, total: rows.length, next: upcoming[0]?.at ?? null };
}

export function dueCount(b) {
  const prev = book;
  book = b;
  const n = TYPES.reduce((t, ty) => t + scan(ty).due.length, 0);
  book = prev;
  return n;
}

const when = (t) => {
  const d = Math.ceil((t - Date.now()) / 864e5);
  return d <= 1 ? "tomorrow" : d < 7 ? `in ${d} days` : d < 30 ? `in ${Math.round(d / 7)} week${d >= 14 ? "s" : ""}` : `in ${Math.round(d / 30)} month${d >= 60 ? "s" : ""}`;
};

/* ---------- Review home ---------- */
export function openReview(b, hostSel = "#bookReview") {
  book = b;
  host = hostSel;
  setHost(host, { back: showReview, lesson: 0 });
  showReview();
}

// The red count on the book's Review tab.
function updateBadge(total) {
  const b = $("#reviewDue");
  if (!b) return;
  b.textContent = total;
  b.hidden = !total;
}

function showReview() {
  const scans = TYPES.map((t) => ({ t, ...scan(t) }));
  const total = scans.reduce((n, s) => n + s.due.length, 0);
  updateBadge(total);
  const practicedAny = scans.some((s) => s.practiced);
  const nextAll = scans.map((s) => s.next).filter(Boolean).sort((a, b) => a - b)[0];
  body().innerHTML = `
    <div class="panel review-hero">
      <span class="lbl">复习 · Review · ${esc(book.title)}</span>
      ${total ? `<div class="score">${total} <small class="muted">to review</small></div>
        <p class="note">Words you practiced before and are ready to refresh. A mix of all types, about ${Math.min(total, MIXED)} questions.</p>
        <button class="btn primary big" type="button" id="rvMixed">${icon("play")} 开始复习 Start review</button>`
      : practicedAny ? `<div class="score">全对！</div><p>Nothing to review right now. Next review ${nextAll ? when(nextAll) : "after more practice"}.</p>
        <button class="btn big" type="button" id="rvAhead">Practice ahead anyway</button>`
      : `<p>Nothing to review yet. Practice this book's lessons first; every word you practice comes back here at the right time.</p>`}
    </div>
    <div class="mode-grid review-types">${scans.map(({ t, due, practiced, total: n }) => `
      <button class="mode-card" type="button" data-type="${t.id}" ${t.soon || (!due.length && !practiced) ? "disabled" : ""}>
        <span class="seal ${due.length ? "red" : ""}">${t.seal}</span>
        <b>${t.name} ${due.length ? `<span class="due">${due.length} due</span>` : ""}</b>
        <small>${t.soon ? t.sub : `${t.sub} · ${practiced}/${n} practiced`}</small>
      </button>`).join("")}</div>
    ${workbookOf(book.lessons).length ? `<div class="panel">
      <span class="lbl">模拟考试 · Practice test</span>
      <p class="note">A test in the HSK style from the whole book: 10 listening questions (dialogues), then 10 reading questions (true or false, replies, grammar). Results count for your review too.</p>
      <button class="btn big" type="button" id="rvTest">${icon("play")} Start the practice test</button>
    </div>` : ""}
    <p class="note">How it works: each word has its own schedule for each type. Right answers come back later each time (1 day, 3 days, 1 week, 2 weeks, 1 month…); wrong answers come back the next day.</p>`;
  $("#rvMixed")?.addEventListener("click", () => startMixed(scans, false));
  $("#rvAhead")?.addEventListener("click", () => startMixed(scans, true));
  $("#rvTest")?.addEventListener("click", startTest);
  $$("[data-type]", body()).forEach((b) => b.addEventListener("click", () => {
    const s = scans.find((x) => x.t.id === b.dataset.type);
    const items = (s.due.length ? s.due : s.upcoming).slice(0, MAX);
    runChain([{ t: s.t, items }]);
  }));
}

/* ---------- Sessions ---------- */
// Mixed: a few due items of each type (or the soonest ones when practicing ahead), one type after another.
function startMixed(scans, ahead) {
  const pools = scans.filter((s) => !s.t.soon).map((s) => ({ t: s.t, list: [...(ahead ? s.upcoming : s.due)] }));
  const picked = pools.map((p) => ({ t: p.t, items: [] }));
  // Take items round-robin across types so every type is represented.
  for (let n = 0; n < MIXED; ) {
    let took = false;
    pools.forEach((p, i) => { if (n < MIXED && p.list.length) { picked[i].items.push(p.list.shift()); n++; took = true; } });
    if (!took) break;
  }
  runChain(picked.filter((p) => p.items.length));
}

// Practice test: part 1 listening (dialogues), part 2 reading (true/false, replies, grammar).
function startTest() {
  const wb = workbookOf(book.lessons);
  const pick = (list, n) => shuffle(list).slice(0, n);
  const listening = pick(wb.filter((d) => d.kind === "dialog"), 10);
  const reading = [...pick(wb.filter((d) => d.kind === "judge"), 4), ...pick(wb.filter((d) => d.kind === "reply"), 3)];
  const grammar = pick(grammarOf(book.lessons), 3);
  runChain([
    { t: { id: "test-listen", seal: "听", name: "Part 1 · Listening" }, items: listening.map((d) => ({ d })) },
    { t: { id: "test-read", seal: "读", name: "Part 2 · Reading" }, items: reading.map((d) => ({ d })) },
    ...(grammar.length ? [{ t: { id: "grammar", seal: "法", name: "Part 2 · Grammar" }, items: grammar.map((d) => ({ d })) }] : []),
  ].filter((s) => s.items.length));
}

function runChain(steps) {
  const results = [];
  const next = (res) => {
    if (res) results.push(res);
    const step = steps.shift();
    if (!step) return summary(results);
    runStep(step, next);
  };
  next();
}

function runStep({ t, items }, done) {
  scrollTo(0, 0);
  // One name per type in the summary, whatever the exercise calls itself.
  const then = (res) => done({ ...res, title: `${t.seal} · ${t.name}` });
  const pool = wordsOf(book.lessons);
  const words = items.map((i) => i.w);
  switch (t.id) {
    case "vocab": return vocabQuiz({ items: shuffle(words), pool, title: "词 · Vocabulary review", kind: "review-vocab", then });
    case "listen": return listenQuiz({ items: shuffle(words), pool, title: "听 · Listening review", kind: "review-listen", then });
    case "write": return dictIntro({ host, words, prompt: "mixed", kind: "review-write", back: showReview, autostart: true, then });
    case "speak": return speak({ title: "Speaking review", items: shuffle(words).map((w) => ({ w, text: w.w, py: w.py, en: w.en })), then });
    case "read": return orderGame(ui, items.map((i) => i.s), { all: true, then });
    case "test-listen": case "test-read": return workbookQuiz(ui, { items: items.map((i) => i.d), title: `模拟考试 · ${t.name}`, kind: "practice-test", then });
    case "workbook": return workbookQuiz(ui, { items: shuffle(items.map((i) => i.d)), title: "练 · Workbook review", kind: "review-workbook", then });
    case "grammar": return grammarQuiz({ items: shuffle(items.map((i) => i.d)), title: "法 · Grammar review", kind: "review-grammar", then });
  }
}

function summary(results) {
  const right = results.reduce((n, r) => n + r.right, 0), total = results.reduce((n, r) => n + r.total, 0);
  const missed = [...new Set(results.flatMap((r) => r.missed))];
  updateBadge(TYPES.reduce((n, t) => n + scan(t).due.length, 0));
  body().innerHTML = `<div class="panel">
    <span class="lbl">复习完了 · Review done</span>
    <div class="score">${right} / ${total}</div>
    <ul class="recent">${results.map((r) => `<li><span>${esc(r.title)}</span><b>${r.right} / ${r.total}</b></li>`).join("")}</ul>
    ${missed.length ? `<p>These come back tomorrow:</p><div class="result-list">${missed.map((w) => `<span>${esc(w)}</span>`).join("")}</div>`
      : `<p>全对！Everything right. These come back later, when they need a refresh.</p>`}
    <div class="controls"><button class="btn primary big" type="button" id="rvDone">Back to review</button></div>
  </div>`;
  $("#rvDone").addEventListener("click", showReview);
}
