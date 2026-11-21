import { describe, it, expect } from "vitest";
import { pickLessonWords, buildLessonCheck, spotQuestionFor, meaningQuestionFor, DAY } from "../src/lib/radical-quiz.js";

let k = 0;
const rand = () => ((k = (k * 7 + 3) % 11), k / 11);
const NOW = 1_000_000_000_000;
const A = { r: "A", full: "AA", stage: "s1", pos: "left", en: "a-en" };
const cs = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i}`);
const fam = { A: { book: cs("b", 6), common: cs("c", 12).map((c) => ({ c, en: c + "-en" })) } };

describe("pickLessonWords", () => {
  it("book characters first, n respected, no duplicates, never the radical", () => {
    const f = { A: { book: ["b0", "b1", "A", "AA", "b0"], common: [{ c: "c0" }, { c: "b1" }, { c: "c1" }] } };
    const w = pickLessonWords(A, { families: f, rand, n: 10 });
    expect(w.slice(0, 2).sort()).toEqual(["b0", "b1"]);
    expect(w).not.toContain("A");
    expect(w).not.toContain("AA");
    expect(new Set(w).size).toBe(w.length);
    expect(pickLessonWords(A, { families: fam, rand, n: 4 })).toHaveLength(4);
    expect(pickLessonWords(A, { families: fam, rand })).toHaveLength(10);
  });
  it("unseen before missed before answered right (oldest first)", () => {
    const stats = { b0: { n: 2, lastOk: true, last: NOW - 30 * DAY }, b1: { n: 1, lastOk: false, last: NOW - DAY }, b2: { n: 1, lastOk: true, last: NOW - 40 * DAY } };
    const w = pickLessonWords(A, { families: { A: { book: ["b0", "b1", "b2", "b3"], common: [] } }, seen: (c) => stats[c], rand, n: 10, now: NOW });
    expect(w).toEqual(["b3", "b1", "b2", "b0"]);
  });
  it("right within 2 days goes last when there are more than n candidates", () => {
    const stats = { b0: { n: 3, lastOk: true, last: NOW - 3600e3 } };
    const f = { A: { book: ["b0", "b1", "b2"], common: [] } };
    expect(pickLessonWords(A, { families: f, seen: (c) => stats[c], rand, n: 2, now: NOW })).not.toContain("b0");
    expect(pickLessonWords(A, { families: f, seen: (c) => stats[c], rand, n: 3, now: NOW })).toContain("b0");
  });
  it("book group stays ahead of outside characters even when book ones were seen", () => {
    const stats = { b0: { n: 1, lastOk: true, last: NOW - 10 * DAY } };
    const w = pickLessonWords(A, { families: { A: { book: ["b0"], common: [{ c: "c0" }] } }, seen: (c) => stats[c], rand, now: NOW });
    expect(w).toEqual(["b0", "c0"]);
  });
});

describe("lesson check questions", () => {
  const others = ["B", "C", "D", "E", "F"].map((r, i) => ({ r, full: r, stage: i < 3 ? "s1" : "s2", pos: "left", en: r + "-en" }));
  const all = [A, ...others];
  const families = { ...fam, ...Object.fromEntries(others.map((o) => [o.r, { book: cs(o.r.toLowerCase(), 4), common: [] }])) };
  const chars = Object.fromEntries(Object.values(families).flatMap((f) => [...f.book, ...f.common.map((x) => x.c)]).map((c) => [c, { py: "p", en: c + "-meaning" }]));
  it("spot question: four distinct options, none of the others has the radical", () => {
    const q = spotQuestionFor("b0", A, all, { families, inside: { b1: "xA" }, rand });
    expect(q.others).toHaveLength(3);
    expect(new Set([q.c, ...q.others.map((o) => o.c)]).size).toBe(4);
  });
  it("meaning question: 3 other distinct texts", () => {
    const q = meaningQuestionFor("b0", A, all, { families, chars, rand });
    const texts = [q.en, ...q.others.map((o) => o.en)];
    expect(new Set(texts.map((t) => t.toLowerCase())).size).toBe(4);
    expect(q.others.every((o) => o.r !== "A")).toBe(true);
  });
  it("ten questions alternating spot / meaning", () => {
    const q = buildLessonCheck(A, all, { families, chars, rand, inside: {} });
    expect(q).toHaveLength(10);
    expect(q.map((x) => x.type)).toEqual(Array.from({ length: 10 }, (_, i) => (i % 2 ? "meaning" : "spot")));
  });
  it("a small family gets one question per word, at least 3", () => {
    const f2 = { ...families, A: { book: ["b0", "b1", "b2", "b3", "b4"], common: [] } };
    expect(buildLessonCheck(A, all, { families: f2, chars, rand, inside: {} })).toHaveLength(5);
    const f1 = { ...families, A: { book: ["b0"], common: [] } };
    const q = buildLessonCheck(A, all, { families: f1, chars, rand, inside: {} });
    expect(q).toHaveLength(3);
    expect(q.every((x) => x.type === "spot" && x.c === "b0")).toBe(true);
  });
});

import { guessOptions } from "../src/lib/radical-quiz.js";
describe("guessOptions", () => {
  it("falls back to every meaning radical so there are always 3 wrong answers", () => {
    const R = (r, kind) => ({ r, kind, stage: "s1", pos: "left" });
    const scope = [R("a"), R("b", "shape"), R("c", "shape"), R("d", "shape")];
    const everyone = [...scope, R("e"), R("f"), R("g")];
    const f = { a: { guess: [{ c: "1", en: "one" }] }, e: { guess: [{ c: "2", en: "two" }] }, f: { guess: [{ c: "3", en: "three" }] }, g: { guess: [{ c: "4", en: "four" }] } };
    const out = guessOptions({ r: "a", en: "one" }, scope, f, rand, 3, everyone);
    expect(out).toHaveLength(3);
    expect(out).not.toContain("one");
  });
});
