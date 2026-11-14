// Tests: turning lesson content into a paper. Pure: no DOM, no views, no Math.random, no Date.now.
// The same arguments always give the same paper (a seeded generator makes every random choice).
// Terms: see GLOSSARY.md.
//
//   buildPaper(test, book, seed, opts) → { book, test, seed, parts: [{ id, cn, en, questions }] }
//   opts: { exclude: [source ids], near: [[wordA, wordB], …], priorBooks: [book objects],
//           fill: { word: [3 wrong words] | { lessonNumber: [3 wrong words] } } (the book's part of exam-fill.json) }
//   optsFor(book, books, excludeJson, fillJson) → opts, the same way for the screen and the sample tool
//   paper.relaxed: 0 normally; 1–4 when a part could not be filled (paper.relaxedParts: { part: step }, see buildPaper)
//
// Every question is one of three neutral shapes (the test screen has three widgets):
//   common  { n, part, kind, shape, lesson, src, key, newChars }
//   choice  { audio?: [strings to speak], text?, context?: [lines shown above], options, answer, lang, textLang, pyOptions }
//           lang: language of the options, textLang: language of the prompt text ("zh" | "en"),
//           pyOptions: print pinyin over every option (some option has an untaught character)
//   order   { tiles, answer, tail, en }
//   write   { word, py, en }
// Kinds: listen hear / sentence / dialog, vocab meaning / pick / fill, grammar blank, read judge / reply / text,
// write order / hand. A dialogue is spoken as its lines in order; a man's line starts with "男：", which is the name of its
// recording in a man's voice (scripts/gen-audio.py) and is never read aloud; the other lines use the usual voice.
// Kind-specific excludes look like "fill:<word>", "order:<sentence>", "sentence:<sentence>" (src of that kind).
import { exerciseItems } from "../progress/lesson-exercises.js";
import { wordChars, wordsOf, workbookOf } from "../data/index.js";
import { KINDS, PARTS, PRIOR } from "./plan.js";

/* ---------- Seeded random ---------- */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/* ---------- Small helpers ---------- */
const HAN = /\p{Script=Han}/gu;
const HAS_HAN = /\p{Script=Han}/u;
const sound = (w) => (w.py || "").replace(/\s+/g, "").toLowerCase();
const plain = (s) => s.replace(/[AB]: /g, "");
const lang = (s) => (HAS_HAN.test(s) ? "zh" : "en");
const clen = (s) => [...s].length;
const keyOf = (item, prefix) => [].concat(item).find((k) => k.startsWith(prefix));
const hanOf = (strings) => [...new Set(strings.join("").match(HAN) || [])];
const han = (s) => (s.replace(/^男：/, "").match(HAN) || []).join(""); // the Han-only form of a sentence
const TARGET = new Set(["hear", "meaning", "pick", "fill", "hand"]); // a word is the target of one of these only
// Words that can move in a sentence (a second right order), so such sentences are not built.
const MOVERS = ["今天", "明天", "昨天", "现在", "上午", "下午", "中午", "晚上", "早上", "每天", "今年", "明年", "去年", "以前", "以后", "星期", "周末", "月", "号", "点", "和", "跟", "又", "可能", "也许", "因为", "所以", "一起"];
const INNER = /[，、；：！？。…“”]/;
const BRACKET = /[(（\[][^)）\]]*[)）\]]/g;

// The English of a word as shown: brackets that hold Chinese are cut out. Null when Chinese still remains.
function glossOf(w) {
  const g = (w.en || "").replace(BRACKET, (m) => (HAS_HAN.test(m) ? "" : m)).replace(/\s+/g, " ").trim();
  return !g || HAS_HAN.test(g) ? null : g;
}
// The senses of an English gloss: "to be called; to call" → { "be called", "call" }.
function sensesOf(en) {
  return new Set((en || "").replace(BRACKET, "").split(/[;,/]/)
    .map((s) => s.trim().toLowerCase().replace(/^(to|a|an|the)\s+/, "").replace(/\s+/g, " ")).filter(Boolean));
}
const shareSense = (a, b) => { const s = sensesOf(a.en); for (const x of sensesOf(b.en)) if (s.has(x)) return true; return false; };

// The wrong replies a reply question can have: the lesson's other answers; only when they are too few, long answers
// of other taught lessons (short generic ones fit anything).
function replyPool(d, ctx) {
  const bad = (o) => o === d.q || o === d.a || ctx.isNear(o, d.a) || ctx.replies.some((r) => r.q === d.q && r.a === o);
  const own = [...new Set(d.others)].filter((o) => !bad(o));
  const top = [...new Set(ctx.replies.map((r) => r.a))].filter((o) => !bad(o) && !own.includes(o) && (o.match(HAN) || []).length >= 5);
  return { own, top };
}

/* ---------- Questions of each kind ---------- */
// A candidate is { src, key, lesson, make(), truth? }; make() returns the shape fields (and `full`, a whole sentence
// the question shows) or null when no fair question can be made from it.
function candidates(kind, L, ctx) {
  const { rng, isNear, pool, bookWords } = ctx;
  const items = (id) => exerciseItems(id, L);
  const cand = (src, key, make, extra = {}) => ({ src, key, lesson: L.id, make, ...extra });
  // Choices of an exercise whose options are given (and were checked by the teachers): shuffled, answer index follows.
  // The "near" pairs are for options the builder chooses, so they do not apply here (吗 / 呢 are both options of real drills).
  const given = (text, options, answer, extra = {}) => {
    const right = options[answer];
    const opts = shuffled(options, rng);
    return { shape: "choice", ...extra, text, options: opts, answer: opts.indexOf(right), lang: lang(options.join("")) };
  };
  // Wrong words: taught ones first, then the rest of the book; same length first; never a shared sense with the
  // answer or with each other. needGloss: the English of the word is shown, so it must be clean.
  const wrong = (w, { by, n = 3, hear = false, avoid = "", needGloss = false }) => {
    const seen = new Set([w.w]), picks = [], len = clen(w.w);
    const ok = (x) => x.w !== w.w && !shareSense(x, w) && !isNear(w.w, x.w) && !(hear && sound(x) === sound(w))
      && !(needGloss && !glossOf(x)) && !(avoid && (avoid.includes(x.w) || x.w.includes(w.w) || w.w.includes(x.w)));
    for (const tier of [pool, bookWords]) {
      const list = shuffled(tier, rng);
      for (const x of [...list.filter((y) => clen(y.w) === len), ...list.filter((y) => clen(y.w) !== len)]) {
        if (picks.length >= n) break;
        if (seen.has(x.w) || !ok(x) || picks.some((p) => isNear(p.w, x.w) || shareSense(p, x))) continue;
        if (by === "en" && picks.some((p) => glossOf(p) === glossOf(x))) continue;
        seen.add(x.w); picks.push(x);
      }
      if (picks.length >= n) break;
    }
    return picks;
  };
  const choose = (w, picks, by, extra) => {
    const label = (x) => (by === "en" ? glossOf(x) : x.w);
    const options = shuffled([w, ...picks], rng).map(label);
    return { shape: "choice", ...extra, options, answer: options.indexOf(label(w)), lang: by === "en" ? "en" : "zh" };
  };
  const clean = ({ of: w }) => !!glossOf(w);
  // The teachers' wrong words for a fill item: one set, or one per lesson number for a word taught in several lessons.
  const fillSet = (w) => { const e = ctx.fillMap?.[w.w]; const set = Array.isArray(e) ? e : e?.[L.n]; return Array.isArray(set) ? set : null; };

  switch (kind) {
    case "hear":
      return items("hear").filter(clean).map(({ of: w, item }) => cand(w.w, keyOf(item, "l:"), () => {
        const by = rng() < 0.5 ? "en" : "w", picks = wrong(w, { by, hear: true, needGloss: true });
        return picks.length < 2 ? null : { ...choose(w, picks, by, { audio: [w.w] }), sent: [w.w] };
      }));
    case "sentence": {
      const sents = (ls) => ls.flatMap((l) => exerciseItems("sentence", l).map((e) => e.of.ex)).map((s) => ({ ...s, en: plain(s.en) })).filter((s) => !HAS_HAN.test(s.en));
      return items("sentence").filter(({ of: w }) => !HAS_HAN.test(plain(w.ex.en))).map(({ of: w, item }) => cand(plain(w.ex.hz), keyOf(item, "ls:"), () => {
        const hz = plain(w.ex.hz), en = plain(w.ex.en), seen = new Set([en.toLowerCase()]), picks = [];
        for (const tier of [ctx.taught, ctx.book.lessons]) {
          const list = shuffled(sents(tier), rng).sort((a, b) => Math.min(2, Math.abs(clen(a.hz) - clen(hz)) >> 2) - Math.min(2, Math.abs(clen(b.hz) - clen(hz)) >> 2));
          for (const s of list) {
            if (picks.length >= 3) break;
            if (plain(s.hz) === hz || seen.has(s.en.toLowerCase()) || isNear(plain(s.hz), hz)) continue;
            seen.add(s.en.toLowerCase()); picks.push(s.en);
          }
          if (picks.length >= 3) break;
        }
        if (picks.length < 2) return null;
        const options = shuffled([en, ...picks], rng);
        return { shape: "choice", audio: [hz], options, answer: options.indexOf(en), lang: "en", sent: [hz] };
      }));
    }
    case "dialog":
      return items("wb-dialog").map(({ of: d }) => cand(d.id, "wb:" + d.id, () =>
        given(d.q, d.options, d.answer, { audio: d.lines.map((l) => (l[0] === "男" ? "男：" + l[1] : l[1])), sent: [...d.lines.map((l) => l[1]), d.q] })));
    case "meaning":
      return items("cards").filter(clean).map(({ of: w, item }) => cand(w.w, keyOf(item, "q:"), () => {
        const picks = wrong(w, { by: "en", needGloss: true });
        return picks.length < 2 ? null : choose(w, picks, "en", { text: w.w });
      }));
    case "pick":
      return items("cards").filter(clean).map(({ of: w, item }) => cand(w.w, keyOf(item, "q:"), () => {
        const picks = wrong(w, { by: "w", needGloss: true });
        return picks.length < 2 ? null : choose(w, picks, "w", { text: glossOf(w) });
      }));
    case "fill":
      return items("fill").filter(({ of: w }) => !ctx.fillMap || fillSet(w)).map(({ of: w, item }) => cand(w.w, keyOf(item, "wf:"), () => {
        const hz = plain(w.ex.hz), text = hz.replace(w.w, "___");
        if (ctx.fillMap) { // the wrong words come from the teachers
          const wr = [...new Set(fillSet(w))].filter((x) => x !== w.w);
          if (wr.length < 2 || wr.some((x) => isNear(w.w, x))) return null;
          const options = shuffled([w.w, ...wr], rng);
          return { shape: "choice", text, options, answer: options.indexOf(w.w), lang: "zh", full: hz, sent: [hz] };
        }
        const picks = wrong(w, { by: "w", avoid: hz });
        if (picks.length < 2) return null;
        return { ...choose(w, picks, "w", { text }), full: hz, sent: [hz] };
      }));
    case "blank":
      return items("gr-fill").map(({ of: d, item }) => cand(d.id, keyOf(item, "g:"), () => {
        const f = given(d.q, d.options, d.answer);
        const full = f && d.q.replace("___", d.options[d.answer]);
        return f && { ...f, full, sent: [full] };
      }));
    case "judge":
      return items("wb-judge").map(({ of: d }) => cand(d.id, "wb:" + d.id, () =>
        ({ shape: "choice", context: [d.text], text: d.claim, options: ["对", "错"], answer: d.ok ? 0 : 1, lang: "zh", sent: [d.text, d.claim] }), { truth: !!d.ok }));
    case "reply":
      return items("wb-reply").map(({ of: d }) => cand(d.id, "wb:" + d.id, () => {
        // A reply is not another reply's wrong option, and its wrong options are not another reply's answer.
        if (ctx.replyWrong.has(d.a)) return null;
        const { own, top } = replyPool(d, ctx);
        const clear = (o) => !ctx.replyAnswers.has(o) && !ctx.leaks(han(o), null);
        for (let tries = 0; tries < 12; tries++) {
          const picks = [];
          const add = (list) => { for (const o of shuffled(list, rng)) if (picks.length < 3 && clear(o) && !picks.includes(o) && !picks.some((x) => isNear(x, o))) picks.push(o); };
          add(own);
          if (picks.length < 2) add(top);
          if (picks.length < 2) return null;
          const options = shuffled([d.a, ...picks], rng);
          if (ctx.replySets.has([...options].sort().join("|"))) continue;
          return { shape: "choice", text: d.q, options, answer: options.indexOf(d.a), lang: "zh", sent: [d.q, ...options], wrong: picks };
        }
        return null;
      }));
    case "text":
      return items("text-quiz").map(({ of: { r, q }, item }) => {
        const k = keyOf(item, "rq:");
        return cand(k.slice(3), k, () => given(q.q, q.options, q.answer, { context: r.lines.map((l) => l.hz), sent: r.lines.map((l) => l.hz), owner: k.slice(3).replace(/#\d+$/, "") }));
      });
    case "order": {
      const own = new Set(L.words.filter((w) => w.ex?.hz).map((w) => plain(w.ex.hz))); // example sentences only, not text lines
      return items("order").filter(({ of: s }) => own.has(s.hz)).map(({ of: s }) => cand(s.hz, "o:" + s.hz, () => {
        const tail = (s.hz.match(/[^\p{L}\p{N}]+$/u) || [""])[0];
        if (INNER.test(s.hz.slice(0, s.hz.length - tail.length)) || new Set(s.parts).size !== s.parts.length
          || s.parts.some((t) => MOVERS.some((m) => t.includes(m)))) return null;
        const want = s.parts.join("");
        let tiles = null;
        for (let i = 0; i < 30 && !tiles; i++) {
          const t = shuffled(s.parts, rng);
          if (t.join("") !== want) tiles = t; // not in order, not the same text either (九十九)
        }
        if (!tiles) return null;
        return { shape: "order", tiles, answer: [...s.parts], tail, en: plain(s.en), sent: [want] };
      }));
    }
    case "hand":
      return items("dict").filter(({ of: w }) => wordChars(w).length === new Set(w.w).size)
        .map(({ of: w, item }) => cand(w.w, keyOf(item, "d:"), () => ({ shape: "write", word: w.w, py: w.py, en: w.en })));
  }
  return [];
}

// What the student reads in a question (the audio and the answer to write are not shown).
const shownOf = (f) => f.shape === "choice" ? [f.text || "", ...(f.context || []), ...f.options] : f.shape === "order" ? [...f.tiles, f.tail] : [];

// The fields every finished question has, worked out from what it shows.
function finish(fields, ctx) {
  const newChars = ctx.newChars(shownOf(fields));
  ctx.printed.push(...shownOf(fields));
  if (fields.shape !== "choice") return { newChars };
  return { newChars, textLang: fields.text ? lang(fields.text) : "zh", pyOptions: fields.options.some((o) => [...o].some((c) => newChars.includes(c))) };
}

/* ---------- Choosing the questions of a part ---------- */
function buildPart(part, test, ctx) {
  const { rng } = ctx;
  const kinds = KINDS[part];
  const covered = test.lessons, earlier = test.earlier;
  const order = new Map([...earlier, ...covered].map((l) => [l.id, ctx.book.lessons.indexOf(l)]));
  const used = new Set();
  const total = kinds.reduce((s, k) => s + test.counts[part][k], 0);
  // One in five from earlier lessons (small tests), shared out over the kinds by largest remainder.
  const quota = earlier.length ? Math.round(total / 5) : 0;
  const shares = kinds.map((k) => (test.counts[part][k] * quota) / total);
  const give = shares.map(Math.floor);
  const byRest = shares.map((s, i) => [s - give[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let r = quota - give.reduce((a, b) => a + b, 0), j = 0; r > 0; r--, j++) give[byRest[j][1]]++;
  const tieTrue = rng() < 0.5;

  const lists = kinds.map((kind) => {
    const by = {};
    for (const L of [...earlier, ...covered]) {
      by[L.id] = shuffled(candidates(kind, L, ctx).filter((c) => !ctx.isExcluded(kind, c.src)), rng);
    }
    return by;
  });
  const picked = []; // { q, ki, li, truth, c, d? }
  const truths = (ki) => { const p = picked.filter((x) => x.ki === ki && x.truth !== undefined); const t = p.filter((x) => x.truth).length; return [t, p.length - t]; };
  const orderText = () => picked.filter((x) => x.q.kind === "order").map((x) => x.q.answer.join(""));
  const handWords = () => picked.filter((x) => x.q.kind === "hand").map((x) => x.q.word);
  // Take one question of kind ki from a lesson's list; true/false items are taken so that both stay present.
  // pref: items to take first (the rest only when the lesson has no such item).
  const take = (ki, L, pref) => {
    const kind = kinds[ki], list = lists[ki][L.id];
    const free = (c) => !used.has(c.src) && !(TARGET.has(kind) && ctx.relax < 2 && ctx.targets.has(c.src))
      && !(kind === "hand" && orderText().some((t) => t.includes(c.src)));
    while (list.length) {
      let at = list.findIndex((c) => free(c) && (!pref || pref(c)));
      if (at < 0) return false;
      if (kind === "judge") {
        const [t, f] = truths(ki), want = t === f ? tieTrue : t < f;
        const w = list.findIndex((c) => free(c) && c.truth === want);
        if (w >= 0) at = w;
      }
      const [c] = list.splice(at, 1);
      const f = c.make();
      if (!f) continue;
      const { full, sent = [], owner, wrong, ...fields } = f;
      // A sentence the paper already plays or prints whole is not asked again (questions on one text may follow each other).
      const own = sent.map(han).filter(Boolean);
      if (own.some((h) => ctx.leaks(h, owner))) continue;
      if (kind === "order" && handWords().some((w) => fields.answer.join("").includes(w))) continue;
      const sig = [fields.audio?.join("/"), fields.context?.join("/"), fields.text, fields.options?.[fields.answer]].join("|");
      if (fields.shape === "choice" && ctx.seen.has(sig)) continue;
      if (full && ctx.fulls.has(full)) continue;
      if (fields.shape === "choice") ctx.seen.add(sig);
      if (full) ctx.fulls.add(full);
      for (const h of own) ctx.leak.push({ h, owner });
      if (wrong) { // a reply: remember its answer, wrong options and option set
        ctx.replyAnswers.add(fields.options[fields.answer]);
        for (const o of wrong) ctx.replyWrong.add(o);
        ctx.replySets.add([...fields.options].sort().join("|"));
      }
      used.add(c.src);
      if (TARGET.has(kind) && !(kind === "hear" && ctx.relax >= 1)) ctx.targets.add(c.src);
      const q = { part, kind, lesson: c.lesson, src: c.src, key: c.key, ...fields };
      Object.assign(q, finish(fields, ctx));
      picked.push({ ki, li: order.get(L.id), truth: c.truth, c, q });
      return true;
    }
    return false;
  };
  // Draw n questions of one kind, spread evenly over the given lessons (round robin from a random lesson).
  const draw = (ki, lessons, n, pref) => {
    if (!lessons.length || n <= 0) return 0;
    const start = Math.floor(rng() * lessons.length);
    const ring = [...lessons.slice(start), ...lessons.slice(0, start)];
    let got = 0, moved = true;
    while (got < n && moved) {
      moved = false;
      for (const L of ring) {
        if (got >= n) break;
        if (take(ki, L, pref)) { got++; moved = true; }
      }
    }
    return got;
  };
  // Handwriting prefers words that are printed nowhere else on the paper, and falls back to the others.
  const unprinted = (c) => !ctx.printed.some((s) => s.includes(c.src));
  const go = (ki, lessons, n) => {
    if (kinds[ki] !== "hand") return draw(ki, lessons, n);
    const g = draw(ki, lessons, n, unprinted);
    return g + (g < n ? draw(ki, lessons, n - g) : 0);
  };
  kinds.forEach((kind, ki) => {
    const count = test.counts[part][kind];
    let got = go(ki, earlier, give[ki]);
    got += go(ki, covered, count - got);
    go(ki, earlier, count - got);
  });
  // A kind that ran short is made up by the other kinds of the same part.
  let missing = total - picked.length;
  while (missing > 0) {
    let progress = false;
    for (let ki = 0; ki < kinds.length && missing > 0; ki++) {
      const g = go(ki, covered, 1) || go(ki, earlier, 1);
      if (g) { missing--; progress = true; }
    }
    if (!progress) throw new Error(`${ctx.book.id} ${test.id}: part ${part} is short by ${missing} question(s)`);
  }
  // True or false: when both are on offer, both are on the paper (at least a quarter of each from 4 questions).
  const ji = kinds.indexOf("judge");
  if (ji >= 0) {
    const mine = () => picked.filter((x) => x.ki === ji);
    const need = Math.max(1, Math.ceil(mine().length / 4));
    for (const side of [true, false]) {
      while (mine().filter((x) => x.truth === side).length < need) {
        // swap the last pick of the other side for an unused item of this side
        const victim = [...mine()].reverse().find((x) => x.truth === !side);
        let swap = null;
        for (const L of [...covered, ...earlier]) {
          const at = lists[ji][L.id].findIndex((c) => !used.has(c.src) && c.truth === side);
          if (at >= 0) { swap = [L, at]; break; }
        }
        if (!victim || !swap) break;
        used.delete(victim.c.src);
        picked.splice(picked.indexOf(victim), 1);
        const [L, at] = swap, [c] = lists[ji][L.id].splice(at, 1);
        lists[ji][L.id].unshift(c); // take() picks the wanted side first
        if (!take(ji, L)) { picked.push(victim); used.add(victim.c.src); break; }
      }
    }
  }
  return picked.sort((a, b) => a.ki - b.ki || a.li - b.li).map((p) => p.q);
}

// How the screen and the sample tool build papers the same way: the book's excludes and near pairs, the fill words
// the teachers wrote, and prior books.
export function optsFor(book, books, excludeJson = {}, fillJson = {}) {
  const mine = excludeJson[book.id] || {};
  const fill = fillJson?.[book.id];
  return {
    exclude: mine.exclude || [],
    near: mine.near || [],
    priorBooks: (PRIOR[book.id] || []).map((id) => books.find((b) => b.id === id)).filter(Boolean),
    ...(fill && Object.keys(fill).length ? { fill } : {}),
  };
}

function attempt(test, book, seed, opts) {
  const rng = mulberry32(seed);
  const exclude = new Set(opts.exclude || []);
  const near = new Map();
  for (const [a, b] of opts.near || []) {
    (near.get(a) || near.set(a, new Set()).get(a)).add(b);
    (near.get(b) || near.set(b, new Set()).get(b)).add(a);
  }
  const taught = book.lessons.slice(0, test.after);
  const prior = (opts.priorBooks || []).flatMap((b) => b.lessons);
  const pool = wordsOf([...taught, ...prior]);
  const taughtChars = new Set(pool.flatMap((w) => [...w.w]));
  const ctx = {
    rng, book, taught, pool, relax: 0,
    bookWords: wordsOf(book.lessons),
    replies: workbookOf(taught).filter((d) => d.kind === "reply").map((d) => ({ q: d.q, a: d.a })),
    fillMap: opts.fill,
    seen: new Set(), fulls: new Set(), replyAnswers: new Set(), replyWrong: new Set(), replySets: new Set(), targets: new Set(), printed: [], leak: [],
    // Does a sentence repeat one the paper already plays or prints (equal, or one holds the other and the shorter has 4+ characters)?
    leaks: (h, owner) => !!h && ctx.relax < 4 && ctx.leak.some((x) => !(owner && x.owner === owner)
      && (x.h === h || (ctx.relax < 3 && ((x.h.length >= 4 && h.includes(x.h)) || (h.length >= 4 && x.h.includes(h)))))),
    isNear: (a, b) => !!near.get(a)?.has(b),
    isExcluded: (kind, src) => exclude.has(src) || exclude.has(kind + ":" + src),
    newChars: (strings) => hanOf(strings).filter((c) => !taughtChars.has(c)).join(""),
  };
  // A part that cannot be filled is built again with one rule relaxed more, until it can (the other parts keep every rule).
  const keep = () => ({ seen: new Set(ctx.seen), fulls: new Set(ctx.fulls), targets: new Set(ctx.targets), replyAnswers: new Set(ctx.replyAnswers),
    replyWrong: new Set(ctx.replyWrong), replySets: new Set(ctx.replySets), printed: [...ctx.printed], leak: [...ctx.leak] });
  let worst = 0;
  const relaxedParts = {}, built = {};
  // Grammar is built first: it has no other kind to fall back on, so the other parts leave its sentences alone.
  // The paper keeps the order of PARTS.
  for (const id of ["grammar", ...PARTS.map((p) => p.id).filter((id) => id !== "grammar")]) {
    const before = keep();
    for (ctx.relax = 0; ; ctx.relax++) {
      try {
        built[id] = buildPart(id, test, ctx);
        if (ctx.relax) { relaxedParts[id] = ctx.relax; worst = Math.max(worst, ctx.relax); }
        break;
      } catch (e) {
        if (ctx.relax >= 4) throw e;
        Object.assign(ctx, {
          seen: new Set(before.seen), fulls: new Set(before.fulls), targets: new Set(before.targets), replyAnswers: new Set(before.replyAnswers),
          replyWrong: new Set(before.replyWrong), replySets: new Set(before.replySets), printed: [...before.printed], leak: [...before.leak],
        });
      }
    }
  }
  let n = 0;
  const parts = PARTS.map((p) => ({ id: p.id, cn: p.cn, en: p.en, questions: built[p.id].map((q) => ({ n: ++n, ...q })) }));
  return { book: book.id, test: test.id, seed, relaxed: worst, relaxedParts, parts };
}

// A part that cannot be filled has its rules relaxed one step at a time (paper.relaxed is the most any part needed,
// paper.relaxedParts says which part): 1 words that were heard may be asked again; 2 any word may be asked twice;
// 3 a sentence may sit inside another; 4 a sentence may repeat.
export function buildPaper(test, book, seed, opts = {}) {
  return attempt(test, book, seed, opts);
}
