// Notebook (生词本): words saved from daily life, separate from the books.
// List page: add box, Review, search, the words. Word page: edit, sentence, tricks, stroke order.
// All user and Claude text is plain text and goes through esc(); only CHARS[c].tip (repo HTML) is inserted as HTML.
import { $, $$, esc } from "../lib/util.js";
import { tonePy, syllables } from "../lib/pinyin.js";
import { sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { matchesWord } from "../lib/search.js";
import { lookup, saveForOffline, charParts } from "../lib/dict.js";
import { gridSVG, makeWriter, trackWriter } from "../lib/draw.js";
import { CHARS, LESSONS, bookOf, wordsOf, ensureChars, STROKE_DATA } from "../data/index.js";
import * as nb from "../notebook/store.js";
import { reviewDue, practice } from "./notebook-review.js";

const isHan = (c) => /\p{Script=Han}/u.test(c);
export const hanChars = (w) => [...new Set(w)].filter(isHan);
const body = () => $("#notebookBody");
const MAX_LEN = 12;

let view = { kind: "list", word: null }; // what is on screen; "review" while a review runs
let query = "";
let ownEdit = false; // saving a field must not redraw the page under the button being tapped

// Back-to-top button: shows after scrolling down on the Notebook page.
const topBtn = $("#nbTop");
const syncTop = () => { topBtn.hidden = $("#notebookView").hidden || scrollY < 600; };
addEventListener("scroll", syncTop, { passive: true });
topBtn.addEventListener("click", () => {
  scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  topBtn.blur();
});

export function openNotebook(word) {
  setTimeout(syncTop);
  // Quietly keep the whole dictionary on the device for offline lookups.
  setTimeout(() => (window.requestIdleCallback || ((f) => f()))(() => saveForOffline()), 3000);
  const e = word && nb.getWord(word);
  if (e && !e.deleted) return wordPage(word);
  return listPage();
}

// Redraw after a change from another device or from Claude, without disturbing typing or a running review.
export function notebookChanged() {
  if (view.kind === "review" || ownEdit) return;
  const typing = document.activeElement;
  // The list redraw leaves the add box alone, so a saved word appears while the keyboard stays open.
  if (body().contains(typing) && typing.matches("input, textarea") && typing.id !== "nbInput") return;
  if (view.kind === "word") { const e = nb.getWord(view.word); return e && !e.deleted ? wordPage(view.word) : listPage(); }
  renderList();
}

/* ---------- list ---------- */
function listPage() {
  view = { kind: "list", word: null };
  $("#notebookBody").innerHTML = `<div class="panel">
      <form id="nbAdd" class="nb-add" autocomplete="off">
        <input class="search" id="nbInput" type="text" maxlength="${MAX_LEN}" placeholder="Type a new word (汉字)" lang="zh" enterkeyhint="done" aria-label="New word">
        <button class="btn primary" type="submit">Save</button>
      </form>
      <p class="note" id="nbMsg" aria-live="polite"></p>
    </div>
    <div id="nbReviewBox"></div>
    <div class="panel" id="nbListBox"></div>`;
  $("#nbAdd").addEventListener("submit", (ev) => { ev.preventDefault(); addFromInput(); });
  renderList();
}

function renderList() {
  const all = nb.list();
  const due = nb.dueWords().length;
  const rbox = $("#nbReviewBox"), lbox = $("#nbListBox");
  if (!rbox || !lbox) return;
  rbox.innerHTML = all.length ? `<div class="panel">
      <button class="btn primary big" type="button" id="nbReview">${icon("play")} Review${due ? ` · ${due} to review` : ""}</button>
      <div class="controls" role="group" aria-label="Practice everything">
        <button class="btn" type="button" data-nbp="flash">Flashcards</button>
        <button class="btn" type="button" data-nbp="listen">Listening</button>
        <button class="btn" type="button" data-nbp="write">Writing</button>
        <button class="btn" type="button" data-nbp="gap">Sentence gap</button>
      </div></div>` : "";
  const shown = all.filter((e) => matchesWord(e, query));
  lbox.innerHTML = all.length
    ? `<input class="search" id="nbSearch" type="search" placeholder="Search your words" autocomplete="off" value="${esc(query)}" aria-label="Search your words">
      <table class="word-table"><tbody>${shown.map((e) => `<tr class="nb-row" data-open="${esc(e.w)}" tabindex="0" role="link">
        <td class="hz">${esc(e.w)}</td>
        <td>${e.py ? `<span class="py">${tonePy(esc(e.py))}</span><br>` : ""}${e.en ? `<span class="en">${esc(e.en)}</span>` : ""}
          ${e.status === "new" ? `<small class="muted nb-wait">${e.py || e.en ? "" : "Looking up… "}Waiting for Claude</small>` : ""}</td>
        <td class="chev" aria-hidden="true">${icon("next")}</td></tr>`).join("") || `<tr><td class="muted">No words match.</td></tr>`}</tbody></table>`
    : `<p class="muted nb-empty">No words yet. When you meet a new word in daily life, type it above. It is saved here with its pinyin and meaning.</p>`;
  $("#nbReview")?.addEventListener("click", startDue);
  $$("[data-nbp]", rbox).forEach((b) => b.addEventListener("click", () => startPractice(b.dataset.nbp)));
  $("#nbSearch")?.addEventListener("input", (ev) => {
    query = ev.target.value;
    const pos = ev.target.selectionStart;
    renderList();
    const s = $("#nbSearch");
    s.focus();
    s.setSelectionRange(pos, pos);
  });
  $$(".nb-row", lbox).forEach((r) => {
    const open = () => { location.hash = "#/notebook/" + encodeURIComponent(r.dataset.open); };
    r.addEventListener("click", open);
    r.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); } });
  });
}

const leaveReview = () => { listPage(); };
function startDue() { view = { kind: "review" }; reviewDue("#notebookBody", leaveReview); }
function startPractice(kind) { view = { kind: "review" }; practice("#notebookBody", kind, leaveReview); }

async function addFromInput() {
  const input = $("#nbInput"), msg = $("#nbMsg");
  const w = input.value.replace(/\s+/g, "");
  if (!w) return;
  if ([...w].length > MAX_LEN || ![...w].some(isHan)) {
    msg.textContent = `Type 1 to ${MAX_LEN} characters, with at least one Chinese character.`;
    return;
  }
  const had = nb.getWord(w);
  if (had && !had.deleted) { location.hash = "#/notebook/" + encodeURIComponent(w); return; }
  input.value = "";
  nb.addWord(w); // saved at once, even offline
  msg.textContent = `Saved ${w}.`;
  fillFromDictionary(w);
}

// Pinyin and meaning from the dictionary, only into fields that are still empty.
async function fillFromDictionary(w) {
  const found = await lookup(w);
  const e = nb.getWord(w);
  if (!found.length || !e) return;
  const patch = {};
  if (!e.py && found[0].py) patch.py = found[0].py;
  if (!e.en && found[0].en) patch.en = found[0].en;
  if (Object.keys(patch).length) nb.update(w, patch);
}

/* ---------- word page ---------- */
function wordPage(w) {
  view = { kind: "word", word: w };
  const e = nb.getWord(w);
  const chars = hanChars(w);
  // Each character's pinyin as it is read in this word (split the word's pinyin by syllable).
  const charPy = new Map();
  const all = [...w].filter(isHan), sy = (e.py || "").split(/\s+/).filter(Boolean).flatMap((s) => syllables(s).map((x) => x[0]));
  if (sy.length === all.length) all.forEach((c, i) => { if (!charPy.has(c)) charPy.set(c, sy[i]); });
  const inBook = wordsOf(LESSONS).find((x) => x.w === w);
  const L = inBook && LESSONS.find((l) => l.id === inBook.lesson);
  body().innerHTML = `<div class="panel nb-word">
      <div class="nb-head"><span class="nb-hz">${esc(w)}</span>${sayBtns(w, e.py || w)}</div>
      <label class="nb-field">Pinyin<input data-f="py" value="${esc(e.py)}" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
      <label class="nb-field">Meaning<input data-f="en" value="${esc(e.en)}" autocomplete="off"></label>
      <div class="nb-alts" id="nbAlts"></div>
    </div>
    <div class="panel">
      <span class="lbl">Sentence</span>
      ${e.sentence?.cn ? `<p class="nb-sent"><span class="hz">${esc(e.sentence.cn)}</span> ${sayBtns(e.sentence.cn, "sentence", true)}</p>
        <p class="py">${tonePy(esc(e.sentence.py || ""))}</p><p class="muted">${esc(e.sentence.en || "")}</p>`
        : `<p class="muted">${e.status === "new" ? "Waiting for Claude. A short sentence and a memory trick will appear here." : "No sentence yet."}</p>`}
      ${e.wordTrick ? `<span class="lbl">Memory trick</span><p>${esc(e.wordTrick)}</p>` : ""}
    </div>
    <div class="panel">
      <span class="lbl">Characters</span>
      ${chars.map((c) => {
        const tip = CHARS[c]?.tip ? CHARS[c].tip : e.charTricks?.[c] ? esc(e.charTricks[c]) : "";
        const py = charPy.get(c) || CHARS[c]?.py || "";
        return `<div class="nb-char"><button class="cs-chip" type="button" data-stroke="${c}" aria-expanded="false" aria-label="Stroke order of ${c}">
            <b>${c}</b><span class="py">${tonePy(esc(py))}</span><small>Stroke order</small></button>
          <div class="nb-tip">${tip || `<span class="muted">${CHARS[c]?.en ? esc(CHARS[c].en) : ""}</span>`}<div class="nb-parts" data-parts="${c}"></div></div>
          <div class="nb-stroke" hidden></div></div>`;
      }).join("")}
    </div>
    <div class="panel">
      ${L ? `<p class="note">Also in <a class="tap-link" href="#/lesson/${esc(L.id)}/write">${esc(bookOf(L).title)} · ${esc(L.cn)}</a></p>` : ""}
      <div class="controls" id="nbDel"><button class="btn ghost" type="button" id="nbDelBtn">Delete this word</button></div>
    </div>`;
  $$("input[data-f]", body()).forEach((inp) => inp.addEventListener("change", () => {
    const v = inp.value.trim();
    if (v === nb.getWord(w)?.[inp.dataset.f]) return;
    ownEdit = true;
    nb.update(w, { [inp.dataset.f]: v });
    ownEdit = false;
  }));
  $$("[data-stroke]", body()).forEach((b) => b.addEventListener("click", () => toggleStroke(b)));
  $("#nbDelBtn").addEventListener("click", () => {
    $("#nbDel").innerHTML = `<span>Delete ${esc(w)}?</span>
      <button class="btn primary" type="button" id="nbDelYes">Yes, delete</button><button class="btn" type="button" id="nbDelNo">Cancel</button>`;
    $("#nbDelYes").addEventListener("click", () => { nb.remove(w); location.hash = "#/notebook"; });
    $("#nbDelNo").addEventListener("click", () => wordPage(w));
  });
  readingOptions(w);
  partsOf(w);
}

// Radical and parts of each character, from the offline dictionary.
async function partsOf(w) {
  for (const host of $$("[data-parts]", body())) {
    const p = await charParts(host.dataset.parts);
    if (view.word !== w || !p) continue;
    const bit = (x) => `<b class="hz">${esc(x.c)}</b>${x.en ? ` ${esc(x.en)}` : ""}`;
    const lines = [];
    if (p.radical) lines.push(`Radical ${bit(p.radical)}`);
    if (p.parts.length) lines.push(p.parts.map((x) => bit(x) + (x.c === p.sound ? " (sound)" : "")).join(" + "));
    if (!CHARS[p.c]?.tip && p.hint && p.type !== "pictophonetic") lines.push(esc(p.hint));
    if (!CHARS[p.c]?.en && !nb.getWord(w)?.charTricks?.[p.c] && p.en) lines.unshift(esc(p.en));
    host.innerHTML = lines.map((l) => `<small>${l}</small>`).join("");
  }
}

// Other readings of the word (行 xíng / háng): tap one to use it.
async function readingOptions(w) {
  const found = await lookup(w);
  const host = $("#nbAlts");
  if (found.length < 2 || view.word !== w || !host) return;
  host.innerHTML = `<span class="muted">Other readings</span>` + found.map((f, i) =>
    `<button class="btn" type="button" data-alt="${i}"><span class="py">${tonePy(esc(f.py))}</span> ${esc(f.en.slice(0, 40))}</button>`).join("");
  $$("[data-alt]", host).forEach((b) => b.addEventListener("click", () => {
    const f = found[+b.dataset.alt];
    nb.update(w, { py: f.py, en: f.en });
    wordPage(w);
  }));
}

async function toggleStroke(btn) {
  const c = btn.dataset.stroke, box = btn.closest(".nb-char").querySelector(".nb-stroke");
  const open = box.hidden;
  btn.setAttribute("aria-expanded", String(open));
  box.hidden = !open;
  if (!open) return;
  box.innerHTML = `<p class="muted">Loading…</p>`;
  await ensureChars(c);
  if (!STROKE_DATA[c]) { box.innerHTML = `<p class="muted">No stroke order for this character.</p>`; return; }
  box.innerHTML = `<div class="box">${gridSVG()}<div class="hw"></div></div>
    <div class="controls"><button class="btn" type="button">${icon("replay")} Replay</button></div>`;
  const hw = box.querySelector(".hw");
  const wr = trackWriter(makeWriter(hw, c, Math.round(hw.getBoundingClientRect().width) || 200, { showCharacter: false }));
  const play = () => wr.animateCharacter();
  box.querySelector("button").addEventListener("click", play);
  play();
}
