import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";
import "./lib/settings.js";
import "./lib/theme.js";
import { $, $$, esc, store } from "./lib/util.js";
import { stopSpeech } from "./lib/speech.js";
import { clearWriters } from "./lib/draw.js";
import { icon } from "./lib/icons.js";
import { BOOKS, LESSONS, READINGS, bookOf, lessonIndex, lessonChars, wordChars, loadStrokes } from "./data/index.js";
import { app, TAB_NAME } from "./app.js";
import * as progress from "./progress/store.js";
import { onRecord, onSession } from "./lib/sfx.js";
import { charStatus } from "./progress/model.js";
import { completion } from "./progress/completion.js";
import { lessonItems, lessonLeft, available } from "./progress/lesson-exercises.js";
import { renderWords, renderWord, markWords, writeKey } from "./views/write.js";
import * as screen from "./lib/screen.js";
import { openPractice, runMode, SKILLS } from "./views/practice.js";
import { openReview, dueCount, ALL_BOOKS } from "./views/bookreview.js";
import { openTyping, typingDue } from "./views/typing.js";
import "./views/charsheet.js";
import { openSearch } from "./views/search.js";
import { openNotebook, notebookChanged } from "./views/notebook.js";
import * as notebook from "./notebook/store.js";
import { openRadicals, radicalsUp, learnedCount, radicalTotal } from "./views/radicals.js";
import { openPrint } from "./views/printsheet.js";
import { openExam, savedRun } from "./views/exam.js";
import { openBestReport } from "./views/exam-report.js";
import { resultOf, onResults } from "./exam/store.js";
import { bookRows, sealFor, markOf, MAX } from "./exam/rows.js";
import { testOf } from "./exam/plan.js";
import { hideGloss } from "./views/reading.js";
import { initAccountChip, openAccount } from "./views/account.js";
import { initSync } from "./sync/sync.js";
import { showLessonMeter, toggleLeft, noteHtml } from "./views/lessonmeter.js";
import { timerBoot, timerEnter, timerLeave } from "./views/studytimer.js";
import { initPWA } from "./pwa.js";
import { animate, slideDirection, slidePage, moveTabPill, watchMotion, forgetQuestion, wireSoftClose } from "./lib/motion.js";

const TABS = ["write", "listen", "speak", "read", "words", "exercises"];
// Tabs of older versions (saved places, old links) → their new home.
const OLD_TABS = { dict: "write", review: "write", cards: "words", tones: "listen" };

/* ---------- Pages ----------
   #/                           home
   #/typing                     typing practice
   #/radicals[/<mode>]          Radicals: the list, or practice (cards, find, guess, due)
   #/radical/<r>[/<mode>]       one radical, or practice of just that radical
   #/notebook[/<word>]          Notebook: the word list, or one word (#/notebook/-/<kind> is a practice)
   #/books                      all books
   #/book/<book>[/review]       one book: its lessons, or its review
   #/lesson/<book>/<n>/<tab>    a lesson (tabs: write, listen, speak, read, words, exercises)
   #/print/<book>/<n>           printable practice sheet for a lesson
   #/test/<book>/<id>           a timed test (s1…, mid1, mid2, final)
   Each page has its own address, so the Android / browser back gesture steps back one page. */
const PAGES = ["home", "reviewView", "typingView", "searchView", "notebookView", "radicalsView", "booksView", "bookView", "lessonView", "printView", "testView"];
let current = "home";
let printLesson = null;
let lastHash = null;       // the page hash of the last slide, null before the first page
let browserAnimated = false; // the browser already animated this navigation (swipe back)
let slideHint = null;      // a direction for pages of the same depth (next / previous lesson)
// Quiet placeholder for a lesson that takes a moment to load. Always hidden again by showPage.
let loadTimer = 0;
function hideLoading() {
  clearTimeout(loadTimer);
  const el = $("#pageLoading");
  if (el) el.hidden = true;
}
// Exercises find their buttons by id (#qNext, #qStatus…), and document.querySelector returns the first match.
// An old exercise left in a hidden tab or page would catch those lookups, so the visible one never showed
// its answer or Next. Empty every exercise host that is not on screen; it is drawn again when shown.
const EXERCISE_HOSTS = ["tab-listen", "tab-speak", "tab-read", "tab-words", "tab-exercises", "writePractice", "bookReview", "allReview", "typingBody", "notebookBody", "radicalsBody", "testBody"];
function clearHiddenHosts() {
  for (const id of EXERCISE_HOSTS) {
    const el = $("#" + id);
    if (el && el.firstChild && (el.hidden || el.closest("[hidden]"))) el.replaceChildren();
  }
}
// PC sidebar: the section the page belongs to is the chosen one (a lesson belongs to Books).
const SIDE = { home: "home", booksView: "books", bookView: "books", lessonView: "books", printView: "books", testView: "books", reviewView: "review", typingView: "typing", searchView: "search", notebookView: "notebook", radicalsView: "radicals" };
function markSide(id) {
  for (const a of $$("[data-side]")) {
    if (a.dataset.side === SIDE[id]) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}
function showPage(id) {
  screen.leave(); // the old page's microphone, timers, keys and resize handlers end here
  clearWriters();
  stopSpeech();
  hideGloss();
  forgetQuestion();
  if (id !== "loading") hideLoading();
  current = id;
  if (id !== "loading") (id === "lessonView" ? timerEnter : timerLeave)();
  for (const p of PAGES) $("#" + p).hidden = p !== id;
  if (id !== "loading") markSide(id);
  clearHiddenHosts();
  scrollTo(0, 0);
  if (id === "loading") return;
  // The new page slides in; the old one is gone at once. Not on the first page, nor when the hash is unchanged.
  const hash = location.hash || "#/";
  if (lastHash !== null && hash !== lastHash && !browserAnimated) slidePage($("#" + id), slideHint || slideDirection(lastHash, hash));
  lastHash = hash;
  browserAnimated = false;
  slideHint = null;
}
const go = (hash) => { if (location.hash !== hash) location.hash = hash; else route(); };
const setHash = (hash) => history.replaceState(history.state, "", hash);
const pageOf = (url) => new URL(url).hash || "#/";

// A newer route replaces an older one that is still waiting for the stroke shapes.
let routeToken = 0;
async function route() {
  const token = ++routeToken;
  const [, page, a, b, c] = location.hash.split("/");
  if (((page === "lesson" || page === "print") && lessonIndex(`${a}/${b}`) >= 0) || (page === "test" && c !== "report" && BOOKS.some((x) => x.id === a))) {
    // Nothing on screen while the shapes load: no empty Home on a reload, and no lesson to redraw without them.
    showPage("loading");
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      const el = $("#pageLoading");
      if (token !== routeToken || !el || !el.hidden) return;
      el.hidden = false;
      animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
    }, 60);
    try { await loadStrokes(); } catch (e) { console.error(e); hideLoading(); return showHome(); }
    if (token !== routeToken) return;
    hideLoading();
  }
  if (page === "test" && c === "report") { showPage("testView"); const tb = BOOKS.find((x) => x.id === a), tt = tb && testOf(tb, b); document.title = `${tt ? tt.cn + " " : ""}成绩单 · 写字本`; return openBestReport($("#testBody"), a, b, () => back(`#/book/${a}`)); }
  if (page === "test") { showPage("testView"); document.title = "Test · 写字本"; return openExam(a, b); }
  if (page === "books") return showBooks();
  if (page === "print" && lessonIndex(`${a}/${b}`) >= 0) {
    const L = LESSONS[lessonIndex(`${a}/${b}`)];
    showPage("printView"); document.title = `${L.title} · 字帖`; printLesson = L.id; return openPrint(L);
  }
  if (page === "review") { showPage("reviewView"); document.title = "Review · 写字本"; return openReview(ALL_BOOKS, "#allReview"); }
  if (page === "search") { showPage("searchView"); document.title = "Search · 写字本"; return openSearch(); }
  if (page === "notebook") {
    showPage("notebookView"); document.title = "Notebook · 写字本";
    let word = null;
    try { word = a ? decodeURIComponent(a) : null; } catch {}
    return openNotebook(word, b);
  }
  if (page === "radicals" || page === "radical") {
    showPage("radicalsView"); document.title = "Radicals · 写字本";
    let r = null;
    try { r = page === "radical" && a ? decodeURIComponent(a) : null; } catch {}
    return openRadicals(r, page === "radical" ? b : a, c);
  }
  if (page === "typing") { showPage("typingView"); document.title = "Typing · 写字本"; return openTyping(); }
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
  browserAnimated = !!e.hasUAVisualTransition;
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
  booksView: "#/", reviewView: "#/", typingView: "#/", searchView: "#/", notebookView: location.hash.startsWith("#/notebook/") ? "#/notebook" : "#/", radicalsView: radicalsUp(location.hash), bookView: "#/books", printView: `#/lesson/${printLesson}/write`, testView: `#/book/${location.hash.split("/")[2]}`,
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
const countMastered = (chars) => chars.filter((c) => charStatus(progress.get("w:" + c)) === "mastered").length;
// A character shared by several lessons or books counts once.
function sumProgress(lessons) {
  const chars = [...new Set(lessons.flatMap((l) => lessonChars(l)))];
  return { chars: chars.length, mastered: countMastered(chars) };
}
const lessonDone = (l) => completion(lessonItems(l), progress.get);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/* ---------- Home ---------- */
function showHome() {
  showPage("home");
  document.title = "写字本";
  renderHub();
  renderResume();
}

// The Continue card; also redrawn when another device moves the place.
function renderResume() {
  const saved = place();
  const r = $("#resume");
  if (saved) {
    const les = LESSONS[saved.lesson], w = les.words[saved.word] || les.words[0];
    r.innerHTML = `<span class="play" aria-hidden="true">${icon("play")}</span><span class="txt"><b>Continue</b><span>${esc(les.title)} · ${saved.tab === "write" ? w.w + " · " : ""}${TAB_NAME[saved.tab]}</span></span><span aria-hidden="true">${icon("next")}</span>`;
    r.onclick = () => go(`#/lesson/${les.id}/${saved.tab}`);
    r.hidden = false;
  } else r.hidden = true;
}

function renderHub() {
  const p = sumProgress(LESSONS);
  const due = dueCount(ALL_BOOKS);
  $("#typingMeta").textContent = typingDue() ? `${typingDue()} to review` : "Type Chinese or pinyin";
  $("#hubMeta").textContent = `${p.mastered}/${p.chars} characters`;
  const nbDue = notebook.dueWords().length;
  $("#notebookMeta").textContent = nbDue ? `${nbDue} to review` : "Save words from daily life";
  const rl = learnedCount();
  $("#radicalsMeta").textContent = rl ? `${rl} of ${radicalTotal()} learned` : `${radicalTotal()} radicals`;
  $("#reviewMeta").textContent = due ? `${due} to review` : "Nothing to review right now";
}

/* ---------- Books ---------- */
function showBooks() {
  showPage("booksView");
  document.title = "Books · 写字本";
  $("#bookList").innerHTML = BOOKS.map((b) => {
    const p = sumProgress(b.lessons), due = dueCount(b);
    const fin = b.lessons.filter((l) => lessonDone(l).finished).length;
    return `<button class="book-card" type="button" data-book="${b.id}">
      <span class="book-top"><b>${b.title}</b><span class="muted">${b.part}</span><span class="row-n">${fin ? `${fin}/${b.lessons.length} 完 · ` : ""}${p.mastered}/${p.chars} 字</span><span class="chev" aria-hidden="true">${icon("next")}</span></span>
      ${due ? `<span class="muted">${due} to review</span>` : ""}
      ${p.mastered ? `<span class="lp-bar" aria-hidden="true"><i style="width:${pct(p.mastered, p.chars)}%"></i></span>` : ""}
    </button>`;
  }).join("");
  $$(".lp-bar i", $("#bookList")).forEach((i) => animate(i, [{ width: "0%" }, { width: i.style.width }], { duration: 250 }));
  $$("[data-book]", $("#bookList")).forEach((el) => el.addEventListener("click", () => go(`#/book/${el.dataset.book}`)));
}

let openBookId = null;
function showBook(id, section = "lessons", tapped = false) {
  if (current !== "bookView" || openBookId !== id) showPage("bookView");
  else { clearWriters(); stopSpeech(); hideGloss(); }
  openBookId = id;
  const book = BOOKS.find((b) => b.id === id);
  document.title = `${book.title} · 写字本`;
  $("#bookEyebrow").textContent = book.part;
  $("#bookTitle").textContent = book.title;
  const due = dueCount(book);
  $("#reviewDue").textContent = due;
  $("#reviewDue").hidden = !due;
  $$("[data-btab]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.btab === section));
  $("#lessonCards").hidden = section !== "lessons";
  $("#bookReview").hidden = section !== "review";
  if (section === "review") openReview(book, "#bookReview");
  else renderLessonList(book);
  moveTabPill($(".book-tabs"), !tapped);
}
$$("[data-btab]").forEach((b) => b.addEventListener("click", () => {
  setHash(`#/book/${openBookId}${b.dataset.btab === "review" ? "/review" : ""}`);
  showBook(openBookId, b.dataset.btab, true);
}));

function renderLessonList(book) {
  const list = $("#lessonCards"), run = savedRun();
  list.innerHTML = "";
  bookRows(book).forEach((row) => {
    if (row.type === "test") return list.appendChild(testRow(book, row.test, run));
    const les = row.lesson;
    const c = lessonDone(les);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lesson-row";
    b.innerHTML = `<span class="num">${les.n}</span><span class="lr-main"><b>${les.title}</b>${c.pct ? `<span class="lp-bar" aria-hidden="true"><i style="width:${c.pct}%"></i></span>` : ""}</span><span class="done-seal"${c.finished ? ` title="Finished" aria-label="Finished">完` : ` aria-hidden="true">`}</span><span class="row-n">${c.pct ? c.pct + "%" : ""}</span><span class="chev" aria-hidden="true">${icon("next")}</span>`;
    b.addEventListener("click", () => {
      const li = lessonIndex(les.id);
      if (place()?.lesson !== li) progress.place.set({ lid: les.id, word: 0, tab: "write" });
      go(`#/lesson/${les.id}/${place()?.tab || "write"}`);
    });
    list.appendChild(b);
  });
}

// A test between the lessons: a link to its cover, and (after a result) a link to the score report.
function testRow(book, t, run) {
  const best = resultOf(book.id, t.id)?.best, seal = best ? sealFor(best.total) : null;
  const mine = run && run.book === book.id && run.test === t.id;
  const left = mine ? Math.ceil(Math.max(0, run.left) / 1000) : 0;
  const line = [`Lessons ${t.lessons[0].n}${t.lessons.length > 1 ? "–" + t.lessons[t.lessons.length - 1].n : ""}`, `${t.total} questions`, `${t.minutes} min`];
  const quiet = mine ? `In progress · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left` : line.join(" · ") + (best ? ` · best ${best.total} / ${MAX}` : "");
  const row = document.createElement("div");
  row.className = "lesson-row test-row";
  row.dataset.test = t.id;
  const href = `#/test/${esc(book.id)}/${esc(t.id)}`;
  row.innerHTML = `<a class="tr-link" href="${href}"><span class="tr-seal${seal ? " passed" : ""}" aria-hidden="true">${seal || markOf(t)}</span><span class="lr-main"><b>${esc(t.cn)} · ${esc(t.en)}</b><span class="tr-line">${esc(quiet)}</span></span><span class="chev" aria-hidden="true">${icon("next")}</span></a>${best ? `<a class="tr-report" href="${href}/report" aria-label="成绩单 Score report · ${esc(t.cn)} ${esc(t.en)}">成绩单</a>` : ""}`;
  return row;
}

/* ---------- Lesson: 写 听 说 读 词 练 ---------- */
function openLesson(li, wi = 0, tab = "write") {
  showPage("lessonView");
  app.lesson = li;
  app.word = Math.min(wi, LESSONS[li].words.length - 1);
  const L = app.L(), book = bookOf(L);
  $("#lessonEyebrow").textContent = book.title;
  $("#lessonTitle").textContent = L.title;
  document.title = `${L.title} · 写字本`;
  showLessonMeter(L.id, lessonDone(L), true, lessonLeft(L, progress.get));
  renderWords();
  renderLessonNav();
  showTab(TABS.includes(tab) ? tab : OLD_TABS[tab] || "write", false);
}

// Previous / next lesson of the same book, under every tab. The same tab opens there.
function renderLessonNav() {
  const L = app.L(), list = bookOf(L).lessons, i = list.findIndex((l) => l.id === L.id);
  const side = (l, dir) => l
    ? `<button class="btn ghost ${dir}" type="button" data-lesson="${l.id}" data-dir="${dir}" aria-label="${dir === "prev" ? "Previous" : "Next"} lesson: ${esc(l.title)}">
        ${dir === "prev" ? icon("back") : ""}<span class="txt"><small>${dir === "prev" ? "Previous" : "Next"} · ${esc(l.cn)}</small><b>${esc(l.title)}</b></span>${dir === "next" ? icon("next") : ""}
      </button>`
    : "";
  $("#lessonNav").innerHTML = side(list[i - 1], "prev") + side(list[i + 1], "next");
}
// Moving along the book replaces this page in history, so Back still goes up to the book.
$("#lessonNav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lesson]");
  if (!b) return;
  slideHint = b.dataset.dir === "next" ? "forward" : "back";
  setHash(`#/lesson/${b.dataset.lesson}/${app.tab}`);
  route();
});

// The words and texts every exercise of this lesson uses.
const lessonCtx = () => {
  const L = app.L();
  return { words: L.words.map((w) => ({ ...w, lesson: L.id })), readings: READINGS.filter((r) => r.lesson === L.id), lesson: L.n, book: L.book };
};

function showTab(tab, tapped = false) {
  screen.leave();
  clearWriters();
  stopSpeech();
  hideGloss();
  app.tab = tab;
  $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
  for (const t of TABS) $("#tab-" + t).hidden = t !== tab;
  if (tab === "write") $("#writePractice").hidden = true; // showWriteStudy hides it too; hide first so it is emptied
  clearHiddenHosts();
  if (tab === "write") showWriteStudy();
  else openPractice(`#tab-${tab}`, tab, lessonCtx());
  animate($("#tab-" + tab), [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
  moveTabPill($(".tabs:not(.book-tabs)"), !tapped);
  app.savePlace();
  setHash(`#/lesson/${app.L().id}/${tab}`);
}

// Write tab: stroke order study, with the writing exercises one tap away.
function showWriteStudy() {
  screen.leave(); // back from a writing exercise
  clearWriters();
  $("#writePractice").hidden = true;
  $("#writeStudy").hidden = false;
  $("#writeStrip").hidden = false;
  $("#writeStrip").innerHTML = `<span class="lbl">Practice</span>${SKILLS.write.modes.filter((m) => available(m.id, app.L())).map((m) =>
    `<button class="btn ghost" type="button" data-wmode="${m.id}">${m.name}${m.id === "dict" ? noteHtml("write", m.id) : ""}</button>`).join("")}
    <a class="btn ghost" href="#/print/${app.L().id}">Print sheet</a>`;
  $$("[data-wmode]").forEach((b) => b.addEventListener("click", () => {
    clearWriters();
    $("#writeStudy").hidden = true;
    $("#writeStrip").hidden = true;
    $("#writePractice").hidden = false;
    runMode("#writePractice", b.dataset.wmode, { ...lessonCtx(), back: showWriteStudy });
  }));
  renderWord(app.word);
  screen.onKey(writeKey);
  screen.onResize(() => renderWord(app.word));
}

$$("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab, true)));
// The ring opens the list of what is left; a row there opens that exercise.
$("#lessonMeter").addEventListener("click", () => toggleLeft());
$("#lessonLeft").addEventListener("click", (e) => {
  const r = e.target.closest("[data-skill]");
  if (!r) return;
  const { skill, mode } = r.dataset;
  toggleLeft(false);
  showTab(skill, true);
  if (mode) $(`#tab-${skill} [data-mode="${mode}"], #tab-${skill} [data-wmode="${mode}"]`)?.click();
});
$("#backBtn").addEventListener("click", () => back(upFrom()));
$$("[data-back-to]").forEach((b) => b.addEventListener("click", () => back(b.dataset.backTo)));
$("#openBooks").addEventListener("click", () => go("#/books"));
$("#openReview").addEventListener("click", () => go("#/review"));
$("#openTyping").addEventListener("click", () => go("#/typing"));
$("#openSearch").addEventListener("click", () => go("#/search"));
$("#openNotebook").addEventListener("click", () => go("#/notebook"));
$("#openRadicals").addEventListener("click", () => go("#/radicals"));
$("#radicalsBack").addEventListener("click", () => back(upFrom()));
$("#notebookBack").addEventListener("click", () => back(upFrom()));
$("#printBack").addEventListener("click", () => back(upFrom()));
$("#wordNav").addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { renderWord(app.word + +g.dataset.go); scrollTo({ top: 0, behavior: "smooth" }); }
});

// Synced results from another device: refresh what's on screen without interrupting practice.
notebook.onNotebook(() => {
  if (current === "home") renderHub();
  else if (current === "notebookView") notebookChanged();
});
// Test results arriving from sync: the rows on the book page show the new best.
onResults(() => {
  if (current !== "bookView" || $("#lessonCards").hidden) return;
  const book = BOOKS.find((b) => b.id === openBookId) || BOOKS[0], run = savedRun();
  $$("[data-test]", $("#lessonCards")).forEach((old) => {
    const t = testOf(book, old.dataset.test);
    if (!t) return;
    const had = old.contains(document.activeElement), onReport = had && document.activeElement.classList.contains("tr-report");
    const row = testRow(book, t, run);
    old.replaceWith(row);
    if (had) (row.querySelector(onReport ? ".tr-report" : ".tr-link") || row.querySelector(".tr-link")).focus();
  });
});
progress.setHooks({ record: onRecord, session: onSession });
progress.onProgress(() => {
  if (current === "home") { renderHub(); renderResume(); }
  else if (current === "bookView" && !$("#lessonCards").hidden) renderLessonList(BOOKS.find((b) => b.id === openBookId) || BOOKS[0]);
  else if (current === "lessonView") {
    showLessonMeter(app.L().id, lessonDone(app.L()), false, lessonLeft(app.L(), progress.get));
    if (app.tab === "write") markWords();
  }
});

/* ---------- Keyboard (Windows) ---------- */
// Any question with choices, on any page: 1-9 picks a choice, Enter is Next.
function quizKey(e) {
  const page = $("#" + current);
  if (!page) return false;
  if (/^[1-9]$/.test(e.key)) {
    const b = $$(".choices .choice", page)[+e.key - 1];
    if (!b) return false;
    if (!b.disabled) b.click();
    return true;
  }
  const next = $("#qNext", page);
  if (e.key === "Enter" && next && !next.hidden) { next.click(); return true; }
  return false;
}
addEventListener("keydown", (e) => {
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "b" && sideShown()) {
    e.preventDefault();
    return setRail(!railOn());
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest?.("input, textarea, select, dialog")) return;
  // Let a focused button handle its own Enter / space. An answered choice has nothing left to do, so Enter there is Next.
  const onChoice = e.key === "Enter" && t.closest?.(".choice, .tone-opt");
  if ((e.key === "Enter" || e.key === " ") && t.closest?.("button, label, a") && !onChoice) return;
  if (e.key === "Escape") { if (upFrom()) back(upFrom()); return; }
  if (e.key === "/") {
    e.preventDefault();
    // The search page is drawn by the route, so the box is focused after it.
    if (current === "searchView") $("#searchInput")?.focus();
    else { addEventListener("hashchange", () => $("#searchInput")?.focus(), { once: true }); go("#/search"); }
    return;
  }
  // The screen shown answers its own keys first (see lib/screen.js); a question with choices takes the rest.
  if (screen.key(e) || quizKey(e)) e.preventDefault();
});
$("#sideAccount").addEventListener("click", openAccount);

/* ---------- PC sidebar: wide, or folded to a rail of seals (per device) ----------
   index.html sets data-rail before the first paint; the slide itself is CSS (styles/desktop.css). */
const RAIL_KEY = "xz-rail";
const railOn = () => document.documentElement.hasAttribute("data-rail");
const sideShown = () => getComputedStyle($("#side")).display !== "none";
function labelRail() {
  const b = $("#sideToggle"), text = railOn() ? "Show the sidebar" : "Hide the sidebar";
  b.setAttribute("aria-expanded", String(!railOn()));
  b.setAttribute("aria-label", text);
  b.title = `${text} (Ctrl+B)`;
}
function setRail(on) {
  document.documentElement.toggleAttribute("data-rail", on);
  store.set(RAIL_KEY, on);
  labelRail();
  // The page is wider or narrower once the slide ends: writers have a fixed pixel size, so redraw then.
  clearTimeout(window.__rs);
  window.__rs = setTimeout(redraw, 260);
}
$("#sideToggle").addEventListener("click", () => setRail(!railOn()));
labelRail();

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
  $$(".tabs").forEach((t) => moveTabPill(t, true));
  screen.resized(); // stroke-order study or a writing exercise, whichever is on screen
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
watchMotion($(".wrap"));
wireSoftClose($("#accountSheet"));
wireSoftClose($("#charSheet"));
route();
document.fonts?.ready.then(() => $$(".tabs").forEach((t) => moveTabPill(t, true)));
initSync();
initPWA();
// Load the stroke shapes in the background so the first lesson opens at once.
setTimeout(() => loadStrokes().catch(() => {}), 1500);
timerBoot();
