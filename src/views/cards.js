// Flashcards. Used by the lesson's Cards tab and the Vocabulary section.
import { $, $$, shuffle, store } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { say, sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { app } from "../app.js";
import * as progress from "../progress/store.js";

let deck = null;

// opts: { host, words, lesson, back }
export function cardsStart(dir, opts = deck?.opts || {}) {
  dir = dir || store.get("hz-cards-dir", "hz");
  store.set("hz-cards-dir", dir);
  const words = opts.words || app.L().words;
  deck = { dir, opts, words, host: opts.host || "#tab-cards", queue: shuffle(words.map((_, i) => i)), known: 0, again: new Set(), flipped: false };
  cardsRender();
}
export const cardsOpen = (opts) => { deck = null; cardsStart(null, opts); };

function cardsRender() {
  const host = $(deck.host);
  const words = deck.words;
  const total = words.length;
  if (!deck.queue.length) {
    progress.addSession({ type: "cards", lesson: deck.opts.lesson ?? app.L().n, score: total - deck.again.size, total, missed: [...deck.again] });
    host.innerHTML = `<div class="panel" style="justify-items:center;text-align:center">
      <div class="score">全部完成！</div>
      <div class="py">${tonePy("Quánbù wánchéng!")}</div>
      <p>All ${total} cards done. ${deck.again.size ? `${total - deck.again.size} right the first time.` : "Every card right the first time!"}</p>
      <div class="controls"><button class="btn primary big" type="button" id="fcAgain">${icon("replay")} Shuffle again</button>
      ${deck.opts.back ? `<button class="btn big" type="button" id="fcBack">Back</button>` : ""}</div></div>`;
    $("#fcAgain").addEventListener("click", () => cardsStart(deck.dir, deck.opts));
    $("#fcBack")?.addEventListener("click", deck.opts.back);
    return;
  }
  const w = words[deck.queue[0]];
  const front = deck.dir === "hz" ? `<div class="front">${w.w}</div>` : `<div class="front en">${w.en}</div>`;
  const back = `<div class="back"><div class="hz">${w.w}</div><div class="py">${tonePy(w.py)}</div><div class="en">${w.en}</div></div>`;
  host.innerHTML = `<div class="fc-wrap">
    <div class="modes" role="tablist" aria-label="Card front">
      <button class="mode" role="tab" data-dir="hz" aria-selected="${deck.dir === "hz"}">汉字 → meaning</button>
      <button class="mode" role="tab" data-dir="en" aria-selected="${deck.dir === "en"}">English → 汉字</button>
    </div>
    <div class="progress">${deck.queue.length} left · ${deck.known} known</div>
    <button class="fc" type="button" id="fcCard" aria-label="Flip card">${deck.flipped ? back : front + `<div class="tap">Tap to flip</div>`}</button>
    <div class="fc-controls">
      ${deck.flipped
        ? `<button class="btn big" type="button" id="fcAgainOne">Again</button>${sayBtns(w.w, w.py)}<button class="btn primary big" type="button" id="fcGot">${icon("check")} Got it</button>`
        : `<button class="btn primary big" type="button" id="fcFlip">Flip</button>`}
    </div>
    ${deck.opts.back ? `<button class="btn ghost" type="button" id="fcBack">Back</button>` : ""}
  </div>`;
  $$("[data-dir]", host).forEach((b) => b.addEventListener("click", () => cardsStart(b.dataset.dir, deck.opts)));
  const flip = () => { if (!deck.flipped) { deck.flipped = true; cardsRender(); say(w.w); } };
  $("#fcCard").addEventListener("click", flip);
  $("#fcFlip")?.addEventListener("click", flip);
  $("#fcBack")?.addEventListener("click", deck.opts.back);
  $("#fcGot")?.addEventListener("click", () => {
    progress.record("f:" + w.w, { ok: true });
    deck.queue.shift(); deck.known++; deck.flipped = false; cardsRender();
  });
  $("#fcAgainOne")?.addEventListener("click", () => {
    progress.record("f:" + w.w, { ok: false, miss: 1 });
    deck.again.add(w.w);
    deck.queue.push(deck.queue.shift()); deck.flipped = false; cardsRender();
  });
}

// Keyboard: space / enter flips, 1 = again, 2 = got it.
export function cardsKey(e) {
  if (!deck || !deck.queue.length) return false;
  if (!deck.flipped && (e.key === " " || e.key === "Enter")) { $("#fcCard")?.click(); return true; }
  if (deck.flipped && e.key === "1") { $("#fcAgainOne")?.click(); return true; }
  if (deck.flipped && (e.key === "2" || e.key === " ")) { $("#fcGot")?.click(); return true; }
  return false;
}
