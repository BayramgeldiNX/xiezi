import { describe, it, expect } from "vitest";
import { createQueue, pagePrio, thumbPrio, chunkOf, chunkCount, chunkPages, outward, BG } from "../src/pdf/queue.js";

// A job that stays open until the test finishes it.
const gate = () => { let done; const p = new Promise((r) => { done = r; }); return { p, done }; };

describe("preview chunk math", () => {
  it("finds the chunk and the index of a page", () => {
    expect(chunkOf(1)).toEqual({ k: 0, i: 0 });
    expect(chunkOf(40)).toEqual({ k: 0, i: 39 });
    expect(chunkOf(41)).toEqual({ k: 1, i: 0 });
    expect(chunkOf(92)).toEqual({ k: 2, i: 11 });
    expect(chunkOf(81, 40)).toEqual({ k: 2, i: 0 });
  });
  it("counts chunks and lists their pages", () => {
    expect(chunkCount(92)).toBe(3);
    expect(chunkCount(80)).toBe(2);
    expect(chunkCount(1)).toBe(1);
    expect(chunkPages(2, 92)).toEqual(Array.from({ length: 12 }, (_, i) => 81 + i));
    expect(chunkPages(0, 92)).toHaveLength(40);
  });
});

describe("outward order", () => {
  it("goes cur, next, previous, next+1 ...", () => {
    expect(outward(5, 9)).toEqual([5, 6, 4, 7, 3, 8, 2, 9, 1]);
  });
  it("stays inside the book and covers every page once", () => {
    expect(outward(1, 4)).toEqual([1, 2, 3, 4]);
    expect(outward(4, 4)).toEqual([4, 3, 2, 1]);
    const all = outward(30, 92);
    expect(all).toHaveLength(92);
    expect(new Set(all).size).toBe(92);
  });
  it("can be limited to the pages that are missing", () => {
    expect(outward(5, 9, new Set([1, 6, 9]))).toEqual([6, 9, 1]);
  });
});

describe("priorities", () => {
  it("ranks the page, its neighbours, the next few, then the rest", () => {
    const order = [10, 11, 9, 12, 8, 13, 14, 15, 7, 16, 1, 40].map((n) => pagePrio(n, 10));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(pagePrio(10, 10)).toBe(0);
    expect(pagePrio(11, 10)).toBeLessThan(pagePrio(12, 10));
    expect(pagePrio(15, 10)).toBeLessThan(BG);
    expect(pagePrio(16, 10)).toBeGreaterThanOrEqual(BG);
    expect(pagePrio(7, 10)).toBeGreaterThanOrEqual(BG);
  });
  it("puts the current chunk after the current page and before the neighbours", () => {
    expect(thumbPrio(1, 50)).toBeGreaterThan(pagePrio(50, 50));
    expect(thumbPrio(1, 50)).toBeLessThan(pagePrio(51, 50));
  });
  it("wants the next chunk early near a chunk edge, and the far ones in the background", () => {
    expect(thumbPrio(1, 38)).toBeLessThan(BG);    // page 43 is in chunk 1
    expect(thumbPrio(2, 38)).toBeGreaterThanOrEqual(BG);
    expect(thumbPrio(0, 41)).toBeLessThan(BG);    // page 39 is the one before the one before
    expect(thumbPrio(2, 5)).toBeGreaterThan(thumbPrio(1, 5));
  });
});

describe("the queue", () => {
  const prioOf = (m) => m.p;
  it("runs the most wanted first, three at a time", async () => {
    const q = createQueue({ limit: 3, prioOf });
    const g = {}; const started = [];
    const job = (key, p) => q.add(key, { p }, () => { started.push(key); return (g[key] = gate()).p; });
    job("a", 3000); job("b", 3000); job("c", 3000); job("d", 2000); job("e", 0);
    // a and b took the first slots; the last slot waits for something below 2000
    expect(started).toEqual(["a", "b", "e"]);
    g.e.done(); await g.e.p; await Promise.resolve();
    expect(started).toEqual(["a", "b", "e"]);
    g.a.done(); await g.a.p; await Promise.resolve();
    expect(started.slice(3)).toEqual(["d"]);
  });
  it("never runs a key twice and raises the priority of a waiting one", async () => {
    const q = createQueue({ limit: 1, prioOf });
    const g = {}; const started = [];
    const job = (key, p) => q.add(key, { p }, () => { started.push(key); return (g[key] = gate()).p; });
    job("x", 0);
    const p1 = job("y", 5000), p2 = job("y", 5000);
    expect(p1).toBe(p2);
    job("z", 3000);
    job("y", 100);   // y is wanted more than z now
    expect(q.waiting()).toEqual(["y", "z"]);
    g.x.done(); await g.x.p; await Promise.resolve();
    expect(started).toEqual(["x", "y"]);
    expect(job("y", 0)).toBe(p1);   // already running: same promise, no second run
    expect(started).toEqual(["x", "y"]);
  });
  it("re-orders waiting jobs when the reader moves", async () => {
    let cur = 10;
    const q = createQueue({ limit: 1, prioOf: (m) => pagePrio(m.n, cur) });
    const g = {}; const started = [];
    const job = (n) => q.add(`p${n}`, { n }, () => { started.push(n); return (g[n] = gate()).p; });
    job(10);                 // runs
    [11, 12, 9, 20, 21].forEach(job);
    expect(q.waiting()).toEqual(["p11", "p9", "p12", "p20", "p21"].map((s) => s).sort((a, b) => pagePrio(+a.slice(1), 10) - pagePrio(+b.slice(1), 10)));
    cur = 20; q.reprioritise();
    expect(q.waiting()[0]).toBe("p20");
    expect(q.waiting()[1]).toBe("p21");
    g[10].done(); await g[10].p; await Promise.resolve();
    expect(started).toEqual([10, 20]);
  });
  it("keeps background jobs to two, and lets none start while a user job waits", async () => {
    const q = createQueue({ limit: 3, bgLimit: 2, prioOf });
    const g = {}; const started = [];
    const job = (key, p) => q.add(key, { p }, () => { started.push(key); return (g[key] = gate()).p; });
    ["b1", "b2", "b3", "b4"].forEach((k, i) => job(k, BG + i));
    expect(started).toEqual(["b1", "b2"]);   // two at a time
    job("u1", 0);                            // the free slot is for the user
    expect(started).toEqual(["b1", "b2", "u1"]);
    job("n1", 2500); job("n2", 3000);
    g.b1.done(); await g.b1.p; await Promise.resolve();
    expect(started).toEqual(["b1", "b2", "u1"]);          // the last slot is kept for the page on screen; b3 still waits
    g.u1.done(); await g.u1.p; await Promise.resolve();
    expect(started.slice(3)).toEqual(["n1"]);
    g.b2.done(); await g.b2.p; await Promise.resolve();
    expect(started.slice(4)).toEqual(["n2"]);             // user jobs before background ones
    g.n1.done(); await g.n1.p; await Promise.resolve();
    expect(started.slice(5)).toEqual(["b3"]);             // only then the background goes on
  });
  it("passes a failure to the one who asked and goes on", async () => {
    const q = createQueue({ limit: 1, prioOf });
    const bad = q.add("a", { p: 0 }, () => Promise.reject(new Error("no")));
    const ok = q.add("b", { p: 0 }, () => Promise.resolve(7));
    await expect(bad).rejects.toThrow("no");
    await expect(ok).resolves.toBe(7);
    expect(q.stats().running).toBe(0);
  });
});
