import { describe, it, expect } from "vitest";
import { grade } from "../src/exam/grade.js";

// A small paper: 5 parts of 10 questions each (mixed shapes), lessons b/1 (first 7 of each part) and b/2.
function paper() {
  let n = 0;
  const parts = ["listen", "vocab", "grammar", "read", "write"].map((id) => ({
    id,
    questions: Array.from({ length: 10 }, (_, i) => {
      const shape = id === "write" ? (i < 5 ? "order" : "write") : "choice";
      const base = { n: ++n, part: id, shape, lesson: i < 7 ? "b/1" : "b/2" };
      return shape === "order" ? { ...base, answer: ["a", "b"] } : shape === "write" ? base : { ...base, answer: 1 };
    }),
  }));
  return { parts };
}
const rightOf = (q) => (q.shape === "order" ? ["a", "b"] : q.shape === "write" ? true : 1);
const right = (p) => Object.fromEntries(p.parts.flatMap((x) => x.questions).map((q) => [q.n, rightOf(q)]));
// The first k questions right, the rest unanswered.
const firstRight = (p, k) => Object.fromEntries(Object.entries(right(p)).filter(([n]) => Number(n) <= k));

describe("grade", () => {
  it("all right: 500 and 满分", () => {
    const p = paper(), g = grade(p, right(p));
    expect(g.total).toBe(500);
    expect(g.max).toBe(500);
    expect(g.pct).toBe(100);
    expect(g.pass).toBe(true);
    expect(g.seal).toBe("满分");
    expect(g.missed).toEqual([]);
    expect(g.weak).toEqual([]);
    expect(g.parts[0]).toEqual({ id: "listen", right: 10, total: 10, score: 100 });
  });

  it("nothing answered: 0, no seal, everything unanswered", () => {
    const p = paper(), g = grade(p, {});
    expect(g.total).toBe(0);
    expect(g.pass).toBe(false);
    expect(g.seal).toBe(null);
    expect(g.unanswered).toHaveLength(50);
    expect(g.missed).toHaveLength(50);
  });

  it("wrong answers are missed but not unanswered", () => {
    const p = paper(), a = right(p);
    a[1] = 0; a[41] = ["b", "a"]; a[46] = false;
    const g = grade(p, a);
    expect(g.missed).toEqual([1, 41, 46]);
    expect(g.unanswered).toEqual([]);
    expect(g.parts[0].right).toBe(9);
    expect(grade(p, { ...a, 41: [] }).unanswered).toEqual([41]);
  });

  it("seal thresholds", () => {
    const p = paper();
    expect(grade(p, firstRight(p, 29)).seal).toBe(null);
    expect(grade(p, firstRight(p, 29)).pass).toBe(false);
    expect(grade(p, firstRight(p, 30)).seal).toBe("合格");
    expect(grade(p, firstRight(p, 30)).pass).toBe(true);
    expect(grade(p, firstRight(p, 40)).seal).toBe("良好");
    expect(grade(p, firstRight(p, 45)).seal).toBe("优秀");
    // 49 right is 98%: 优秀, not 满分
    const a = right(p); delete a[7];
    expect(grade(p, a).seal).toBe("优秀");
  });

  it("each part is scaled to 100 and the pass line is 300", () => {
    const p = paper(), a = right(p);
    for (const n of [1, 2, 3, 11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43]) delete a[n];
    const g = grade(p, a);
    expect(g.parts.map((x) => x.score)).toEqual([70, 70, 70, 70, 70]);
    expect(g.total).toBe(350);
    expect(g.pct).toBe(70);
  });

  it("weak lessons: most lost first, only lessons that lost something", () => {
    const p = paper(), a = right(p);
    for (const n of [1, 2, 3, 9, 10, 19, 20, 29]) delete a[n]; // b/1 loses 3 (of 35), b/2 loses 5 (of 15)
    expect(grade(p, a).weak).toEqual([{ lesson: "b/2", lost: 50, missed: 5, of: 15 }, { lesson: "b/1", lost: 30, missed: 3, of: 35 }]);
  });

  it("weak lessons weigh a miss by its part (points)", () => {
    const p = paper();
    p.parts[0].questions = p.parts[0].questions.slice(0, 5); // listen: 20 points each
    const a = {};
    for (const q of p.parts.flatMap((x) => x.questions)) a[q.n] = rightOf(q);
    delete a[1]; delete a[2]; // two listening misses in b/1: 40 points
    delete a[31]; delete a[32]; delete a[33]; // three misses in another part: 10 points each
    const g = grade(p, a);
    expect(g.weak[0]).toMatchObject({ lesson: "b/1", lost: 70, missed: 5 });
  });

  it("order answers are compared by their text", () => {
    const q = { n: 1, shape: "order", lesson: "l", answer: ["九", "十", "九"] };
    const p = { parts: [{ id: "write", questions: [q] }] };
    expect(grade(p, { 1: ["九", "十", "九"] }).parts[0].right).toBe(1);
    expect(grade(p, { 1: ["九", "九", "十"] }).parts[0].right).toBe(0);
  });
});
