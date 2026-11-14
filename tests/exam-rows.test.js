import { describe, it, expect } from "vitest";
import { bookRows, sealFor, markOf } from "../src/exam/rows.js";
import { grade } from "../src/exam/grade.js";

const book = (n) => ({ lessons: Array.from({ length: n }, (_, i) => ({ n: i + 1 })) });
const order = (b) => bookRows(b).map((r) => (r.type === "lesson" ? r.lesson.n : r.test.id));

describe("bookRows", () => {
  it("15 lessons: tests sit after their lesson, 期中 2 then 期末 at the end", () => {
    const o = order(book(15));
    expect(o.slice(-3)).toEqual([15, "mid2", "final"]);
    expect(o.indexOf("mid1")).toBe(o.indexOf(8) + 1);
    expect(o.filter((x) => typeof x === "number")).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
  it("10 lessons: 期中 2 then 期末 at the end", () => {
    const o = order(book(10));
    expect(o.slice(-3)).toEqual([10, "mid2", "final"]);
    expect(o).toContain("mid1");
  });
  it("a book with too few lessons does not fail", () => {
    expect(() => bookRows(book(1))).not.toThrow();
    expect(bookRows({ lessons: [] })).toEqual([]);
    expect(bookRows({})).toEqual([]);
  });
});

describe("sealFor agrees with grade", () => {
  const paper = { parts: ["listen", "vocab", "grammar", "read", "write"].map((id, i) => ({ id, questions: [0, 1].map((k) => ({ n: i * 2 + k + 1, shape: "choice", answer: 1, lesson: 1 })) })) };
  const all = Object.fromEntries(paper.parts.flatMap((p) => p.questions.map((q) => [q.n, 1])));
  it("perfect paper", () => { const g = grade(paper, all); expect(g.total).toBe(500); expect(sealFor(g.total)).toBe(g.seal); });
  it("one wrong answer", () => { const g = grade(paper, { ...all, 1: 0 }); expect(g.total).toBe(450); expect(sealFor(g.total)).toBe(g.seal); });
});

describe("sealFor", () => {
  it("thresholds", () => {
    expect(sealFor(299)).toBe(null);
    expect(sealFor(300)).toBe("合格");
    expect(sealFor(399)).toBe("合格");
    expect(sealFor(400)).toBe("良好");
    expect(sealFor(450)).toBe("优秀");
    expect(sealFor(499)).toBe("优秀");
    expect(sealFor(500)).toBe("满分");
    expect(sealFor(undefined)).toBe(null);
  });
  it("marks", () => {
    expect(["small", "mid", "final"].map((kind) => markOf({ kind }))).toEqual(["测", "中", "末"]);
  });
});
