// 字 Character card: tap any element with data-char="你" to see how the character is built,
// its radical, look-alikes, characters sharing its parts, and every word you know that uses it.
// Any character works, not only the ones in your books: parts open their own cards (换 › 奂 › 央),
// and each card says whether the character is worth learning (src/lib/char-kind.js).
import { $, esc } from "../lib/util.js";
import { tonePy, syllables, stripTone } from "../lib/pinyin.js";
import { autoSay, sayBtns } from "../lib/speech.js";
import { CHARS, CHARINFO, RADICALS, RADICALS_CORE, STROKE_DATA, ensureChars, LESSONS, DICT, wordsWith, bookOf } from "../data/index.js";
import { charParts, soundFamily, charSenses, wordsWithChar } from "../lib/dict.js";
import { charKind } from "../lib/char-kind.js";
import * as progress from "../progress/store.js";
import { charStatus } from "../progress/model.js";

const sheet = () => $("#charSheet");
const name = (c, fallback) => RADICALS[c] || fallback || DICT[c]?.en || "";
// Every chip opens that character's own card. role = "meaning" | "sound" when the etymology says what the part does.
const chip = (x, role = "") => `<button type="button" class="cs-chip${role ? ` ${role === "sound" ? "snd" : "mng"}` : ""}" data-char="${x.c}">
  <b>${x.c}</b><span class="py">${tonePy(x.py || DICT[x.c]?.py || "")}</span><small>${esc(name(x.c, x.en))}</small>${role ? `<em class="cs-role">${role}</em>` : ""}</button>`;

// The radicals of the Radicals pages by written form: 扌 is a side form of 手.
const CORE = new Map(RADICALS_CORE.stages.flatMap((st) => st.radicals).flatMap((r) => [[r.r, r], [r.full, r]]));
const sideOf = (c, entry) => {
  const r = CORE.get(c);
  if (r && r.r === c && r.full && r.full !== c) return { full: r.full, name: r.en, core: r.r };
  if (RADICALS[c] && !entry?.py) return { name: RADICALS[c] };
  return null;
};
const radicalHref = (c) => (CORE.get(c) ? `#/radical/${encodeURIComponent(CORE.get(c).r)}` : "");
const inBooks = (c) => !!(CHARINFO[c] || CHARS[c]);

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
  const role = (p) => (info.type === "pictophonetic" ? (p.c === info.phonetic ? "sound" : p.c === info.semantic ? "meaning" : "") : "");
  const parts = info.parts.map((p) => chip(p, role(p))).join(`<span class="cs-plus">+</span>`);
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

// Your lesson characters that contain c as a part (奂 in 换).
const containing = (c) => Object.entries(CHARINFO).filter(([k, v]) => k !== c && v.parts.some((p) => p.c === c))
  .map(([k]) => ({ c: k, py: CHARS[k]?.py || "", en: CHARS[k]?.en || "" }));

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

// What the card shows for a character outside the books, built from chars.json (same shape as CHARINFO).
function infoFrom(entry) {
  const ph = entry.type === "pictophonetic" ? entry.sound : "";
  const sem = ph && entry.parts.length === 2 ? entry.parts.find((p) => p.c !== ph)?.c || "" : "";
  return { dec: entry.dec, parts: entry.parts, radical: entry.radical, hint: entry.hint, type: entry.type, phonetic: ph, semantic: sem, similar: [] };
}

// The trail of characters opened from inside the card: 换 › 奂 › 央. Back goes up one step.
let trail = [], seq = 0;

const trailHtml = () => (trail.length < 2 ? "" : `<nav class="cs-trail" aria-label="Where you came from">
  <button type="button" class="cs-back" data-trail="${trail.length - 2}" aria-label="Back to ${trail[trail.length - 2]}">‹</button>
  ${trail.map((x, i) => (i === trail.length - 1 ? `<b aria-current="true">${x}</b>` : `<button type="button" data-trail="${i}">${x}</button>`)).join(`<span aria-hidden="true">›</span>`)}</nav>`);

async function openChar(c) {
  const token = ++seq, mine = inBooks(c);
  // A calm "Loading" only when the dictionary takes a moment.
  const wait = setTimeout(() => {
    if (token !== seq) return;
    $("#charBody").innerHTML = `${trailHtml()}<p class="muted cs-loading">Loading ${c}…</p>`;
    if (!sheet().open) sheet().showModal();
  }, 150);
  // A stalled download (a slow line, a connection that died while the app slept) must not leave the tap
  // doing nothing: after a few seconds the card draws with what it has.
  const until = Date.now() + PATIENCE, patient = (p, fallback) => Promise.race([Promise.resolve(p).catch(() => fallback),
    new Promise((r) => setTimeout(() => r(fallback), Math.max(0, until - Date.now())))]);
  const entry = await patient(charParts(c), null);
  const base = CHARS[c] || DICT[c] || (entry ? { py: entry.py, en: entry.en } : {});
  const [family, senses, more] = await Promise.all([patient(soundFamily(c), []), patient(charSenses(c, base.py || entry?.py), []),
    mine ? [] : patient(wordsWithChar(c), []), STROKE_DATA[c] ? 0 : patient(ensureChars(c), 0)]);
  clearTimeout(wait);
  if (token !== seq) return; // another character was opened meanwhile
  try { draw(c, { entry, base, family, senses, more }); } catch (e) {
    // Never a silent tap: a card that cannot be drawn still says so.
    console.error(e);
    $("#charBody").innerHTML = `${trailHtml()}<p class="muted cs-loading">Could not show ${c} right now.</p>`;
    if (!sheet().open) sheet().showModal();
  }
}
const PATIENCE = 6000;

function draw(c, { entry, base, family, senses, more }) {
  const mine = inBooks(c);
  const info = CHARINFO[c] || (entry ? infoFrom(entry) : null);
  const words = wordsWith(c);
  const L0 = words[0] && LESSONS.find((l) => l.id === words[0].lesson);
  const kind = charKind(c, entry, { lesson: mine ? (L0 ? `${bookOf(L0).title} · ${L0.cn}` : true) : null, side: sideOf(c, entry), family });
  const status = charStatus(progress.get("w:" + c));
  const shares = sharesParts(c, info), within = containing(c);
  const strokes = STROKE_DATA[c]?.strokes.length;
  const radHref = info?.radical ? radicalHref(info.radical.c) : "";
  const verdictLink = kind.kind === "side" && kind.core ? ` <a href="#/radical/${encodeURIComponent(kind.core)}">Open the radical</a>` : "";
  // The book's own meaning first, then up to 3 CC-CEDICT senses (left out when they only repeat it).
  const have = (base.en || "").toLowerCase().split(/\s*[;,]\s*/);
  const dict = (mine ? senses.filter((x) => !have.includes(x.toLowerCase())) : senses).join("; ");
  const mean = mine ? [base.en, dict] : [dict || base.en];
  $("#charBody").innerHTML = `
    ${trailHtml()}
    <div class="cs-head">
      ${model(c)}
      <div class="cs-title">
        <div><b class="cs-big">${c}</b> <span class="py">${tonePy(base.py || "")}</span></div>
        ${mean.filter(Boolean).map((m, i) => `<div class="muted${i ? " cs-more" : ""}">${esc(m)}</div>`).join("")}
        ${mine ? otherReadings(c, base.py, words).map(([py, w]) => `<div class="muted">Also read <span class="py">${tonePy(py)}</span> in ${esc(w)}</div>`).join("") : ""}
        <div class="controls">${base.py ? sayBtns(c, base.py, true) : ""}
          ${strokes ? `<span class="count">${strokes} strokes</span>` : ""}
          ${mine ? `<span class="badge ${status === "mastered" ? "ok" : status === "learning" ? "learning" : ""}">${status === "mastered" ? "✓ Mastered" : status === "learning" ? "Learning" : "New"}</span>` : ""}</div>
      </div>
    </div>
    <p class="cs-verdict ${kind.kind}">${esc(kind.text)}${verdictLink}</p>
    ${howBuilt(c, info)}
    ${family.length ? `<section><span class="lbl">Sound family</span><div class="cs-row">${family.slice(0, 24).map((x) => chip({ ...x, en: mineMark(x) })).join("")}</div>
      <p class="note">These characters take their sound from ${c}.</p></section>` : ""}
    ${info?.radical && info.radical.c !== c ? `<section><span class="lbl">Radical (character family)</span>
      <p><span class="cs-rad">${info.radical.c}</span> ${radHref ? `<a href="${radHref}">${esc(name(info.radical.c, info.radical.en))}: see the radical</a>` : `${esc(name(info.radical.c, info.radical.en))}: characters with ${info.radical.c} are often about ${esc(name(info.radical.c, info.radical.en))}.`}</p></section>` : ""}
    ${CHARS[c]?.tip ? `<section><span class="lbl">Memory trick</span><p>${CHARS[c].tip}</p></section>` : ""}
    ${info?.similar?.length ? `<section><span class="lbl">Don't mix up with</span><div class="cs-row">${info.similar.map((x) => chip(x)).join("")}</div></section>` : ""}
    ${within.length ? `<section><span class="lbl">Your characters with ${c} inside</span><div class="cs-row">${within.map((x) => chip(x)).join("")}</div></section>` : ""}
    ${shares.length ? `<section><span class="lbl">Your characters with the same part</span><div class="cs-row">${shares.map((x) => chip({ ...x, en: `${x.en} · ${x.via}` })).join("")}</div></section>` : ""}
    ${words.length ? `<section><span class="lbl">Your words with ${c}</span><ul class="cs-words">${words.map((w) => {
      const L = LESSONS.find((l) => l.id === w.lesson);
      return `<li><button type="button" data-say="${esc(w.w)}"><b>${[...w.w].map((x) => (x === c ? `<mark>${x}</mark>` : x)).join("")}</b>
        <span class="py">${tonePy(w.py)}</span><span class="muted">${esc(w.en)}</span><small>${L ? `${esc(bookOf(L).title)} · ${L.cn}` : ""}</small></button></li>`;
    }).join("")}</ul></section>`
    : more.length ? `<section><span class="lbl">Words with ${c}</span><ul class="cs-words">${more.map((w) => `<li><button type="button" data-say="${esc(w.w)}"><b>${[...w.w].map((x) => (x === c ? `<mark>${x}</mark>` : x)).join("")}</b>
        <span class="py">${tonePy(w.py)}</span><span class="muted">${esc(w.en.split("; ").slice(0, 2).join("; "))}</span></button></li>`).join("")}</ul></section>` : ""}
    ${words.length && STROKE_DATA[c] ? `<button class="btn primary" type="button" id="csPractice">Practice writing ${c}</button>` : ""}
    <p class="note cs-credit">Character parts: Make Me a Hanzi (open data). Other meanings and words: CC-CEDICT.</p>`;
  $("#csPractice")?.addEventListener("click", () => {
    const w = words[0], L = LESSONS.find((l) => l.id === w.lesson);
    progress.place.set({ lid: L.id, word: L.words.findIndex((x) => x.w === w.w), tab: "write" });
    sheet().close();
    location.hash = `#/lesson/${L.id}/write?${Date.now()}`;
  });
  if (!sheet().open) sheet().showModal();
  $("#charBody").scrollTop = 0;
  if (base.py) autoSay(c);
}

// A member of a sound family: its meaning, with a mark when it is in your books.
const short = (t) => (t.length > 20 ? `${t.slice(0, 18)}…` : t);
const mineMark = (x) => (inBooks(x.c) ? `✓ ${short(CHARS[x.c]?.en || x.en)}` : short(x.en));

// Open a character's card. From a chip inside the card it goes one step deeper in the trail; from anywhere else it starts a new one.
export function showChar(c, inside = false) {
  if (inside && sheet().open) { if (trail[trail.length - 1] !== c) trail.push(c); } else trail = [c];
  return openChar(c);
}

// Back one step (a trail button, or Esc on the card). False when the trail is at its start.
function up(to = trail.length - 2) {
  if (to < 0 || to >= trail.length - 1) return false;
  trail = trail.slice(0, to + 1);
  openChar(trail[to]);
  return true;
}

sheet()?.addEventListener("cancel", (e) => {
  if (!up()) return;
  e.preventDefault();
  e.stopImmediatePropagation(); // the soft close wired in main.js must not also run
});
// Esc itself too: a browser closes a dialog without asking when the key came without a recent tap.
sheet()?.addEventListener("keydown", (e) => { if (e.key === "Escape" && up()) e.preventDefault(); });
sheet()?.addEventListener("close", () => { trail = []; seq++; });
sheet()?.addEventListener("click", (e) => {
  const t = e.target.closest("[data-trail]");
  if (t) { e.preventDefault(); up(+t.dataset.trail); return; }
  if (e.target.closest("a[href^='#/']")) sheet().close(); // a link to a radical page leaves the card
});

// Any [data-char] anywhere opens its card.
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-char]");
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  // At once: the card waits for the stroke shapes itself (ensureChars), showing "Loading" if they are slow.
  showChar(el.dataset.char, !!el.closest("#charSheet"));
}, true);

// A word with each known character tappable (with all, every Chinese character: the card works for any).
export const charLinks = (word, all = false) => [...word].map((c) => (CHARINFO[c] || (all && /\p{Script=Han}/u.test(c)) ? `<button type="button" class="char-link" data-char="${c}" aria-label="About ${c}">${c}</button>` : c)).join("");
