import { describe, it, expect } from "vitest";
import { BOOKS } from "../src/data/index.js";
import { testsOf, testOf, PARTS, PRIOR } from "../src/exam/plan.js";

const fake = (n) => ({ id: "x", lessons: Array.from({ length: n }, (_, i) => ({ id: "x/" + (i + 1), n: i + 1 })) });
const nums = (ls) => ls.map((l) => l.n);
const partTotal = (t, part) => Object.values(t.counts[part]).reduce((a, b) => a + b, 0);

describe("testsOf", () => {
  it("15 lessons: small tests after 3, 6, 11, 14, mids after 8 and 15, final after 15", () => {
    const ts = testsOf(fake(15));
    expect(ts.map((t) => [t.id, t.after])).toEqual([["s1", 3], ["s2", 6], ["mid1", 8], ["s3", 11], ["s4", 14], ["mid2", 15], ["final", 15]]);
    const by = Object.fromEntries(ts.map((t) => [t.id, t]));
    expect(nums(by.s1.lessons)).toEqual([1, 2, 3]);
    expect(nums(by.s2.lessons)).toEqual([4, 5, 6]);
    expect(nums(by.s3.lessons)).toEqual([9, 10, 11]);
    expect(nums(by.s4.lessons)).toEqual([12, 13, 14]);
    expect(nums(by.mid1.lessons)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(nums(by.mid2.lessons)).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(by.final.lessons).toHaveLength(15);
    expect(by.s1.earlier).toEqual([]);
    expect(nums(by.s4.earlier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(by.mid1.earlier).toEqual([]);
    expect(by.final.earlier).toEqual([]);
  });

  it("10 lessons: small tests after 3 and 8, mids after 5 and 10", () => {
    const ts = testsOf(fake(10));
    expect(ts.map((t) => [t.id, t.after])).toEqual([["s1", 3], ["mid1", 5], ["s2", 8], ["mid2", 10], ["final", 10]]);
    const by = Object.fromEntries(ts.map((t) => [t.id, t]));
    expect(nums(by.s2.lessons)).toEqual([6, 7, 8]);
    expect(nums(by.mid2.lessons)).toEqual([6, 7, 8, 9, 10]);
  });

  it("sizes, minutes and names", () => {
    const big = Object.fromEntries(testsOf(fake(15)).map((t) => [t.id, t]));
    const small = Object.fromEntries(testsOf(fake(10)).map((t) => [t.id, t]));
    expect([big.s1.total, big.mid1.total, big.final.total, small.final.total]).toEqual([50, 100, 180, 150]);
    expect([big.s1.minutes, big.mid2.minutes, big.final.minutes, small.final.minutes]).toEqual([30, 60, 105, 90]);
    expect(big.s1.cn).toBe("小测 1");
    expect(big.s3.en).toBe("Small test 3");
    expect([big.mid1.cn, big.mid2.cn, big.final.cn]).toEqual(["期中 1", "期中 2", "期末"]);
    expect([big.mid1.en, big.final.en]).toEqual(["Mid-book test 1", "Final test"]);
    const want = { small: [12, 10, 8, 12, 8], mid: [25, 20, 15, 25, 15], final: [45, 35, 30, 45, 25] };
    for (const t of [big.s1, big.mid1, big.final]) expect(PARTS.map((p) => partTotal(t, p.id))).toEqual(want[t.kind]);
    expect(PARTS.map((p) => partTotal(small.final, p.id))).toEqual([38, 30, 25, 37, 20]);
  });

  it("every real book", () => {
    for (const b of BOOKS) {
      const ts = testsOf(b);
      expect(ts.length).toBe(b.lessons.length >= 15 ? 7 : 5);
      expect(ts.at(-1).id).toBe("final");
      expect(ts.at(-2).id).toBe("mid2");
      expect(testOf(b, "final")).toEqual(ts.at(-1));
      expect(testOf(b, "nope")).toBeUndefined();
      for (const t of ts) expect(t.total).toBe({ small: 50, mid: 100, final: b.lessons.length >= 15 ? 180 : 150 }[t.kind]);
    }
  });

  it("exports parts and prior books", () => {
    expect(PARTS.map((p) => p.id)).toEqual(["listen", "vocab", "grammar", "read", "write"]);
    expect(PRIOR).toEqual({ hsk2: ["hsk1"] });
  });
});
