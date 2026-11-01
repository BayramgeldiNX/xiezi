// Search every word of every book: 汉字, pinyin or English.
import { $, $$, esc } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { sayBtns } from "../lib/speech.js";
import { matchesWord } from "../lib/search.js";
import { LESSONS, bookOf, wordsOf } from "../data/index.js";
import * as progress from "../progress/store.js";
import { charLinks } from "./charsheet.js";

const MAX = 50;

export function openSearch() {
  const all = wordsOf(LESSONS);
  $("#searchBody").innerHTML = `<div class="panel">
    <input class="search" id="searchInput" type="search" placeholder="Search 汉字, pinyin or English" autocomplete="off">
    <table class="word-table"><tbody id="searchRows"></tbody></table>
  </div>`;
  const rows = $("#searchRows");
  const render = (q = "") => {
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
  $("#searchInput").addEventListener("input", (e) => render(e.target.value));
  // Same as "Practice writing" in the character sheet: open the word in its lesson.
  rows.addEventListener("click", (e) => {
    const b = e.target.closest("[data-practice]");
    if (!b) return;
    const w = all.find((x) => x.w === b.dataset.practice), L = LESSONS.find((l) => l.id === w.lesson);
    progress.place.set({ lid: L.id, word: L.words.findIndex((x) => x.w === w.w), tab: "write" });
    location.hash = `#/lesson/${L.id}/write?${Date.now()}`;
  });
  render();
}
