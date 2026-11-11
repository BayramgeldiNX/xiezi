import { describe, it, expect } from "vitest";
import { completion, FINISHED_AT } from "../src/progress/completion.js";

const stats = (m) => (k) => m[k];

describe("completion", () => {
  it("is 0% with nothing done", () => {
    const r = completion({ write: ["w:你", "w:好"], listen: ["l:你"] }, stats({}));
    expect(r.pct).toBe(0);
    expect(r.finished).toBe(false);
  });
  it("skips skills with no items", () => {
    const r = completion({ write: ["w:你"], exercises: [] }, stats({ "w:你": { ok: 1 } }));
    expect(r.pct).toBe(100);
    expect(r.skills.exercises).toEqual({ done: 0, total: 0 });
  });
  it("counts ok > 0 and keeps it after a wrong answer", () => {
    const r = completion({ write: ["w:你"] }, stats({ "w:你": { ok: 1, miss: 5 } }));
    expect(r.pct).toBe(100);
  });
  it("counts an answer put right after a mistake (fix > 0)", () => {
    const r = completion({ read: ["o:你好", "o:再见"] }, stats({ "o:你好": { ok: 0, miss: 2, fix: 1 }, "o:再见": { ok: 0, miss: 1 } }));
    expect(r.pct).toBe(50);
  });
  it("counts writing keys after 5 tries even with mistakes", () => {
    const items = { write: ["w:你", "d:你好", "l:你"] };
    expect(completion(items, stats({ "w:你": { n: 4, ok: 0 }, "d:你好": { n: 4, ok: 0 } })).skills.write.done).toBe(0);
    expect(completion(items, stats({ "w:你": { n: 5, ok: 0 }, "d:你好": { n: 5, ok: 0 }, "l:你": { n: 9, ok: 0 } })).skills.write.done).toBe(2);
  });
  it("averages skills, not items", () => {
    const r = completion({ a: ["x", "y", "z", "w"], b: ["v"] }, stats({ x: { ok: 1 }, v: { ok: 1 } }));
    expect(r.pct).toBe(63); // (0.25 + 1) / 2
  });
  it("is finished at exactly 60%", () => {
    expect(FINISHED_AT).toBe(0.6);
    const items = { a: ["1", "2", "3", "4", "5"] };
    const done = (n) => stats(Object.fromEntries(items.a.slice(0, n).map((k) => [k, { ok: 1 }])));
    expect(completion(items, done(3)).finished).toBe(true);
    expect(completion(items, done(2)).finished).toBe(false);
  });
  it("counts f: or q: either one", () => {
    const items = { words: [["f:你", "q:你"], ["f:好", "q:好"]] };
    expect(completion(items, stats({ "f:你": { ok: 1 }, "q:好": { ok: 2 } })).pct).toBe(100);
    expect(completion(items, stats({ "q:你": { ok: 1 } })).pct).toBe(50);
  });
  it("counts a text by r: or by all its rq: question keys", () => {
    const item = (k, n) => ["r:" + k, Array.from({ length: n }, (_, i) => "rq:" + k + "#" + i)];
    const items = { read: [item("a/1", 2), item("a/2", 2), item("a/3", 2)] };
    const get = stats({ "r:a/1": { ok: 1 }, "rq:a/2#0": { ok: 1 }, "rq:a/2#1": { ok: 1 }, "rq:a/3#0": { ok: 1 } });
    const r = completion(items, get);
    expect(r.skills.read).toEqual({ done: 2, total: 3 }); // a/3 has only one of two questions right
    expect(completion(items, stats({ "rq:a/3#0": { ok: 1 }, "rq:a/3#1": { ok: 1 } })).skills.read.done).toBe(1);
  });
  it("is 0% for a lesson with no items", () => {
    expect(completion({}, stats({})).pct).toBe(0);
  });
});
