// 字 Character card: tap any element with data-char="你" to see how the character is built,
// its radical, look-alikes, characters sharing its parts, and every word you know that uses it.
import { $, $$, esc } from "../lib/util.js";
import { tonePy, syllables, stripTone } from "../lib/pinyin.js";
import { autoSay, sayBtns } from "../lib/speech.js";
import { CHARS, CHARINFO, RADICALS, STROKE_DATA, LESSONS, DICT, wordsWith, bookOf } from "../data/index.js";
import * as progress from "../progress/store.js";
import { charStatus } from "../progress/model.js";

const sheet = () => $("#charSheet");
const name = (c, fallback) => RADICALS[c] || fallback || DICT[c]?.en || "";
const chip = (x, open) => `<button type="button" class="cs-chip" ${open && CHARINFO[x.c] ? `data-char="${x.c}"` : `data-say="${esc(x.c)}"`}>
  <b>${x.c}</b><span class="py">${tonePy(x.py || DICT[x.c]?.py || "")}</span><small>${esc(name(x.c, x.en))}</small></button>`;

// A small 田字格 with the character drawn from its stroke shapes (falls back to the font).
function model(c) {
  const d = STROKE_DATA[c];
  const art = d ? `<g transform="translate(6,6) scale(0.0859) translate(0,900) scale(1,-1)" fill="var(--ink)">${d.strokes.map((s) => `<path d="${s}"/>`).join("")}</g>`
    : `<text x="50" y="54" text-anchor="middle" dominant-baseline="central" font-size="70" fill="var(--ink)" font-family="var(--display)">${c}</text>`;
  return `<svg class="cs-model" viewBox="0 0 100 100" aria-hidden="true"><rect x="1" y="1" width="98" height="98" fill="none" stroke="var(--grid)" stroke-width="1.5"/>
    <g stroke="var(--grid)" stroke-width=".6" stroke-dasharray="3 3"><line x1="50" y1="1" x2="50" y2="99"/><line x1="1" y1="50" x2="99" y2="50"/></g>${art}</svg>`;
}

function howBuilt(c, info) {
  if (!info?.parts?.length) return info?.hint ? `<section><span class="lbl">How it's built</span><p>${esc(info.hint)}</p></section>` : "";
  const parts = info.parts.map((p) => chip(p, true)).join(`<span class="cs-plus">+</span>`);
  let why = "";
  if (info.type === "pictophonetic" && info.semantic && info.phonetic) {
    const sem = info.parts.find((p) => p.c === info.semantic), ph = info.parts.find((p) => p.c === info.phonetic);
    why = `<b>${info.semantic}</b> gives the <b>meaning</b> (${esc(name(info.semantic, sem?.en))}); <b>${info.phonetic}</b> gives the <b>sound</b> (${tonePy(ph?.py || DICT[info.phonetic]?.py || "")}).`;
  } else if (info.hint) why = esc(info.hint);
  return `<section><span class="lbl">How it's built</span><div class="cs-parts">${parts}</div>${why ? `<p class="note">${why}</p>` : ""}</section>`;
}

// Other characters from your lessons that share a part with this one.
function sharesParts(c, info) {
  if (!info?.parts) return [];
  const mine = new Set(info.parts.map((p) => p.c));
  return Object.entries(CHARINFO).filter(([k, v]) => k !== c && v.parts.some((p) => mine.has(p.c)))
    .map(([k, v]) => ({ c: k, py: CHARS[k]?.py || "", en: CHARS[k]?.en || "", via: v.parts.find((p) => mine.has(p.c)).c }));
}

// Readings of c in the lesson words that differ from its main reading (行 xíng, but háng in 银行).
// Neutral-tone versions of the same syllable (学生 sheng) don't count.
function otherReadings(c, main, words) {
  const plain = (p) => stripTone(p || "").toLowerCase();
  const found = new Map();
  for (const w of words) {
    const hz = [...w.w];
    const erhua = hz.length > 1 && hz[hz.length - 1] === "儿" && /r$/.test(w.py) && !/'[eēéěè]r$/.test(w.py);
    const sy = w.py.split(/[\s']+/).flatMap((x) => syllables(x)).map(([s]) => s.toLowerCase());
    hz.forEach((x, i) => {
      const s = sy[i];
      if (x !== c || !s || (erhua && i === hz.length - 1)) return;
      const r = erhua && i === hz.length - 2 ? s.replace(/r$/, "") : s;
      if (plain(r) !== plain(main) && !found.has(r)) found.set(r, w.w);
    });
  }
  return [...found];
}

export function openChar(c) {
  const info = CHARINFO[c], base = CHARS[c] || DICT[c] || {};
  const st = progress.get("w:" + c), status = charStatus(st);
  const words = wordsWith(c);
  const shares = sharesParts(c, info);
  const strokes = STROKE_DATA[c]?.strokes.length;
  $("#charBody").innerHTML = `
    <div class="cs-head">
      ${model(c)}
      <div class="cs-title">
        <div><b class="cs-big">${c}</b> <span class="py">${tonePy(base.py || "")}</span></div>
        <div class="muted">${esc(base.en || "")}</div>
        ${otherReadings(c, base.py, words).map(([py, w]) => `<div class="muted">Also read <span class="py">${tonePy(py)}</span> in ${esc(w)}</div>`).join("")}
        <div class="controls">${sayBtns(c, base.py || c, true)}
          ${strokes ? `<span class="count">${strokes} strokes</span>` : ""}
          <span class="badge ${status === "mastered" ? "ok" : status === "learning" ? "learning" : ""}">${status === "mastered" ? "✓ Mastered" : status === "learning" ? "Learning" : "New"}</span></div>
      </div>
    </div>
    ${howBuilt(c, info)}
    ${info?.radical && info.radical.c !== c ? `<section><span class="lbl">Radical (character family)</span>
      <p><span class="cs-rad">${info.radical.c}</span> ${esc(name(info.radical.c, info.radical.en))}: characters with ${info.radical.c} are often about ${esc(name(info.radical.c, info.radical.en))}.</p></section>` : ""}
    ${CHARS[c]?.tip ? `<section><span class="lbl">Memory trick</span><p>${CHARS[c].tip}</p></section>` : ""}
    ${info?.similar?.length ? `<section><span class="lbl">Don't mix up with</span><div class="cs-row">${info.similar.map((x) => chip(x, true)).join("")}</div></section>` : ""}
    ${shares.length ? `<section><span class="lbl">Your characters with the same part</span><div class="cs-row">${shares.map((x) => chip({ ...x, en: `${x.en} · ${x.via}` }, true)).join("")}</div></section>` : ""}
    ${words.length ? `<section><span class="lbl">Your words with ${c}</span><ul class="cs-words">${words.map((w) => {
      const L = LESSONS.find((l) => l.id === w.lesson);
      return `<li><button type="button" data-say="${esc(w.w)}"><b>${[...w.w].map((x) => (x === c ? `<mark>${x}</mark>` : x)).join("")}</b>
        <span class="py">${tonePy(w.py)}</span><span class="muted">${esc(w.en)}</span><small>${L ? `${esc(bookOf(L).title)} · ${L.cn}` : ""}</small></button></li>`;
    }).join("")}</ul></section>` : ""}
    ${words.length && STROKE_DATA[c] ? `<button class="btn primary" type="button" id="csPractice">Practice writing ${c}</button>` : ""}
    <p class="note cs-credit">Character parts: Make Me a Hanzi (open data).</p>`;
  $("#csPractice")?.addEventListener("click", () => {
    const w = words[0], L = LESSONS.find((l) => l.id === w.lesson);
    progress.place.set({ lid: L.id, word: L.words.findIndex((x) => x.w === w.w), tab: "write" });
    sheet().close();
    location.hash = `#/lesson/${L.id}/write?${Date.now()}`;
  });
  if (!sheet().open) sheet().showModal();
  $("#charBody").scrollTop = 0;
  autoSay(c);
}

// Any [data-char] anywhere opens its card.
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-char]");
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  openChar(el.dataset.char);
}, true);

// A word with each known character tappable.
export const charLinks = (word) => [...word].map((c) => (CHARINFO[c] ? `<button type="button" class="char-link" data-char="${c}" aria-label="About ${c}">${c}</button>` : c)).join("");
