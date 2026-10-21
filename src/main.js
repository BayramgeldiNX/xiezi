import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./styles.css";
import { $, $$, NUM } from "./lib/util.js";
import { tonePy } from "./lib/pinyin.js";
import { stopSpeech } from "./lib/speech.js";
import { clearWriters } from "./lib/draw.js";
import { LESSONS, lessonChars, wordChars } from "./data/index.js";
import { app, TAB_NAME } from "./app.js";
import * as progress from "./progress/store.js";
import { charStatus, wordStatus } from "./progress/model.js";
import { renderWords, renderWord, markWords, writeKey } from "./views/write.js";
import { dictIntro, dictRedraw } from "./views/dictation.js";
import { cardsStart, cardsKey } from "./views/cards.js";
import { tonesIntro, tonesKey } from "./views/tones.js";
import { reviewIntro } from "./views/review.js";
import { initAccountChip } from "./views/account.js";
import { initSync } from "./sync/sync.js";
import { initPWA } from "./pwa.js";

const TABS = ["write", "dict", "cards", "tones", "review"];

/* ---------- Start menu ---------- */
function lessonProgress(l) {
  const chars = lessonChars(l);
  const mastered = chars.filter((c) => charStatus(progress.get("w:" + c)) === "mastered").length;
  const known = l.words.filter((w) => wordStatus({ word: w.w, list: wordChars(w) }, progress.get) === "known").length;
  return { chars: chars.length, mastered, known };
}

function showHome() {
  clearWriters();
  stopSpeech();
  $("#home").hidden = false;
  $("#lessonView").hidden = true;
  document.title = "写字本";
  $("#heroPy").innerHTML = tonePy("Bái Huáichéng de xiězìběn");
  renderLessonList();
  const saved = progress.place.get();
  const r = $("#resume");
  if (saved && LESSONS[saved.lesson]) {
    const les = LESSONS[saved.lesson], w = les.words[saved.word] || les.words[0];
    r.innerHTML = `<span class="play" aria-hidden="true">▶</span><span class="txt"><b>Continue</b><span>${les.cn} · ${w.w} · ${TAB_NAME[saved.tab] || TAB_NAME.write}</span></span>`;
    r.onclick = () => openLesson(saved.lesson, saved.word, saved.tab);
    r.hidden = false;
  } else r.hidden = true;
  scrollTo(0, 0);
}

function renderLessonList() {
  const list = $("#lessonCards");
  list.innerHTML = "";
  LESSONS.forEach((les, i) => {
    const p = lessonProgress(les);
    const pct = Math.round((p.mastered / p.chars) * 100);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lesson-row";
    b.innerHTML = `<span class="num">${NUM[les.n] || les.n}</span>
      <span class="txt"><b>${les.title}</b><span>Lesson ${les.n} · ${les.words.length} words · ${p.chars} characters</span>
        <span class="lp"><span class="lp-bar" aria-hidden="true"><i style="width:${pct}%"></i></span><span class="lp-txt">${p.mastered}/${p.chars} characters mastered · ${p.known} words known</span></span></span>
      <span class="chev" aria-hidden="true">›</span>`;
    b.addEventListener("click", () => openLesson(i, 0, "write"));
    list.appendChild(b);
  });
  const n = LESSONS.length + 1;
  const soon = document.createElement("div");
  soon.className = "lesson-row soon";
  soon.innerHTML = `<span class="num">${NUM[n] || n}</span><span class="txt"><b>Lesson ${n} · coming soon</b></span>`;
  list.appendChild(soon);
}

/* ---------- Lesson view ---------- */
function openLesson(li, wi = 0, tab = "write") {
  app.lesson = li;
  app.word = Math.min(wi, LESSONS[li].words.length - 1);
  $("#home").hidden = true;
  $("#lessonView").hidden = false;
  $("#lessonEyebrow").textContent = `${app.L().cn} · Lesson ${app.L().n}`;
  $("#lessonTitle").textContent = app.L().title;
  document.title = `${app.L().title} · 写字本`;
  renderWords();
  showTab(TABS.includes(tab) ? tab : "write");
  scrollTo(0, 0);
}

function showTab(tab) {
  clearWriters();
  stopSpeech();
  app.tab = tab;
  $$(".tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
  for (const t of TABS) $("#tab-" + t).hidden = t !== tab;
  if (tab === "write") renderWord(app.word);
  else if (tab === "dict") dictIntro();
  else if (tab === "cards") cardsStart();
  else if (tab === "tones") tonesIntro();
  else reviewIntro();
  app.savePlace();
}

$$(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
$("#backBtn").addEventListener("click", showHome);
$("#wordNav").addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) { renderWord(app.word + +go.dataset.go); scrollTo({ top: 0, behavior: "smooth" }); }
});

// Synced results from another device: refresh what's on screen without interrupting practice.
progress.onProgress(() => {
  if (!$("#home").hidden) renderLessonList();
  else if (app.tab === "write") markWords();
});

/* ---------- Keyboard (Windows) ---------- */
addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest?.("input, textarea, select, dialog")) return;
  // Let a focused button handle its own Enter / space.
  if ((e.key === "Enter" || e.key === " ") && t.closest?.("button, label")) return;
  if ($("#lessonView").hidden) return;
  if (e.key === "Escape") { showHome(); return; }
  const handled = app.tab === "write" ? writeKey(e) : app.tab === "cards" ? cardsKey(e) : app.tab === "tones" ? tonesKey(e) : false;
  if (handled) e.preventDefault();
});

/* ---------- Full screen (browser tab only; the installed app is already full screen) ---------- */
const fsBtn = $("#fsBtn");
const standalone = matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || navigator.standalone;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const root = document.documentElement;
if (standalone || !(root.requestFullscreen || root.webkitRequestFullscreen)) fsBtn.hidden = true;
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
  if ($("#lessonView").hidden) return;
  if (app.tab === "write") renderWord(app.word);
  else if (app.tab === "dict") dictRedraw();
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

/* ---------- Boot: always open on the start menu ---------- */
initAccountChip();
showHome();
initSync();
initPWA();
