// Search every word of every book: 汉字, pinyin or English.
import { $, $$, esc } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { sayBtns } from "../lib/speech.js";
import { searchDict } from "../lib/dict.js";
import * as nb from "../notebook/store.js";
import { matchesWord } from "../lib/search.js";
import { LESSONS, bookOf, wordsOf } from "../data/index.js";
import * as progress from "../progress/store.js";
import { charLinks } from "./charsheet.js";

const MAX = 50;
// The last search and where the list was scrolled, so coming back from a word restores it.
let last = { q: "", y: 0 };
const hasHan = (q) => /[㐀-鿿豈-﫿]/.test(q);

export function openSearch() {
  const all = wordsOf(LESSONS);
  $("#searchBody").innerHTML = `<div class="panel">
    <input class="search" id="searchInput" type="search" placeholder="Search 汉字, pinyin or English" autocomplete="off">
    <table class="word-table"><tbody id="searchRows"></tbody></table>
    <div id="searchMore"></div>
  </div>`;
  const rows = $("#searchRows"), more = $("#searchMore");
  let seq = 0;
  // Chinese queries also search the whole dictionary (CC-CEDICT), for words that are not in your books.
  const renderMore = async (q) => {
    const token = ++seq;
    more.innerHTML = "";
    if (!hasHan(q)) return;
    const inBooks = new Set(all.map((w) => w.w));
    const found = await searchDict(q, (w) => inBooks.has(w));
    if (token !== seq || !found.length) return;
    more.innerHTML = `<h3 class="lbl" style="margin:16px 0 4px">Not in your books</h3><table class="word-table"><tbody>${found.map((w) => `<tr>
      <td class="hz">${[...w.w].length === 1 ? `<button type="button" class="char-link solo" data-char="${esc(w.w)}" aria-label="About ${esc(w.w)}">${esc(w.w)}</button>` : esc(w.w)}</td>
      <td><span class="py">${tonePy(w.py)}</span><br><span class="en">${esc(w.en.split("; ").slice(0, 3).join("; "))}</span></td>
      <td style="text-align:right;white-space:nowrap">${sayBtns(w.w, w.py, true)}<br>${saveBtn(w)}</td></tr>`).join("")}</tbody></table>`;
  };
  const saveBtn = (w) => (nb.getWord(w.w) && !nb.getWord(w.w).deleted ? `<span class="muted">In Notebook</span>`
    : `<button class="btn" type="button" data-save="${esc(w.w)}" data-py="${esc(w.py)}" data-en="${esc(w.en)}">Save to Notebook</button>`);
  more.addEventListener("click", (e) => {
    const b = e.target.closest("[data-save]");
    if (!b) return;
    nb.addWord(b.dataset.save, { py: b.dataset.py, en: b.dataset.en });
    b.replaceWith(Object.assign(document.createElement("span"), { className: "muted", textContent: "Saved to Notebook" }));
  });
  const render = (q = "") => {
    renderMore(q);
    if (!q.trim()) { rows.innerHTML = `<tr><td class="muted">Search all ${all.length} words</td></tr>`; return; }
    const list = all.filter((w) => matchesWord(w, q));
    rows.innerHTML = list.slice(0, MAX).map((w) => {
      const L = LESSONS.find((l) => l.id === w.lesson);
      return `<tr><td class="hz">${charLinks(w.w)}</td>
        <td><span class="py">${tonePy(w.py)}</span><br><span class="en">${esc(w.en)}</span><br><small class="muted">${esc(bookOf(L).title)} · ${esc(L.cn)}</small></td>
        <td style="text-align:right;white-space:nowrap">${sayBtns(w.w, w.py, true)}<br><button class="btn" type="button" data-practice="${esc(w.w)}">Practice</button></td></tr>`;
    }).join("") + (list.length > MAX ? `<tr><td class="muted" colspan="3">Showing the first ${MAX} of ${list.length}. Type more to narrow it down.</td></tr>` : "")
      || `<tr><td class="muted">No words match.</td></tr>`;
  };
  $("#searchInput").addEventListener("input", (e) => { last = { q: e.target.value, y: 0 }; render(e.target.value); });
  // Same as "Practice writing" in the character sheet: open the word in its lesson.
  rows.addEventListener("click", (e) => {
    const b = e.target.closest("[data-practice]");
    if (!b) return;
    last.y = scrollY;
    const w = all.find((x) => x.w === b.dataset.practice), L = LESSONS.find((l) => l.id === w.lesson);
    progress.place.set({ lid: L.id, word: L.words.findIndex((x) => x.w === w.w), tab: "write" });
    location.hash = `#/lesson/${L.id}/write?${Date.now()}`;
  });
  $("#searchInput").value = last.q;
  render(last.q);
  if (last.y) scrollTo(0, last.y);
  if (!last.q) $("#searchInput").focus({ preventScroll: true }); // ready to type as soon as the page opens
}
