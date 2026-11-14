import { describe, it, expect } from "vitest";
import { BOOKS } from "../src/data/index.js";
import EXCLUDE from "../src/data/exam-exclude.json";
import FILL from "../src/data/exam-fill.json";
import { exerciseItems } from "../src/progress/lesson-exercises.js";
import { testsOf, PARTS, PRIOR } from "../src/exam/plan.js";
import { buildPaper, optsFor } from "../src/exam/build.js";

// The exercise whose items carry each kind's progress key.
const EX = { hear: "hear", sentence: "sentence", dialog: "wb-dialog", meaning: "cards", pick: "cards", fill: "fill", blank: "gr-fill",
  judge: "wb-judge", reply: "wb-reply", text: "text-quiz", order: "order", hand: "dict" };
const bookOf = (id) => BOOKS.find((b) => b.id === id);
const priorOf = (b) => (PRIOR[b.id] || []).map(bookOf);
const real = (b) => optsFor(b, BOOKS, EXCLUDE, FILL);
const all = (p) => p.parts.flatMap((x) => x.questions);
const keysOf = (b, q) => {
  const L = b.lessons.find((l) => l.id === q.lesson);
  return new Set(exerciseItems(EX[q.kind], L).flatMap((e) => [].concat(e.item)));
};
const cases = BOOKS.flatMap((b) => testsOf(b).map((t) => [b, t]));
// 8 seeds in the normal run (the deploy runs every test); EXAM_SEEDS=20 npm test for the full sweep.
const SEEDS = Array.from({ length: Number(process.env.EXAM_SEEDS) || 8 }, (_, i) => i + 1);
const HAN = /\p{Script=Han}/u, HANS = /\p{Script=Han}/gu;
const senses = (en) => new Set(en.replace(/[(（\[][^)）\]]*[)）\]]/g, "").split(/[;,/]/)
  .map((s) => s.trim().toLowerCase().replace(/^(to|a|an|the)\s+/, "")).filter(Boolean));
const share = (a, b) => { const s = senses(a); return [...senses(b)].some((x) => s.has(x)); };
const shown = (q) => (q.shape === "choice" ? [q.text || "", ...(q.context || []), ...q.options] : q.shape === "order" ? [...q.tiles, q.tail] : []);

describe("buildPaper: every book, every test, many seeds, with the real exclude list", () => {
  for (const [b, t] of cases) {
    it(`${b.id} ${t.id}`, () => {
      const opts = real(b), ex = new Set(opts.exclude);
      const covered = new Set([...t.lessons, ...t.earlier].map((l) => l.id));
      const taught = new Set();
      for (const l of [...b.lessons.slice(0, t.after), ...priorOf(b).flatMap((x) => x.lessons)]) for (const w of l.words) for (const c of w.w) taught.add(c);
      const idx = (id) => b.lessons.findIndex((l) => l.id === id);
      const judges = [...t.lessons, ...t.earlier].flatMap((l) => exerciseItems("wb-judge", l).map((e) => e.of)).filter((d) => !ex.has(d.id));
      for (const seed of SEEDS) {
        const p = buildPaper(t, b, seed, opts);
        expect(p.parts.map((x) => x.id)).toEqual(PARTS.map((x) => x.id));
        const qs = all(p);
        expect(qs).toHaveLength(t.total);
        expect(qs.map((q) => q.n)).toEqual(qs.map((_, i) => i + 1));
        const seen = new Set(), fulls = new Set();
        for (const part of p.parts) {
          const want = Object.values(t.counts[part.id]).reduce((s, n) => s + n, 0);
          expect(part.questions).toHaveLength(want);
          expect(new Set(part.questions.map((q) => q.src)).size).toBe(want);
          const kinds = Object.keys(t.counts[part.id]);
          for (let i = 1; i < part.questions.length; i++) {
            const a = part.questions[i - 1], c = part.questions[i];
            const ka = kinds.indexOf(a.kind), kc = kinds.indexOf(c.kind);
            expect(kc >= ka).toBe(true);
            if (ka === kc) expect(idx(c.lesson) >= idx(a.lesson)).toBe(true);
          }
        }
        for (const q of qs) {
          const where = `${b.id} ${t.id} seed ${seed} #${q.n} ${q.kind}`;
          expect(covered.has(q.lesson), where).toBe(true);
          expect(keysOf(b, q).has(q.key), where).toBe(true);
          expect(ex.has(q.src) || ex.has(q.kind + ":" + q.src), where).toBe(false);
          // newChars: exactly the untaught Han characters on show
          const want = [...new Set(shown(q).join("").match(HANS) || [])].filter((c) => !taught.has(c));
          expect([...q.newChars].sort(), where).toEqual(want.sort());
          if (q.shape === "choice") {
            expect(new Set(q.options).size, where).toBe(q.options.length);
            expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, where).toBe(true);
            expect(q.options.length, where).toBeGreaterThanOrEqual(q.kind === "judge" ? 2 : 3);
            expect(["zh", "en"]).toContain(q.lang);
            expect(["zh", "en"]).toContain(q.textLang);
            expect(q.pyOptions, where).toBe(q.options.some((o) => [...o].some((c) => q.newChars.includes(c))));
            if (q.lang === "en") {
              for (const o of q.options) expect(HAN.test(o), where + " " + o).toBe(false);
              if (q.kind === "hear" || q.kind === "meaning") {
                for (let i = 0; i < q.options.length; i++) for (let j = i + 1; j < q.options.length; j++) {
                  expect(share({ en: q.options[i] }.en, q.options[j]), `${where}: ${q.options[i]} / ${q.options[j]}`).toBe(false);
                }
              }
            }
            if (q.textLang === "en") expect(HAN.test(q.text), where).toBe(false);
            const sig = [q.audio?.join("/"), q.context?.join("/"), q.text, q.options[q.answer]].join("|");
            expect(seen.has(sig), "repeated question: " + where).toBe(false);
            seen.add(sig);
            if (q.kind === "fill" || q.kind === "blank") {
              const full = q.text.replace("___", q.options[q.answer]);
              expect(fulls.has(full), "repeated sentence: " + where).toBe(false);
              fulls.add(full);
            }
          } else if (q.shape === "order") {
            expect([...q.tiles].sort()).toEqual([...q.answer].sort());
            expect(q.tiles.join("|")).not.toBe(q.answer.join("|"));
            expect(q.tiles.join("")).not.toBe(q.answer.join(""));
            expect(typeof q.en).toBe("string");
          } else {
            expect(q.shape).toBe("write");
            expect(q.word && q.py && q.en).toBeTruthy();
          }
        }
        // true or false: mixed when the pool allows
        const js = qs.filter((q) => q.kind === "judge");
        const tr = js.filter((q) => q.answer === 0).length, fa = js.length - tr;
        if (judges.some((d) => d.ok) && judges.some((d) => !d.ok)) {
          // (a quarter of each, rounded down: a judge item the sentence rules turned away can leave one short of a quarter)
          const least = Math.max(1, Math.floor(js.length / 4));
          expect(tr, `${b.id} ${t.id} seed ${seed}`).toBeGreaterThanOrEqual(least);
          expect(fa, `${b.id} ${t.id} seed ${seed}`).toBeGreaterThanOrEqual(least);
        }
      }
    }, 120000);
  }

  it("also builds with no excludes at all", () => {
    for (const [b, t] of cases) expect(all(buildPaper(t, b, 1, { priorBooks: priorOf(b) }))).toHaveLength(t.total);
  });
});

describe("buildPaper: seeds, halves, earlier lessons", () => {
  const hsk1 = bookOf("hsk1");
  const ts = Object.fromEntries(testsOf(hsk1).map((t) => [t.id, t]));

  it("same seed gives the same paper, another seed another paper", () => {
    for (const [b, t] of [[hsk1, ts.s2], [hsk1, ts.final], [bookOf("ledu"), testsOf(bookOf("ledu")).at(-1)]]) {
      const a = buildPaper(t, b, 5, real(b)), c = buildPaper(t, b, 5, real(b)), d = buildPaper(t, b, 6, real(b));
      expect(c).toEqual(a);
      expect(d).not.toEqual(a);
    }
  });

  it("a mid test only asks its own half", () => {
    for (const b of BOOKS) for (const t of testsOf(b).filter((x) => x.kind === "mid")) {
      const own = new Set(t.lessons.map((l) => l.id));
      for (const q of all(buildPaper(t, b, 3, real(b)))) expect(own.has(q.lesson)).toBe(true);
    }
  });

  it("small tests after the first take about a fifth of the paper from earlier lessons", () => {
    for (const b of BOOKS) for (const t of testsOf(b).filter((x) => x.kind === "small")) {
      const own = new Set(t.lessons.map((l) => l.id));
      for (const seed of [1, 2, 3, 4]) {
        const p = buildPaper(t, b, seed, real(b));
        const early = all(p).filter((q) => !own.has(q.lesson)).length / t.total;
        if (!t.earlier.length) expect(early).toBe(0);
        else {
          // a part whose own lessons run out of fair questions takes more from earlier ones, so the paper as a whole is held to 15-35%
          expect(early, `${b.id} ${t.id} seed ${seed}`).toBeGreaterThanOrEqual(0.15);
          expect(early, `${b.id} ${t.id} seed ${seed}`).toBeLessThanOrEqual(0.35);
        }
      }
    }
  });
});

describe("buildPaper: exclude and near", () => {
  const b = bookOf("hsk1"), t = testsOf(b)[0];

  it("every kind-specific exclude of the real list matches a real source id", () => {
    let order = 0, orderMiss = 0;
    for (const book of BOOKS) for (const e of EXCLUDE[book.id].exclude) {
      const [kind, ...rest] = e.split(":"), src = rest.join(":");
      if (!["fill", "order", "sentence"].includes(kind)) continue;
      const have = book.lessons.flatMap((L) => exerciseItems(EX[kind], L).map(({ of }) => kind === "fill" ? of.w : kind === "order" ? of.hz : of.ex.hz.replace(/[AB]: /g, "")));
      if (kind === "order") { order++; if (!have.includes(src)) orderMiss++; } // a sentence of under 3 words is no candidate: harmless
      else expect(have, book.id + " " + e).toContain(src);
    }
    expect(orderMiss).toBeLessThanOrEqual(order * 0.05);
  });

  it("the three kind-specific forms remove those questions", () => {
    for (const book of BOOKS) {
      const final = testsOf(book).at(-1);
      for (const kind of ["fill", "order", "sentence"]) {
        const picks = EXCLUDE[book.id].exclude.filter((e) => e.startsWith(kind + ":")).slice(0, 5);
        if (!picks.length) continue;
        const without = { priorBooks: priorOf(book) };
        for (const s of [1, 2, 3]) {
          const p = all(buildPaper(final, book, s, { ...without, exclude: picks }));
          expect(p).toHaveLength(final.total);
          for (const q of p) expect(picks).not.toContain(q.kind + ":" + q.src);
        }
      }
    }
  });

  it("a plain id and a kind-only exclude", () => {
    const base = all(buildPaper(t, b, 9));
    const plain = base.filter((q) => q.kind === "dialog" || q.kind === "hear").map((q) => q.src);
    const only = base.filter((q) => q.kind === "fill" || q.kind === "order").map((q) => q.kind + ":" + q.src);
    const p = all(buildPaper(t, b, 9, { exclude: [...plain, ...only] }));
    expect(p).toHaveLength(t.total);
    for (const q of p) {
      expect(plain).not.toContain(q.src);
      expect(only).not.toContain(q.kind + ":" + q.src);
    }
  });

  it("a near pair never shares a question", () => {
    const words = t.lessons.flatMap((l) => l.words.map((w) => w.w));
    const pairs = [[words[0], words[1]], [words[2], words[3]], [words[4], words[5]], ["你", "您"], ["不", "没"]];
    for (const seed of SEEDS) for (const q of all(buildPaper(t, b, seed, { near: pairs }))) {
      if (q.shape !== "choice" || ["dialog", "blank", "text"].includes(q.kind)) continue; // given options are not the builder's
      const here = new Set([...q.options, ...(q.audio || [])]);
      for (const [x, y] of pairs) expect(here.has(x) && here.has(y)).toBe(false);
    }
  });
});

describe("buildPaper: short kinds and parts", () => {
  const b = bookOf("hsk1"), t = testsOf(b)[0];

  it("the other kinds make up a kind that is short", () => {
    const fills = t.lessons.flatMap((l) => exerciseItems("fill", l).map((e) => e.of.w));
    const exclude = fills.slice(1).map((w) => "fill:" + w); // one fill item left, three are asked
    for (const seed of [1, 2, 3]) {
      const vocab = buildPaper(t, b, seed, { exclude }).parts[1].questions;
      expect(vocab).toHaveLength(10);
      expect(vocab.filter((q) => q.kind === "fill").length).toBeLessThanOrEqual(1);
      expect(new Set(vocab.map((q) => q.src)).size).toBe(10);
    }
  });

  it("a part that cannot be filled throws with the test and the part", () => {
    const thin = { ...b, lessons: b.lessons.map((l) => ({ ...l, grammar: [] })) };
    expect(() => buildPaper({ ...t, lessons: thin.lessons.slice(0, 3) }, thin, 1)).toThrow(/s1.*grammar/);
  });
});

/* ---------- The paper-wide rules ---------- */
const strip = (s) => s.replace(/^男：/, "");
const hanOnly = (s) => (strip(s).match(HANS) || []).join("");
const sentencesOf = (q) => {
  if (q.shape === "order") return [q.answer.join("")];
  const fill = q.text?.includes("___") ? q.text.replace("___", q.options[q.answer]) : null;
  const by = { hear: () => q.audio, sentence: () => q.audio, dialog: () => [...q.audio, q.text], judge: () => [q.context[0], q.text],
    reply: () => [q.text, ...q.options], text: () => q.context, fill: () => [fill], blank: () => [fill] };
  return by[q.kind]?.() || [];
};
const clash = (a, b) => a === b || (b.length >= 4 && a.includes(b)) || (a.length >= 4 && b.includes(a));
const BAN = ["今天", "明天", "昨天", "现在", "上午", "下午", "中午", "晚上", "早上", "每天", "今年", "明年", "去年", "以前", "以后", "星期", "周末", "月", "号", "点", "和", "跟", "又", "可能", "也许", "因为", "所以", "一起"];
const TARGETS = ["hear", "meaning", "pick", "fill", "hand"];

describe("buildPaper: the rules that hold across a paper (many seeds, real excludes and fill words)", () => {
  const stats = { relaxed: {} };
  for (const [b, t] of cases) {
    it(`${b.id} ${t.id}`, () => {
      const opts = real(b);
      const examples = new Set(b.lessons.flatMap((l) => l.words.filter((w) => w.ex?.hz).map((w) => w.ex.hz.replace(/[AB]: /g, ""))));
      for (const seed of SEEDS) {
        const p = buildPaper(t, b, seed, opts), qs = all(p), where = `${b.id} ${t.id} seed ${seed}`;
        if (p.relaxed) stats.relaxed[where] = p.relaxed;
        // A: a sentence the paper plays or prints whole is not repeated (one text may follow itself)
        {
          const list = qs.map((q) => ({ q, s: sentencesOf(q).map(hanOnly).filter(Boolean), owner: q.kind === "text" ? q.src.replace(/#\d+$/, "") : null }));
          for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
            if (list[i].owner && list[i].owner === list[j].owner) continue;
            if ((p.relaxedParts[list[i].q.part] || 0) >= 3 || (p.relaxedParts[list[j].q.part] || 0) >= 3) continue; // that part had to allow it
            for (const a of list[i].s) for (const c of list[j].s) expect(clash(a, c), `A ${where}: #${list[i].q.n} ${a} / #${list[j].q.n} ${c}`).toBe(false);
          }
        }
        // B: a word is the target of one question only
        if (p.relaxed === 0) {
          const targets = qs.filter((q) => TARGETS.includes(q.kind)).map((q) => q.src);
          expect(new Set(targets).size, "B " + where).toBe(targets.length);
        }
        const orders = qs.filter((q) => q.kind === "order");
        for (const q of qs.filter((x) => x.kind === "hand")) for (const o of orders) expect(o.answer.join("").includes(q.src), `C ${where} ${q.src}`).toBe(false); // C
        for (const q of orders) { // D
          expect(examples.has(q.src), "D example " + where).toBe(true);
          expect(new Set(q.answer).size).toBe(q.answer.length);
          expect(q.answer.length).toBeGreaterThanOrEqual(3);
          expect(/[，、；：！？。…“”]/.test(q.src.slice(0, q.src.length - q.tail.length)), "D punct " + where).toBe(false);
          for (const tile of q.answer) for (const m of BAN) expect(tile.includes(m), `D ${where} ${tile}`).toBe(false);
        }
        // E: with the teachers' words, a fill question has exactly their options
        const fillMap = FILL[b.id];
        for (const q of qs.filter((x) => x.kind === "fill")) {
          const e = fillMap[q.src], L = b.lessons.find((l) => l.id === q.lesson);
          const set = Array.isArray(e) ? e : e?.[L.n];
          expect(set, "E has a set " + where + " " + q.src).toBeTruthy();
          expect([...q.options].sort(), "E " + where).toEqual([q.src, ...new Set(set)].sort());
        }
        // G: replies
        const reps = qs.filter((q) => q.kind === "reply");
        const sets = reps.map((q) => [...q.options].sort().join("|"));
        expect(new Set(sets).size, "G sets " + where).toBe(sets.length);
        const lessons = {};
        for (const q of reps) lessons[q.lesson] = (lessons[q.lesson] || 0) + 1;
        for (const q of reps) expect(q.options.filter((o, i) => i !== q.answer && reps.some((r) => r !== q && r.options[r.answer] === o)).length, "G answers " + where).toBe(0);
      }
    }, 120000);
  }

  it("the sentence listening options carry no speaker tags", () => {
    for (const [b, t] of cases) for (const q of all(buildPaper(t, b, 2, real(b))).filter((x) => x.kind === "sentence")) {
      for (const o of q.options) expect(/[AB]: /.test(o)).toBe(false);
    }
  });
});

describe("buildPaper: the teachers' fill words", () => {
  const b = bookOf("hsk1"), t = testsOf(b)[0];

  it("with a small fixture map only those words are asked, with exactly those options", () => {
    const words = t.lessons.flatMap((l) => l.words.filter((w) => w.ex?.hz?.includes(w.w)).map((w) => w.w)).slice(0, 8);
    const fill = Object.fromEntries(words.map((w, i) => [w, ["甲" + i, "乙" + i, "丙" + i]]));
    for (const seed of [1, 2, 3]) {
      const paper = buildPaper(t, b, seed, { fill });
      expect(all(paper)).toHaveLength(t.total);
      for (const q of all(paper).filter((x) => x.kind === "fill")) {
        expect(words).toContain(q.src);
        expect([...q.options].sort()).toEqual([q.src, ...fill[q.src]].sort());
      }
    }
  });

  it("a word with sets per lesson uses its own lesson's set, and is skipped for another lesson", () => {
    const L = t.lessons[1], w = L.words.find((x) => x.ex?.hz?.includes(x.w));
    const fill = { [w.w]: { [L.n]: ["甲", "乙", "丙"], 99: ["x", "y", "z"] } };
    for (const seed of [1, 2, 3, 4, 5]) for (const q of all(buildPaper(t, b, seed, { fill })).filter((x) => x.kind === "fill")) {
      expect(q.src).toBe(w.w);
      expect(q.lesson).toBe(L.id);
      expect([...q.options].sort()).toEqual([w.w, "甲", "乙", "丙"].sort());
    }
  });

  it("optsFor hands over the book's fill words, and works without the file", () => {
    expect(optsFor(b, BOOKS, EXCLUDE, FILL).fill).toBe(FILL.hsk1);
    expect(optsFor(b, BOOKS, EXCLUDE).fill).toBeUndefined();
    expect(optsFor(b, BOOKS, EXCLUDE, { ledu: {} }).fill).toBeUndefined();
  });
});
