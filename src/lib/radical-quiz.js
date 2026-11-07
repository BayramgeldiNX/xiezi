// Pure helpers for 部首 practice (no DOM): distractors, question lists, due radicals. Used by views/radicals-practice.js.
import { RADICALS_CORE, RADICAL_FAMILIES } from "../data/index.js";
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

// n other radicals' glyphs: same stage + same position first, then same stage, then same position, then the rest.
// Radicals contained in the character itself are skipped when `char` is given.
export function pickRadicalDistractors(target, all, rand = Math.random, n = 3, char = "") {
  const ok = (x) => x.r !== target.r && x.full !== target.full && !(char && char.includes(x.r));
  const pool = all.filter(ok);
  const tiers = [
    pool.filter((x) => x.stage === target.stage && x.pos === target.pos),
    pool.filter((x) => x.stage === target.stage && x.pos !== target.pos),
    pool.filter((x) => x.stage !== target.stage && x.pos === target.pos),
    pool.filter((x) => x.stage !== target.stage && x.pos !== target.pos),
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

