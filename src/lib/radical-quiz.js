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

// Always n wrong meanings when the data has them: other radicals of the scope first, then every meaning radical.
export function guessOptions(q, scope, families = RADICAL_FAMILIES, rand = Math.random, n = 3, everyone = allCoreRadicals()) {
  const out = pickGuessDistractors(q, scope, families, rand, n);
  if (out.length >= n) return out;
  const have = new Set([q.en.toLowerCase(), ...out.map((t) => t.toLowerCase())]);
  for (const t of pickGuessDistractors(q, everyone.filter((y) => (y.kind || "meaning") === "meaning"), families, rand, n * 3)) {
    if (out.length >= n) break;
    if (!have.has(t.toLowerCase())) { have.add(t.toLowerCase()); out.push(t); }
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

// Spot question for one given answer character c: which of four characters has this radical inside? The three others
// come from other radicals (twins first, then the same stage) and never contain the radical. `used` (a Set) keeps
// distractors from repeating between questions; when it leaves too few, they may repeat. Returns null when no 3 are found.
export function spotQuestionFor(c, target, all, { families = RADICAL_FAMILIES, inside = CHAR_INSIDE, rand = Math.random, used = new Set() } = {}) {
  const others = all.filter((y) => y.r !== target.r);
  const twins = new Set((target.twins || []).map((t) => t.r));
  const order = [...shuffleWith(others.filter((y) => twins.has(y.r)), rand),
    ...shuffleWith(others.filter((y) => !twins.has(y.r) && y.stage === target.stage), rand),
    ...shuffleWith(others.filter((y) => !twins.has(y.r) && y.stage !== target.stage), rand)];
  for (const avoid of [used, new Set()]) {
    const picks = [], got = new Set();
    for (const y of order) {
      if (picks.length >= 3) break;
      const d = shuffleWith(familyChars(y, families), rand).find((d) => !avoid.has(d) && !got.has(d) && d !== c && !hasRadical(d, target, inside));
      if (d) { picks.push({ c: d, r: y.r }); got.add(d); }
    }
    if (picks.length === 3) { picks.forEach((p) => used.add(p.c)); used.add(c); return { type: "spot", c, r: target.r, radical: target, others: picks }; }
  }
  return null;
}

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
  const used = new Set(skip);
  const out = [];
  for (const c of [...new Set(answers)]) {
    if (out.length >= n) break;
    const q = spotQuestionFor(c, target, all, { families, inside, rand, used });
    if (q) out.push(q);
  }
  return out;
}

export const DAY = 86400000;

// The words a lesson teaches: up to n family characters (never the radical or its full form), book characters
// before outside ones. Inside each group: never seen, then missed last time, then the rest oldest first.
// With more than n candidates, a character answered right within the last 2 days goes behind all others, so every
// lesson brings new words. seen(c) returns that character's progress stat (or undefined).
export function pickLessonWords(radical, { families = RADICAL_FAMILIES, seen = () => undefined, rand = Math.random, n = 10, now = Date.now() } = {}) {
  const f = families[radical?.r] || {};
  const skip = (c) => c === radical?.r || c === radical?.full;
  const book = [...new Set(f.book || [])].filter((c) => !skip(c));
  const common = [...new Set((f.common || []).map((x) => x.c))].filter((c) => !skip(c) && !book.includes(c));
  const group = (list) => {
    const st = (c) => seen(c);
    const fresh = shuffleWith(list.filter((c) => !st(c)?.n), rand);
    const missed = shuffleWith(list.filter((c) => st(c)?.n && !st(c).lastOk), rand);
    const rest = list.filter((c) => st(c)?.n && st(c).lastOk).sort((a, b) => st(a).last - st(b).last);
    return [...fresh, ...missed, ...rest];
  };
  const all = [...group(book), ...group(common)];
  if (all.length <= n) return all;
  const recent = (c) => { const s = seen(c); return !!(s?.n && s.lastOk && now - s.last < 2 * DAY); };
  return [...all.filter((c) => !recent(c)), ...all.filter(recent)].slice(0, n);
}

// Meaning question for one character: the right text comes from charGloss, the three wrong ones are meanings of other
// radicals' family characters (distinct texts, never the right one, same stage first). Returns null when 3 are not found.
export function meaningQuestionFor(c, target, all, { families = RADICAL_FAMILIES, rand = Math.random, chars = CHARS, used = new Set() } = {}) {
  const en = charGloss(c, target, families, chars).en;
  if (!en) return null;
  const others = all.filter((y) => y.r !== target.r);
  const order = [...shuffleWith(others.filter((y) => y.stage === target.stage), rand), ...shuffleWith(others.filter((y) => y.stage !== target.stage), rand)];
  for (const avoid of [used, new Set()]) {
    const wrong = [], got = new Set([en.toLowerCase()]);
    for (const y of order) {
      if (wrong.length >= 3) break;
      for (const d of shuffleWith(familyChars(y, families), rand)) {
        const t = charGloss(d, y, families, chars).en;
        if (!t || got.has(t.toLowerCase()) || avoid.has(t.toLowerCase()) || d === c) continue;
        got.add(t.toLowerCase()); wrong.push({ c: d, r: y.r, en: t });
        break;
      }
    }
    if (wrong.length === 3) { wrong.forEach((w) => used.add(w.en.toLowerCase())); return { type: "meaning", c, r: target.r, radical: target, en, others: wrong }; }
  }
  return null;
}

// The lesson's check: one question per word from pickLessonWords, "spot" and "meaning" taking turns.
// A radical with fewer than n words gets as many questions as it has words (at least 3: words are reused as Spot questions).
// Returns [{ type: "spot" | "meaning", c, r, radical, ... }].
export function buildLessonCheck(target, all, { families = RADICAL_FAMILIES, inside = CHAR_INSIDE, chars = CHARS, seen, rand = Math.random, n = 10, now } = {}) {
  const words = pickLessonWords(target, { families, seen, rand, n, now });
  if (!words.length) return [];
  const want = Math.max(Math.min(n, words.length), Math.min(3, n));
  const used = new Set(), usedEn = new Set(), out = [];
  for (let i = 0; i < want; i++) {
    const reuse = i >= words.length;
    const c = words[i % words.length];
    const spot = () => spotQuestionFor(c, target, all, { families, inside, rand, used });
    const meaning = () => meaningQuestionFor(c, target, all, { families, rand, chars, used: usedEn });
    const q = reuse || i % 2 === 0 ? spot() || (reuse ? null : meaning()) : meaning() || spot();
    if (q) out.push(q);
  }
  return out;
}
