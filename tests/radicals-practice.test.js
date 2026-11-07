import { describe, it, expect } from "vitest";
import { shuffleWith, pickRadicalDistractors, buildFindQuestions, buildGuessQuestions, pickGuessDistractors, dueRadicals } from "../src/lib/radical-quiz.js";
import { radicalKey } from "../src/lib/radicals.js";

const rand = () => 0.3;
const R = (r, stage, pos, extra = {}) => ({ r, full: r, stage, pos, en: r + "-en", ...extra });
const all = [R("a", "s1", "left"), R("b", "s1", "left"), R("c", "s1", "top"), R("d", "s2", "left"), R("e", "s2", "top")];
const fam = {
  a: { book: ["x1", "x2"], common: [{ c: "x3" }], guess: [{ c: "g1", py: "p", en: "lake" }] },
  b: { book: [], common: [{ c: "y1" }], guess: [{ c: "g2", py: "p", en: "tree" }] },
  c: { guess: [{ c: "g3", en: "sun" }] },
};

describe("radical practice helpers", () => {
  it("shuffleWith keeps items and is deterministic", () => {
    expect(shuffleWith([1, 2, 3, 4], rand)).toEqual(shuffleWith([1, 2, 3, 4], rand));
    expect([...shuffleWith([1, 2, 3, 4], rand)].sort()).toEqual([1, 2, 3, 4]);
  });
  it("distractors prefer same stage and pos, never the target", () => {
    const d = pickRadicalDistractors(all[0], all, rand, 3);
    expect(d).toHaveLength(3);
    expect(d).not.toContain("a");
    expect(d[0]).toBe("b");
    expect(d[1]).toBe("c");
  });
  it("distractors skip radicals contained in the character", () => {
    expect(pickRadicalDistractors(all[0], all, rand, 3, "xb")).not.toContain("b");
  });
  it("find questions: spread across radicals, capped", () => {
    const q = buildFindQuestions(all.slice(0, 2), fam, rand, 10);
    expect(q.map((x) => x.c).sort()).toEqual(["x1", "x2", "x3", "y1"]);
    expect(buildFindQuestions(all.slice(0, 2), fam, rand, 2)).toHaveLength(2);
    expect(q.find((x) => x.c === "y1").r).toBe("b");
  });
  it("guess questions: meaning radicals only, distractors from other radicals", () => {
    const rs = [all[0], all[1], { ...all[2], kind: "shape" }, all[3]];
    const q = buildGuessQuestions(rs, fam, rand, 10);
    expect(q.map((x) => x.r).sort()).toEqual(["a", "b"]);
    const d = pickGuessDistractors(q.find((x) => x.r === "a"), all, fam, rand);
    expect(d).not.toContain("lake");
    expect(new Set(d).size).toBe(d.length);
    expect(d).toEqual(expect.arrayContaining(["tree", "sun"]));
  });
  it("due radicals follow the schedule", () => {
    const day = 864e5, now = 100 * day;
    const stats = {
      [radicalKey("a")]: { n: 1, ok: 1, miss: 0, last: now - 2 * day, lastOk: true, streak: 1 },
      [radicalKey("b")]: { n: 1, ok: 1, miss: 0, last: now - 1000, lastOk: true, streak: 1 },
    };
    expect(dueRadicals(all, (k) => stats[k], now).map((r) => r.r)).toEqual(["a"]);
  });
});
