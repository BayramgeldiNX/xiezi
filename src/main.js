import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";
import { $, $$, NUM, esc } from "./lib/util.js";
import { tonePy } from "./lib/pinyin.js";
import { stopSpeech } from "./lib/speech.js";
import { clearWriters } from "./lib/draw.js";
import { icon } from "./lib/icons.js";
import { BOOKS, LESSONS, READINGS, bookOf, lessonIndex, lessonChars, wordChars } from "./data/index.js";
import { app, TAB_NAME } from "./app.js";
import * as progress from "./progress/store.js";
import { charStatus, wordStatus } from "./progress/model.js";
import { renderWords, renderWord, markWords, writeKey } from "./views/write.js";
import { dictRedraw } from "./views/dictation.js";
import { cardsKey } from "./views/cards.js";
import { tonesKey } from "./views/tones.js";
import { openPractice, runMode, SKILLS } from "./views/practice.js";
import { openReview, dueCount } from "./views/bookreview.js";
import { hideGloss } from "./views/reading.js";
import { initAccountChip } from "./views/account.js";
import { initSync } from "./sync/sync.js";
import { initPWA } from "./pwa.js";

const TABS = ["write", "listen", "speak", "read", "words"];
// Tabs of older versions (saved places, old links) → their new home.
const OLD_TABS = { dict: "write", review: "write", cards: "words", tones: "listen" };

/* ---------- Pages ----------
   #/                           home
   #/books                      all books
   #/book/<book>[/review]       one book: its lessons, or its review
   #/lesson/<book>/<n>/<tab>    a lesson (tabs: write, listen, speak, read, words)
   Each page has its own address, so the Android / browser back gesture steps back one page. */
const PAGES = ["home", "booksView", "bookView", "lessonView"];
let current = "home";
function showPage(id) {
  clearWriters();
  stopSpeech();
  hideGloss();
  current = id;
  for (const p of PAGES) $("#" + p).hidden = p !== id;
  scrollTo(0, 0);
}
const go = (hash) => { if (location.hash !== hash) location.hash = hash; else route(); };
const setHash = (hash) => history.replaceState(history.state, "", hash);
const pageOf = (url) => new URL(url).hash || "#/";

function route() {
  const [, page, a, b, c] = location.hash.split("/");
  if (page === "books") return showBooks();
  if (page === "book" && BOOKS.some((x) => x.id === a)) return showBook(a, b === "review" ? "review" : "lessons");
  if (page === "lesson") {
    const li = lessonIndex(`${a}/${b}`);
    if (li >= 0) {
      const saved = place();
      return openLesson(li, saved?.lesson === li ? saved.word : 0, c);
    }
  }
  showHome();
}
addEventListener("hashchange", (e) => {
  // Remember which page this one was opened from, so the back button can step back in history.
  if (!history.state) history.replaceState({ from: pageOf(e.oldURL) }, "");
  route();
});

// Leave a page the way the back gesture would, so history stays tidy.
function back(to) {
  const from = history.state?.from;
  if (from && (from === to || (to === "#/" && (from === "#" || from === "#/")))) history.back();
  else go(to);
}
const upFrom = () => ({
  booksView: "#/", bookView: "#/books",
  lessonView: `#/book/${app.L()?.book}`,
})[current];

// Last place (per device). Older versions stored the lesson's position and other tab names.
function place() {
  const p = progress.place.get();
  if (!p) return null;
  const li = p.lid ? lessonIndex(p.lid) : typeof p.lesson === "number" && LESSONS[p.lesson] ? p.lesson : -1;
  const tab = TABS.includes(p.tab) ? p.tab : OLD_TABS[p.tab] || "write";
  return li >= 0 ? { lesson: li, word: p.word || 0, tab } : null;
}

/* ---------- Progress summaries ---------- */
function lessonProgress(l) {
  const chars = lessonChars(l);
  const mastered = chars.filter((c) => charStatus(progress.get("w:" + c)) === "mastered").length;
  const known = l.words.filter((w) => wordStatus({ word: w.w, list: wordChars(w) }, progress.get) === "known").length;
  return { chars: chars.length, mastered, known };
}
function sumProgress(lessons) {
  const all = lessons.map(lessonProgress);
  return { chars: all.reduce((t, p) => t + p.chars, 0), mastered: all.reduce((t, p) => t + p.mastered, 0) };
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/* ---------- Home ---------- */
function greeting(d = new Date()) {
  const h = d.getHours();
  const [cn, py] = h < 5 ? ["晚上好", "Wǎnshang hǎo"] : h < 11 ? ["早上好", "Zǎoshang hǎo"] : h < 13 ? ["中午好", "Zhōngwǔ hǎo"] : h < 18 ? ["下午好", "Xiàwǔ hǎo"] : ["晚上好", "Wǎnshang hǎo"];
  const week = "日一二三四五六"[d.getDay()];
  return { cn, py, date: `${d.getMonth() + 1}月${d.getDate()}日 · 星期${week}` };
}

function showHome() {
  showPage("home");
  document.title = "写字本";
  const g = greeting();
  $("#greetCn").textContent = g.cn;
  $("#greetPy").innerHTML = tonePy(g.py);
  $("#greetDate").textContent = g.date;
  $("#heroPy").innerHTML = tonePy("Bái Huáichéng de xiězìběn");
  renderHub();
  const saved = place();
  const r = $("#resume");
  if (saved) {
    const les = LESSONS[saved.lesson], w = les.words[saved.word] || les.words[0];
    r.innerHTML = `<span class="play" aria-hidden="true">${icon("play")}</span><span class="txt"><b>Continue</b><span>${les.cn} ${esc(les.title)} · ${saved.tab === "write" ? w.w + " · " : ""}${TAB_NAME[saved.tab]}</span></span><span class="chev">${icon("next")}</span>`;
    r.onclick = () => go(`#/lesson/${les.id}/${saved.tab}`);
    r.hidden = false;
  } else r.hidden = true;
}

function renderHub() {
  const p = sumProgress(LESSONS);
  const due = BOOKS.reduce((n, b) => n + dueCount(b), 0);
  $("#hubBar").style.width = `${pct(p.mastered, p.chars)}%`;
  $("#hubBooksSub").textContent = BOOKS.map((b) => `${b.title} · ${b.part}`).join(" / ");
  $("#hubMeta").textContent = `${LESSONS.length} lesson${LESSONS.length > 1 ? "s" : ""} · ${p.mastered}/${p.chars} characters mastered${due ? ` · ${due} to review` : ""}`;
}

/* ---------- Books ---------- */
function showBooks() {
  showPage("booksView");
  document.title = "Books · 写字本";
  $("#bookList").innerHTML = BOOKS.map((b) => {
    const p = sumProgress(b.lessons), due = dueCount(b);
    return `<button class="book-card" type="button" data-book="${b.id}">
      <span class="cover" style="--book:${b.color || "var(--cta)"}" aria-hidden="true">${b.title}</span>
      <span class="book-txt"><b>${b.title}</b><span>${b.part} · ${esc(b.en || "")}</span>
        <span>${b.lessons.length} lesson${b.lessons.length > 1 ? "s" : ""}${due ? ` · <span class="due">${due} to review</span>` : ""}</span>
        <span class="lp"><span class="lp-bar" aria-hidden="true"><i style="width:${pct(p.mastered, p.chars)}%"></i></span><span class="lp-txt">${p.mastered}/${p.chars} characters mastered</span></span></span>
      <span class="chev" aria-hidden="true">${icon("next")}</span>
    </button>`;
  }).join("") + `<div class="book-soon">More books coming: send a PDF or photos of the lesson pages.</div>`;
  $$("[data-book]", $("#bookList")).forEach((el) => el.addEventListener("click", () => go(`#/book/${el.dataset.book}`)));
}

let openBookId = null;
function showBook(id, section = "lessons") {
  if (current !== "bookView" || openBookId !== id) showPage("bookView");
  else { clearWriters(); stopSpeech(); hideGloss(); }
  openBookId = id;
  const book = BOOKS.find((b) => b.id === id);
  document.title = `${book.title} · 写字本`;
  $("#bookEyebrow").textContent = `${book.part} · ${book.en || ""}`;
  $("#bookTitle").textContent = book.title;
  const due = dueCount(book);
  $("#reviewDue").textContent = due;
  $("#reviewDue").hidden = !due;
  $$("[data-btab]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.btab === section));
  $("#lessonCards").hidden = section !== "lessons";
  $("#bookReview").hidden = section !== "review";
  if (section === "review") openReview(book, "#bookReview");
  else renderLessonList(book);
}
$$("[data-btab]").forEach((b) => b.addEventListener("click", () => {
  setHash(`#/book/${openBookId}${b.dataset.btab === "review" ? "/review" : ""}`);
  showBook(openBookId, b.dataset.btab);
}));

function renderLessonList(book) {
  const list = $("#lessonCards");
  list.innerHTML = "";
  book.lessons.forEach((les) => {
    const p = lessonProgress(les);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lesson-row";
    b.innerHTML = `<span class="num">${NUM[les.n] || les.n}</span>
      <span class="txt"><b>${les.title}</b><span>Lesson ${les.n} · ${les.words.length} words · ${p.chars} characters</span>
        <span class="lp"><span class="lp-bar" aria-hidden="true"><i style="width:${pct(p.mastered, p.chars)}%"></i></span><span class="lp-txt">${p.mastered}/${p.chars} characters mastered · ${p.known} words known</span></span></span>
      <span class="chev" aria-hidden="true">${icon("next")}</span>`;
    b.addEventListener("click", () => {
      const li = lessonIndex(les.id);
      if (place()?.lesson !== li) progress.place.set({ lid: les.id, word: 0, tab: "write" });
      go(`#/lesson/${les.id}/${place()?.tab || "write"}`);
    });
    list.appendChild(b);
  });
  const n = book.lessons.length + 1;
  const soon = document.createElement("div");
  soon.className = "lesson-row soon";
  soon.innerHTML = `<span class="num">${NUM[n] || n}</span><span class="txt"><b>Lesson ${n} · coming soon</b></span>`;
  list.appendChild(soon);
}

/* ---------- Lesson: 写 听 说 读 词 ---------- */
function openLesson(li, wi = 0, tab = "write") {
  showPage("lessonView");
  app.lesson = li;
  app.word = Math.min(wi, LESSONS[li].words.length - 1);
  const L = app.L(), book = bookOf(L);
  $("#lessonEyebrow").textContent = `${book.title} · ${L.cn}`;
  $("#lessonTitle").textContent = L.title;
  document.title = `${L.title} · 写字本`;
  renderWords();
  showTab(TABS.includes(tab) ? tab : OLD_TABS[tab] || "write");
}

// The words and texts every exercise of this lesson uses.
const lessonCtx = () => {
  const L = app.L();
  return { words: L.words.map((w) => ({ ...w, lesson: L.id })), readings: READINGS.filter((r) => r.lesson === L.id), lesson: L.n };
};

function showTab(tab) {
  clearWriters();
  stopSpeech();
  hideGloss();
  app.tab = tab;
  $$(".tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
  for (const t of TABS) $("#tab-" + t).hidden = t !== tab;
  if (tab === "write") showWriteStudy();
  else openPractice(`#tab-${tab}`, tab, lessonCtx());
  app.savePlace();
  setHash(`#/lesson/${app.L().id}/${tab}`);
}

// Write tab: stroke order study, with the writing exercises one tap away.
function showWriteStudy() {
  clearWriters();
  $("#writePractice").hidden = true;
  $("#writeStudy").hidden = false;
  $("#writeStrip").hidden = false;
  $("#writeStrip").innerHTML = `<span class="lbl">Practice</span>${SKILLS.write.modes.map((m) =>
    `<button class="btn" type="button" data-wmode="${m.id}"><span class="mini-seal">${m.seal}</span>${m.name}</button>`).join("")}`;
  $$("[data-wmode]").forEach((b) => b.addEventListener("click", () => {
    clearWriters();
    $("#writeStudy").hidden = true;
    $("#writeStrip").hidden = true;
    $("#writePractice").hidden = false;
    runMode("#writePractice", b.dataset.wmode, { ...lessonCtx(), back: showWriteStudy });
  }));
  renderWord(app.word);
}

$$(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
$("#backBtn").addEventListener("click", () => back(upFrom()));
$$("[data-back-to]").forEach((b) => b.addEventListener("click", () => back(b.dataset.backTo)));
$("#openBooks").addEventListener("click", () => go("#/books"));
$("#wordNav").addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { renderWord(app.word + +g.dataset.go); scrollTo({ top: 0, behavior: "smooth" }); }
});

// Synced results from another device: refresh what's on screen without interrupting practice.
progress.onProgress(() => {
  if (current === "home") renderHub();
  else if (current === "bookView" && !$("#lessonCards").hidden) renderLessonList(BOOKS.find((b) => b.id === openBookId) || BOOKS[0]);
  else if (current === "lessonView" && app.tab === "write") markWords();
});

/* ---------- Keyboard (Windows) ---------- */
addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest?.("input, textarea, select, dialog")) return;
  // Let a focused button handle its own Enter / space.
  if ((e.key === "Enter" || e.key === " ") && t.closest?.("button, label")) return;
  if (e.key === "Escape") { if (upFrom()) back(upFrom()); return; }
  if (current !== "lessonView") return;
  const handled = app.tab === "write" ? !$("#writeStudy").hidden && writeKey(e) : app.tab === "words" ? cardsKey(e) : app.tab === "listen" ? tonesKey(e) : false;
  if (handled) e.preventDefault();
});

/* ---------- Full screen (browser tab only; the installed app is already full screen) ---------- */
const fsBtn = $("#fsBtn");
const standalone = matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || navigator.standalone;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const root = document.documentElement;
if (standalone || !(root.requestFullscreen || root.webkitRequestFullscreen)) fsBtn.hidden = true;
else document.body.classList.add("has-fs");
fsBtn.addEventListener("click", async () => {
  try {
    if (fsEl()) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    await (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  } catch {
    $("#fsNote").hidden = false;
  }
});

/* ---------- Resize / rotation: writers have a fixed pixel size, so redraw ---------- */
function redraw() {
  if (current === "lessonView" && app.tab === "write") renderWord(app.word);
  else dictRedraw();
}
const fsSync = () => {
  fsBtn.textContent = fsEl() ? "✕" : "⛶";
  fsBtn.setAttribute("aria-label", fsEl() ? "Exit full screen" : "Full screen");
  clearTimeout(window.__rs);
  window.__rs = setTimeout(redraw, 250);
};
document.addEventListener("fullscreenchange", fsSync);
document.addEventListener("webkitfullscreenchange", fsSync);
// Watch the page width itself: window "resize" is unreliable for rotation and split-screen on tablets.
let lastW = document.body.clientWidth;
function widthChanged() {
  const w = document.body.clientWidth;
  if (Math.abs(w - lastW) < 40) return;
  lastW = w;
  clearTimeout(window.__rs);
  window.__rs = setTimeout(redraw, 250);
}
new ResizeObserver(widthChanged).observe(document.body);
addEventListener("resize", widthChanged);
addEventListener("orientationchange", () => setTimeout(widthChanged, 300));

/* ---------- Boot: the app icon opens Home; a reload stays on the same page ---------- */
initAccountChip();
route();
initSync();
initPWA();
