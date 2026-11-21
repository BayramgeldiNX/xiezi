// Pure helpers for 部首 practice (no DOM): distractors, question lists, due radicals. Used by views/radicals-practice.js.
import { RADICALS_CORE, RADICAL_FAMILIES, CHAR_INSIDE, CHARS } from "../data/index.js";
import { radicalKey } from "./radicals.js";
import { isDue, latest } from "../progress/model.js";

export const ROUND = 10;

// Fisher-Yates with an injectable random fn (rand() in [0,1)).
export function shuffleWith(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const allCoreRadicals = (core = RADICALS_CORE) => core.stages.flatMap((s) => s.radicals.map((r) => ({ ...r, stage: s.id })));

// n other radicals' glyphs: the target's look-alike twins first, then same stage + same position, then same stage,
// then same position, then the rest. Radicals inside the character itself (any component, found through `inside`)
// are never offered: they would be right answers.
export function pickRadicalDistractors(target, all, rand = Math.random, n = 3, char = "", inside = CHAR_INSIDE) {
  const within = char ? char + (inside[char] || "") : "";
  const ok = (x) => x.r !== target.r && x.full !== target.full && !(char && [x.r, x.full, ...(x.variants || [])].some((f) => f && within.includes(f)));
  const pool = all.filter(ok);
  const twinIds = new Set((target.twins || []).map((t) => t.r));
  const twins = pool.filter((x) => twinIds.has(x.r));
  const rest = pool.filter((x) => !twinIds.has(x.r));
  const tiers = [
    twins,
    rest.filter((x) => x.stage === target.stage && x.pos === target.pos),
    rest.filter((x) => x.stage === target.stage && x.pos !== target.pos),
    rest.filter((x) => x.stage !== target.stage && x.pos === target.pos),
    rest.filter((x) => x.stage !== target.stage && x.pos !== target.pos),
  ];
  return tiers.flatMap((t) => shuffleWith(t, rand)).slice(0, n).map((x) => x.r);
}

// Round-robin over shuffled radicals so one radical does not fill the round.
function roundRobin(radicals, listOf, rand, n) {
  const lists = shuffleWith(radicals, rand).map((r) => ({ r, left: listOf(r) })).filter((x) => x.left.length);
  const out = [];
  while (out.length < n && lists.some((x) => x.left.length)) {
    for (const x of lists) if (x.left.length && out.length < n) out.push({ r: x.r, item: x.left.shift() });
  }
  return out;
}

// "find" questions: a character of the family (book characters first, then common ones) -> its radical.
export function buildFindQuestions(radicals, families = RADICAL_FAMILIES, rand = Math.random, n = ROUND) {
  const chars = (r) => {
    const f = families[r.r] || {};
    const book = shuffleWith((f.book || []).filter((c) => c !== r.r && c !== r.full), rand);
    const common = shuffleWith((f.common || []).map((x) => x.c).filter((c) => c !== r.r && c !== r.full && !book.includes(c)), rand);
    return [...book, ...common];
  };
  return roundRobin(radicals, chars, rand, n).map(({ r, item }) => ({ c: item, r: r.r, radical: r }));
}

// "guess" questions: a character from family.guess (meaning-type radicals only; a missing kind counts as meaning).
export function buildGuessQuestions(radicals, families = RADICAL_FAMILIES, rand = Math.random, n = ROUND) {
  const meaning = radicals.filter((r) => (r.kind || "meaning") === "meaning");
  return roundRobin(meaning, (r) => shuffleWith(families[r.r]?.guess || [], rand), rand, n)
    .map(({ r, item }) => ({ c: item.c, py: item.py || "", en: item.en, r: r.r, radical: r }));
}

// 3 other meanings from other radicals' guess lists (distinct radical, distinct text).
export function pickGuessDistractors(q, radicals, families = RADICAL_FAMILIES, rand = Math.random, n = 3) {
  const seen = new Set([q.en.toLowerCase()]), out = [];
  for (const r of shuffleWith(radicals.filter((x) => x.r !== q.r), rand)) {
    const g = shuffleWith(families[r.r]?.guess || [], rand).find((x) => x.en && !seen.has(x.en.toLowerCase()));
    if (g) { seen.add(g.en.toLowerCase()); out.push(g.en); if (out.length >= n) break; }
  }
  return out;
}

// Radicals practised before whose schedule says they are due (same rule as Review).
export function dueRadicals(radicals, getStat, now = Date.now()) {
  return radicals.filter((r) => isDue(latest([getStat(radicalKey(r.r))]), now));
}


// What a character means and how its radical takes part: { py, en, why (plain text), tip (html from the book data) }.
// Sources, best first: the lesson's family cards, the book character data, the generated family lists.
export function charGloss(c, radical, families = RADICAL_FAMILIES, chars = CHARS) {
  const f = families[radical?.r] || {};
  const card = (radical?.lesson?.why || []).find((x) => x.c === c);
  const common = (f.common || []).find((x) => x.c === c);
  const guess = (f.guess || []).find((x) => x.c === c) || (radical?.guess || []).find((x) => x.c === c);
  const book = chars[c];
  const sound = (radical?.lesson?.sound || []).find((x) => x.c === c)?.sound || common?.sound || "";
  return {
    py: card?.py || book?.py || common?.py || guess?.py || "",
    en: card?.en || book?.en || guess?.en || common?.en || "",
    why: card?.why || "",
    tip: card ? "" : book?.tip || "",
    sound,
  };
}

const hasRadical = (c, y, inside) => {
  const s = c + (inside[c] || "");
  return [y.r, y.full, ...(y.variants || [])].some((f) => f && s.includes(f));
};
const familyChars = (y, families) => {
  const f = families[y.r] || {};
  return [...new Set([...(f.book || []), ...(f.common || []).map((x) => x.c)])].filter((c) => c !== y.r && c !== y.full);
};

// "Spot it" questions for a lesson's quick check: which of four characters has this radical inside?
// The answer is a family character the lesson did not show (a new word), book characters first; the three others
// come from other radicals (twins first, then the same stage) and never contain the radical.
// Returns [{ c, r, radical, others: [{ c, r }] }].
export function buildSpotQuestions(target, all, { families = RADICAL_FAMILIES, inside = CHAR_INSIDE, rand = Math.random, n = 2, skip = [] } = {}) {
  const L = target.lesson || {};
  const shown = new Set([...(L.part || []), ...(L.why || []).map((w) => w.c), ...(L.sound || []).map((s) => s.c)]);
  const book = new Set(families[target.r]?.book || []);
  const fam = familyChars(target, families);
  const fam2 = fam.filter((c) => !skip.includes(c));
  const fresh = fam2.filter((c) => !shown.has(c));
  const pool = fresh.length >= n ? fresh : fam2;
  const answers = [...shuffleWith(pool.filter((c) => book.has(c)), rand).slice(0, 1), ...shuffleWith(pool.filter((c) => !book.has(c)), rand)];
  const others = all.filter((y) => y.r !== target.r);
  const twins = new Set((target.twins || []).map((t) => t.r));
  const order = [...shuffleWith(others.filter((y) => twins.has(y.r)), rand),
    ...shuffleWith(others.filter((y) => !twins.has(y.r) && y.stage === target.stage), rand),
    ...shuffleWith(others.filter((y) => !twins.has(y.r) && y.stage !== target.stage), rand)];
  const used = new Set(skip);
  const out = [];
  for (const c of [...new Set(answers)]) {
    if (out.length >= n) break;
    const picks = [];
    for (const y of order) {
      if (picks.length >= 3) break;
      const d = shuffleWith(familyChars(y, families), rand).find((d) => !used.has(d) && d !== c && !hasRadical(d, target, inside));
      if (d) { picks.push({ c: d, r: y.r }); used.add(d); }
    }
    if (picks.length === 3) { used.add(c); out.push({ c, r: target.r, radical: target, others: picks }); }
  }
  return out;
}
