import { describe, it, expect } from "vitest";
import * as R from "../src/exam/run.js";

const ids = ["listen", "vocab", "grammar", "read", "write"];
let n = 0;
const q = (shape) => ({ n: ++n, shape, ...(shape === "order" ? { tiles: ["b", "a"], answer: ["a", "b"] } : shape === "write" ? { word: "你", py: "nǐ", en: "you" } : { options: ["x", "y", "z"], answer: 1 }) });
const paper = { book: "b", test: "s1", seed: 1, parts: ids.map((id, i) => ({ id, cn: id, en: id, questions: i === 4 ? [q("write"), q("write")] : [q("choice"), q(i === 3 ? "order" : "choice")] })) };
const fresh = () => R.newRun({ book: "b", test: "s1", seed: 1, paper, minutes: 1, now: 5 });
const sit = (run, part) => { // to the questions of a part
  let r = run;
  if (r.stage === "cover") r = R.begin(r);
  for (let i = 0; i < part; i++) r = R.finishPart(R.startPart(r));
  return R.startPart(r);
};

describe("exam run: flow", () => {
  it("goes cover → card → q → … → confirm → done", () => {
    let r = fresh();
    expect(r.stage).toBe("cover");
    r = R.begin(r); expect(r.stage).toBe("card");
    for (let i = 0; i < 5; i++) {
      expect(r.part).toBe(i);
      r = R.startPart(r); expect(r.stage).toBe("q");
      r = R.finishPart(r);
      expect(r.stage).toBe(i < 4 ? "card" : "confirm");
    }
    r = R.handIn(r);
    expect(r.stage).toBe("done");
    expect(r.timeUp).toBe(false);
  });
  it("ignores moves from the wrong stage", () => {
    const r = fresh();
    expect(R.startPart(r)).toBe(r);
    expect(R.finishPart(r)).toBe(r);
    expect(R.handIn(r)).toBe(r);
    expect(R.current(r)).toBe(null);
    expect(R.current(sit(r, 1)).n).toBe(paper.parts[1].questions[0].n);
  });
  it("backToPart returns from confirm to the last part's questions", () => {
    let r = sit(fresh(), 4);
    r = R.finishPart(r);
    expect(r.stage).toBe("confirm");
    r = R.backToPart(r);
    expect(r.stage).toBe("q");
    expect(r.part).toBe(4);
  });
  it("a finished part cannot be reopened or answered", () => {
    let r = sit(fresh(), 1);
    const old = paper.parts[1].questions[0].n;
    r = R.finishPart(r); // card of part 2
    expect(R.answer(r, old, 0)).toBe(r);
    r = R.startPart(r);
    expect(R.answer(r, old, 0)).toBe(r);
    expect(R.toggleMark(r, old)).toBe(r);
    expect(R.backToPart(r)).toBe(r);
  });
  it("nothing changes after done", () => {
    let r = R.handIn(R.finishPart(sit(fresh(), 4)));
    const q0 = paper.parts[4].questions[0].n;
    for (const t of [R.answer(r, q0, true), R.toggleMark(r, q0), R.next(r), R.prev(r), R.goto(r, 0), R.finishPart(r), R.backToPart(r), R.begin(r), R.tick(r, 1000), R.handIn(r)]) expect(t).toBe(r);
  });
});

describe("exam run: moving", () => {
  it("listening is one way", () => {
    let r = sit(fresh(), 0);
    const [q1, q2] = paper.parts[0].questions;
    r = R.answer(r, q1.n, 1);
    r = R.next(r);
    expect(r.pos).toBe(1);
    expect(R.prev(r)).toBe(r);
    expect(R.goto(r, 0)).toBe(r);
    expect(R.answer(r, q1.n, 0)).toBe(r); // left behind
    expect(R.toggleMark(r, q1.n)).toBe(r);
    expect(R.answer(r, q2.n, 0).answers[q2.n]).toBe(0);
  });
  it("is free inside the other parts", () => {
    let r = sit(fresh(), 1);
    const [a, b] = paper.parts[1].questions;
    r = R.goto(r, 1); expect(r.pos).toBe(1);
    r = R.prev(r); expect(r.pos).toBe(0);
    r = R.answer(R.goto(r, 1), a.n, 2); // an earlier question of the part can be answered from here
    expect(r.answers[a.n]).toBe(2);
    expect(R.goto(r, 5)).toBe(r);
    expect(R.next(R.goto(r, 1)).pos).toBe(1); // next stops at the last question
    expect(R.answer(r, b.n, 1).answers[b.n]).toBe(1);
  });
  it("answers only questions of the current part", () => {
    const r = sit(fresh(), 1);
    const other = paper.parts[2].questions[0].n;
    expect(R.answer(r, other, 0)).toBe(r);
    expect(R.answer(r, 999, 0)).toBe(r);
  });
});

describe("exam run: answers, marks, counting", () => {
  it("answers, clears and marks", () => {
    let r = sit(fresh(), 1);
    const [a] = paper.parts[1].questions;
    r = R.answer(r, a.n, 3); expect(r.answers[a.n]).toBe(3);
    r = R.answer(r, a.n, undefined); expect(a.n in r.answers).toBe(false);
    r = R.answer(r, a.n, 1); r = R.clearAnswer(r, a.n); expect(r.answers).toEqual({});
    r = R.toggleMark(r, a.n); expect(r.marks[a.n]).toBe(true);
    r = R.toggleMark(r, a.n); expect(r.marks).toEqual({});
  });
  it("counts per part; an order is answered only when all tiles are placed", () => {
    let r = sit(fresh(), 3);
    const [a, o] = paper.parts[3].questions;
    r = R.answer(r, a.n, 0);
    r = R.answer(r, o.n, ["a"]);
    expect(R.partStats(r, 3)).toEqual({ total: 2, answered: 1, marked: 0 });
    r = R.toggleMark(R.answer(r, o.n, ["a", "b"]), o.n);
    expect(R.partStats(r, 3)).toEqual({ total: 2, answered: 2, marked: 1 });
    expect(R.unanswered(r)).toEqual([2, 2, 2, 0, 2]);
  });
  it("a write answer counts when it is true or false", () => {
    let r = sit(fresh(), 4);
    r = R.answer(r, paper.parts[4].questions[0].n, false);
    expect(R.partStats(r, 4).answered).toBe(1);
  });
  it("a written word is final: answer and clearAnswer refuse it", () => {
    let r = sit(fresh(), 4);
    const w = paper.parts[4].questions[0].n;
    r = R.answer(r, w, false);
    expect(R.answer(r, w, true)).toBe(r);
    expect(R.clearAnswer(r, w)).toBe(r);
    expect(R.answer(r, w, undefined)).toBe(r);
  });
  it("a started word that is left becomes wrong; a finished one stays", () => {
    let r = sit(fresh(), 4);
    const [a, b] = paper.parts[4].questions.map((x) => x.n);
    r = R.startWrite(r, a);
    expect(r.started[a]).toBe(true);
    expect(R.next(r).answers[a]).toBe(false);
    r = R.answer(R.startWrite(r, a), a, true);
    expect(R.startWrite(r, a)).toBe(r);
    expect(R.next(r).answers[a]).toBe(true);
    expect(R.restore(JSON.parse(JSON.stringify(R.startWrite(R.goto(r, 1), b)))).answers[b]).toBe(false); // a reload settles it
    expect(R.handIn(R.finishPart(R.startWrite(R.goto(r, 1), b))).answers[b]).toBe(false);
  });
  it("listening audio is counted, at most twice, and a cut round is given back", () => {
    let r = sit(fresh(), 0);
    const [a, b] = paper.parts[0].questions.map((x) => x.n);
    expect(R.heardOf(r, a)).toBe(0);
    r = R.heardRound(r, a); r = R.heardRound(r, a);
    expect(R.heardOf(r, a)).toBe(2);
    expect(R.heardRound(r, a)).toBe(r);
    r = R.heardUndo(r, a); expect(R.heardOf(r, a)).toBe(1);
    expect(R.heardRound(r, b)).toBe(r); // not the question on screen
    expect(R.heardOf(R.restore(JSON.stringify(r)), a)).toBe(1);
  });
});

describe("exam run: clock", () => {
  it("ticks only on a question page", () => {
    const r = fresh();
    expect(R.tick(r, 1000)).toBe(r);
    const card = R.begin(r);
    expect(R.tick(card, 1000)).toBe(card);
    const q1 = R.startPart(card);
    const t = R.tick(q1, 1500);
    expect(t.left).toBe(60000 - 1500);
    expect(t.spent).toBe(1500);
    const c = R.finishPart(t);
    expect(R.tick(c, 5000)).toBe(c);
    expect(R.tick(q1, 0)).toBe(q1);
  });
  it("hands in by itself at zero", () => {
    const t = R.tick(R.startPart(R.begin(fresh())), 70000);
    expect(t.stage).toBe("done");
    expect(t.timeUp).toBe(true);
    expect(t.left).toBe(0);
    expect(t.spent).toBe(60000);
  });
});

describe("exam run: saving", () => {
  it("survives JSON", () => {
    let r = sit(fresh(), 3);
    r = R.toggleMark(R.answer(r, paper.parts[3].questions[0].n, 2), paper.parts[3].questions[1].n);
    r = R.tick(R.goto(r, 1), 4321);
    const back = R.restore(JSON.stringify(r));
    expect(back).toEqual(r);
    expect(R.restore(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
  it("rejects runs the screen cannot draw", () => {
    const good = JSON.parse(JSON.stringify(sit(fresh(), 1)));
    const withQ = (f) => { const c = JSON.parse(JSON.stringify(good)); f(c.paper.parts); return c; };
    for (const bad of [
      { ...good, v: 1 },
      withQ((p) => { p[2].questions = []; }),
      withQ((p) => { delete p[1].questions[0].options; }),
      withQ((p) => { p[1].questions[0].options = ["x"]; }),
      withQ((p) => { p[1].questions[0].answer = 7; }),
      withQ((p) => { p[1].questions[0].answer = "1"; }),
      withQ((p) => { p[3].questions[1].tiles = ["a"]; }),
      withQ((p) => { delete p[3].questions[1].answer; }),
      withQ((p) => { delete p[4].questions[0].word; }),
      { ...good, heard: [] }, { ...good, started: 1 },
    ].map((b, i) => [i, b])) expect(R.restore(bad[1]), "case " + bad[0]).toBe(null);
  });
  it("rejects junk", () => {
    const good = JSON.parse(JSON.stringify(sit(fresh(), 1)));
    for (const bad of [null, undefined, "", "{", "[]", 5, {}, { ...good, v: 3 }, { ...good, stage: "x" }, { ...good, paper: {} },
      { ...good, paper: { parts: [{ id: "a", questions: [{ n: "1" }] }] } }, { ...good, answers: [] }, { ...good, left: -1 },
      { ...good, left: "5" }, { ...good, part: 9 }, { ...good, pos: 9 }, { ...good, seed: "1" }]) {
      expect(R.restore(bad)).toBe(null);
    }
  });
});

describe("exam run: no run yet", () => {
  it("settle leaves a missing run alone (leaving the cover, before Begin)", () => {
    expect(R.settle(null)).toBe(null);
  });
});
