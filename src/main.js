import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";
import "./lib/settings.js";
import "./lib/theme.js";
import { $, $$, esc } from "./lib/util.js";
import { stopSpeech } from "./lib/speech.js";
import { clearWriters } from "./lib/draw.js";
import { icon } from "./lib/icons.js";
import { BOOKS, LESSONS, READINGS, bookOf, lessonIndex, lessonChars, wordChars, loadStrokes } from "./data/index.js";
import { app, TAB_NAME } from "./app.js";
import * as progress from "./progress/store.js";
import { charStatus } from "./progress/model.js";
import { completion } from "./progress/completion.js";
import { lessonItems } from "./lib/lesson-items.js";
import { renderWords, renderWord, markWords, writeKey } from "./views/write.js";
import { dictRedraw } from "./views/dictation.js";
import { cardsKey } from "./views/cards.js";
import { tonesKey } from "./views/tones.js";
import { openPractice, runMode, SKILLS, modeAvailable } from "./views/practice.js";
import { openReview, dueCount, ALL_BOOKS } from "./views/bookreview.js";
import { openTyping, typingDue } from "./views/typing.js";
import "./views/charsheet.js";
import { openSearch } from "./views/search.js";
import { openNotebook, notebookChanged } from "./views/notebook.js";
import * as notebook from "./notebook/store.js";
import { openRadicals, learnedCount, radicalTotal } from "./views/radicals.js";
import { openPrint } from "./views/printsheet.js";
import { hideGloss } from "./views/reading.js";
import { initAccountChip } from "./views/account.js";
import { initSync } from "./sync/sync.js";
import { showLessonMeter } from "./views/lessonmeter.js";
import { initPWA } from "./pwa.js";
import { animate, slideDirection, slidePage, moveTabPill, watchMotion, forgetQuestion, wireSoftClose } from "./lib/motion.js";

const TABS = ["write", "listen", "speak", "read", "words", "exercises"];
// Tabs of older versions (saved places, old links) → their new home.
const OLD_TABS = { dict: "write", review: "write", cards: "words", tones: "listen" };

/* ---------- Pages ----------
   #/                           home
   #/typing                     typing practice
   #/radicals, #/radical/<r>    Radicals: the list, or one radical
   #/notebook[/<word>]          Notebook: the word list, or one word
   #/books                      all books
   #/book/<book>[/review]       one book: its lessons, or its review
   #/lesson/<book>/<n>/<tab>    a lesson (tabs: write, listen, speak, read, words, exercises)
   #/print/<book>/<n>           printable practice sheet for a lesson
   Each page has its own address, so the Android / browser back gesture steps back one page. */
const PAGES = ["home", "reviewView", "typingView", "searchView", "notebookView", "radicalsView", "booksView", "bookView", "lessonView", "printView"];
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
const EXERCISE_HOSTS = ["tab-listen", "tab-speak", "tab-read", "tab-words", "tab-exercises", "writePractice", "bookReview", "allReview", "typingBody", "notebookBody", "radicalsBody"];
function clearHiddenHosts() {
  for (const id of EXERCISE_HOSTS) {
    const el = $("#" + id);
    if (el && el.firstChild && (el.hidden || el.closest("[hidden]"))) el.replaceChildren();
  }
}
function showPage(id) {
  clearWriters();
  stopSpeech();
  hideGloss();
  forgetQuestion();
  if (id !== "loading") hideLoading();
  current = id;
  for (const p of PAGES) $("#" + p).hidden = p !== id;
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
  if ((page === "lesson" || page === "print") && lessonIndex(`${a}/${b}`) >= 0) {
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
    return openNotebook(word);
  }
  if (page === "radicals" || page === "radical") {
    showPage("radicalsView"); document.title = "Radicals · 写字本";
    let r = null;
    try { r = page === "radical" && a ? decodeURIComponent(a) : null; } catch {}
    return openRadicals(r);
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
  booksView: "#/", reviewView: "#/", typingView: "#/", searchView: "#/", notebookView: location.hash.startsWith("#/notebook/") ? "#/notebook" : "#/", radicalsView: location.hash.startsWith("#/radical/") ? "#/radicals" : "#/", bookView: "#/books", printView: `#/lesson/${printLesson}/write`,
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
  const list = $("#lessonCards");
  list.innerHTML = "";
  book.lessons.forEach((les) => {
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

/* ---------- Lesson: 写 听 说 读 词 练 ---------- */
function openLesson(li, wi = 0, tab = "write") {
  showPage("lessonView");
  app.lesson = li;
  app.word = Math.min(wi, LESSONS[li].words.length - 1);
  const L = app.L(), book = bookOf(L);
  $("#lessonEyebrow").textContent = book.title;
  $("#lessonTitle").textContent = L.title;
  document.title = `${L.title} · 写字本`;
  showLessonMeter(L.id, lessonDone(L), true);
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
  clearWriters();
  $("#writePractice").hidden = true;
  $("#writeStudy").hidden = false;
  $("#writeStrip").hidden = false;
  $("#writeStrip").innerHTML = `<span class="lbl">Practice</span>${SKILLS.write.modes.filter((m) => modeAvailable(m.id, app.L())).map((m) =>
    `<button class="btn ghost" type="button" data-wmode="${m.id}">${m.name}</button>`).join("")}
    <a class="btn ghost" href="#/print/${app.L().id}">Print sheet</a>`;
  $$("[data-wmode]").forEach((b) => b.addEventListener("click", () => {
    clearWriters();
    $("#writeStudy").hidden = true;
    $("#writeStrip").hidden = true;
    $("#writePractice").hidden = false;
    runMode("#writePractice", b.dataset.wmode, { ...lessonCtx(), back: showWriteStudy });
  }));
  renderWord(app.word);
}

$$("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab, true)));
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
progress.onProgress(() => {
  if (current === "home") { renderHub(); renderResume(); }
  else if (current === "bookView" && !$("#lessonCards").hidden) renderLessonList(BOOKS.find((b) => b.id === openBookId) || BOOKS[0]);
  else if (current === "lessonView") {
    showLessonMeter(app.L().id, lessonDone(app.L()), false);
    if (app.tab === "write") markWords();
  }
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
  $$(".tabs").forEach((t) => moveTabPill(t, true));
  // Write tab shows either stroke-order study or a writing exercise; redraw the one on screen.
  if (current === "lessonView" && app.tab === "write" && !$("#writeStudy").hidden) renderWord(app.word);
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
watchMotion($(".wrap"));
wireSoftClose($("#accountSheet"));
wireSoftClose($("#charSheet"));
route();
document.fonts?.ready.then(() => $$(".tabs").forEach((t) => moveTabPill(t, true)));
initSync();
initPWA();
// Load the stroke shapes in the background so the first lesson opens at once.
setTimeout(() => loadStrokes().catch(() => {}), 1500);
