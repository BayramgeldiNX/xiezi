// Flashcards. Used by the lesson practice menu and the Vocabulary section.
import { $, $$, shuffle, store } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { autoSay, sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { animate } from "../lib/motion.js";
import { app } from "../app.js";
import * as progress from "../progress/store.js";

let deck = null;
const ROUND = 12; // cards dealt per round; the rest wait for the next one

// opts: { host, words, lesson, back }
export function cardsStart(dir, opts = deck?.opts || {}) {
  dir = dir || store.get("hz-cards-dir", "hz");
  store.set("hz-cards-dir", dir);
  const words = opts.words || app.L().words;
  const all = shuffle(words.map((_, i) => i));
  deck = { dir, opts, words, host: opts.host, queue: all.slice(0, ROUND), waiting: all.slice(ROUND), round: 1, rounds: Math.ceil(all.length / ROUND),
    seen: new Set(), rated: new Set(), known: 0, again: new Set(), flipped: false };
  cardsRender();
}
export const cardsOpen = (opts) => { deck = null; cardsStart(null, opts); };

function cardsRender() {
  const host = $(deck.host);
  const words = deck.words;
  if (!deck.queue.length && deck.waiting.length) { deck.queue = deck.waiting.splice(0, ROUND); deck.round++; }
  const total = deck.rated.size;
  if (!deck.queue.length && !deck.rated.size && deck.finished) { // Finish before rating anything: nothing to save
    deck.finished = false;
    if (deck.opts.back) return deck.opts.back();
    return cardsStart(deck.dir, deck.opts);
  }
  if (!deck.queue.length) {
    const nxt = deck.opts.next?.();
    progress.addSession({ type: "cards", lesson: deck.opts.lesson ?? app.L().n, score: total - deck.again.size, total, missed: [...deck.again] });
    host.innerHTML = `<div class="panel" style="justify-items:center;text-align:center">
      <div class="score">全部完成！</div>
      <div class="py">${tonePy("Quánbù wánchéng!")}</div>
      <p>${total < words.length ? `${total} of ${words.length} cards done.` : `All ${total} cards done.`} ${deck.again.size ? `${total - deck.again.size} right the first time.` : "Every card right the first time!"}</p>
      <div class="controls">${nxt ? `<button class="btn primary big" type="button" id="fcNext">Next: ${nxt.label}</button>` : ""}<button class="btn big" type="button" id="fcAgain">${icon("replay")} Shuffle again</button>
      ${deck.again.size ? `<button class="btn big" type="button" id="fcRetry">Retry missed</button>` : ""}
      ${deck.opts.back ? `<button class="btn big" type="button" id="fcBack">Back</button>` : ""}</div></div>`;
    $("#fcNext")?.addEventListener("click", () => nxt.go());
    $("#fcAgain").addEventListener("click", () => cardsStart(deck.dir, deck.opts));
    $("#fcRetry")?.addEventListener("click", () => cardsStart(deck.dir, { ...deck.opts, words: words.filter((w) => deck.again.has(w.w)) }));
    $("#fcBack")?.addEventListener("click", deck.opts.back);
    return;
  }
  const w = words[deck.queue[0]];
  const front = deck.dir === "hz" ? `<div class="fc-front">${w.w}</div>` : `<div class="fc-front en">${w.en}</div>`;
  const back = `<div class="fc-back"><div class="hz">${w.w}</div><div class="py">${tonePy(w.py)}</div><div class="en">${w.en}</div></div>`;
  host.innerHTML = `<div class="fc-wrap">
    <div class="modes" role="tablist" aria-label="Card front">
      <button class="mode" role="tab" data-dir="hz" aria-selected="${deck.dir === "hz"}">汉字 → meaning</button>
      <button class="mode" role="tab" data-dir="en" aria-selected="${deck.dir === "en"}">English → 汉字</button>
    </div>
    <div class="progress">${deck.rounds > 1 ? `Round ${deck.round} of ${deck.rounds} · ` : ""}${deck.queue.length} left · ${deck.known} known</div>
    <button class="fc" type="button" id="fcCard" aria-label="Flip card">${deck.flipped ? back : front + `<div class="tap">Tap to flip</div>`}</button>
    <div class="fc-controls">
      ${deck.flipped
        ? `<button class="btn big" type="button" id="fcAgainOne">Again</button>${sayBtns(w.w, w.py)}<button class="btn primary big" type="button" id="fcGot">${icon("check")} Got it</button>`
        : `<button class="btn primary big" type="button" id="fcFlip">Flip</button>`}
    </div>
    <div class="controls" style="justify-content:center">${deck.opts.back ? `<button class="btn ghost" type="button" id="fcBack">Back</button>` : ""}
      <button class="btn ghost" type="button" id="fcFinish">Finish</button></div>
  </div>`;
  $$("[data-dir]", host).forEach((b) => b.addEventListener("click", () => cardsStart(b.dataset.dir, deck.opts)));
  const flip = () => { if (!deck.flipped) { deck.flipped = true; deck.anim = "flip"; cardsRender(); autoSay(w.w); } };
  if (deck.anim === "flip") animate($("#fcCard"), [{ transform: "perspective(800px) rotateY(-90deg)" }, { transform: "perspective(800px) rotateY(0)" }]);
  else if (deck.anim === "next") animate($("#fcCard"), [{ transform: "translateX(24px)", opacity: 0 }, { transform: "none", opacity: 1 }]);
  deck.anim = null;
  $("#fcCard").addEventListener("click", flip);
  $("#fcFlip")?.addEventListener("click", flip);
  $("#fcBack")?.addEventListener("click", deck.opts.back);
  $("#fcFinish").addEventListener("click", () => { deck.queue = []; deck.waiting = []; deck.flipped = false; deck.finished = true; cardsRender(); }); // saves the session so far
  $("#fcGot")?.addEventListener("click", () => {
    progress.record("f:" + w.w, { ok: true });
    deck.rated.add(w.w);
    deck.queue.shift(); deck.known++; deck.flipped = false; deck.anim = "next"; cardsRender();
  });
  $("#fcAgainOne")?.addEventListener("click", () => {
    progress.record("f:" + w.w, { ok: false, miss: 1 });
    deck.rated.add(w.w);
    deck.again.add(w.w);
    deck.queue.push(deck.queue.shift()); deck.flipped = false; deck.anim = "next"; cardsRender();
  });
}

// Keyboard: space / enter flips, 1 = again, 2 = got it.
export function cardsKey(e) {
  if (!deck || !deck.queue.length || !$("#fcCard")) return false; // only while a card is on screen
  if (!deck.flipped && (e.key === " " || e.key === "Enter")) { $("#fcCard")?.click(); return true; }
  if (deck.flipped && e.key === "1") { $("#fcAgainOne")?.click(); return true; }
  if (deck.flipped && (e.key === "2" || e.key === " ")) { $("#fcGot")?.click(); return true; }
  return false;
}
