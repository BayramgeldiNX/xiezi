import { describe, it, expect, beforeEach, vi } from "vitest";

// A fresh copy of the store over the given storage map (pass the same map to simulate a reload).
async function freshStore(mem = new Map(), opts = {}) {
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { if (opts.throwOnSet) throw new Error("quota"); mem.set(k, String(v)); },
    removeItem: (k) => mem.delete(k),
  };
  vi.resetModules();
  const [X, P] = await Promise.all([import("../src/exam/store.js"), import("../src/progress/store.js")]);
  return { X, dev: P.deviceId(), mem };
}
const flush = () => new Promise((r) => setTimeout(r, 80)); // the store saves a moment after a change

const res = (total, at, secs = 600) => ({ total, parts: [1, 2, 3, 4, 5].map(() => total / 5), at, secs });
// A record from results: best, last, and the list of attempt times.
const rec = (best, last, tries) => ({ best, last, tries });
const cloud = (k, d) => ({ k, d });
const keys = (X) => X.unsentAll().map(([k]) => k).sort();
const mineRecord = (X, k = "hsk1/s1") => X.unsentAll().find(([x]) => x === k)[1];

describe("exam store: saveResult", () => {
  let X;
  beforeEach(async () => { ({ X } = await freshStore()); });

  it("keeps the first result as best and last; isBest is false", () => {
    expect(X.resultOf("hsk1", "s1")).toBeNull();
    const r = res(300, 1);
    const out = X.saveResult("hsk1", "s1", r);
    expect(out.isBest).toBe(false);
    expect(out.record).toEqual({ best: r, last: r, n: 1 });
    expect(X.resultOf("hsk1", "s1")).toEqual(out.record);
    expect(X.allResults()).toEqual({ "hsk1/s1": out.record });
  });

  it("a better result becomes best and last", () => {
    X.saveResult("hsk1", "s1", res(300, 1));
    const out = X.saveResult("hsk1", "s1", res(400, 2));
    expect(out.isBest).toBe(true);
    expect(out.record).toMatchObject({ n: 2, best: { total: 400 }, last: { total: 400 } });
  });

  it("a worse result changes only last and n", () => {
    X.saveResult("hsk1", "s1", res(400, 1));
    const out = X.saveResult("hsk1", "s1", res(200, 2));
    expect(out.isBest).toBe(false);
    expect(out.record).toMatchObject({ n: 2, best: { total: 400, at: 1 }, last: { total: 200, at: 2 } });
  });

  it("a tie keeps the old best", () => {
    X.saveResult("hsk1", "s1", res(400, 1));
    const out = X.saveResult("hsk1", "s1", res(400, 2));
    expect(out.isBest).toBe(false);
    expect(out.record).toMatchObject({ best: { at: 1 }, last: { at: 2 }, n: 2 });
  });

  it("keeps tests apart", () => {
    X.saveResult("hsk1", "s1", res(100, 1));
    X.saveResult("hsk1", "mid1", res(200, 1));
    expect(X.resultOf("hsk1", "s1").best.total).toBe(100);
    expect(X.resultOf("hsk1", "mid1").best.total).toBe(200);
  });

  it("keeps the attempt times of this device as a sorted list", () => {
    X.saveResult("hsk1", "s1", res(100, 5));
    X.saveResult("hsk1", "s1", res(100, 3));
    expect(mineRecord(X).tries).toEqual([3, 5]);
  });

  it("keeps only the newest 500 attempts", () => {
    for (let i = 1; i <= 505; i++) X.saveResult("hsk1", "s1", res(100, i));
    const t = mineRecord(X).tries;
    expect(t).toHaveLength(500);
    expect(t[0]).toBe(6);
    expect(t[499]).toBe(505);
    expect(X.resultOf("hsk1", "s1").n).toBe(500);
  });
});

describe("exam store: merge", () => {
  let X;
  beforeEach(async () => { ({ X } = await freshStore()); });

  it("best is the higher total, last the newer one, tries the union", () => {
    const a = rec(res(300, 1), res(300, 1), [1]);
    const b = rec(res(400, 2), res(200, 5), [2, 4, 5]);
    expect(X.merge(a, b)).toEqual(rec(res(400, 2), res(200, 5), [1, 2, 4, 5]));
  });

  it("a tie on total keeps the earlier one as best", () => {
    const a = rec(res(400, 7), res(400, 7), [7]);
    const b = rec(res(400, 3), res(400, 3), [3]);
    expect(X.merge(a, b).best.at).toBe(3);
    expect(X.merge(b, a).best.at).toBe(3);
  });

  it("does not depend on the order of the arguments", () => {
    const a = rec(res(300, 1), res(250, 4), [1, 4]);
    const b = rec(res(350, 2), res(350, 2), [2]);
    expect(X.merge(a, b)).toEqual(X.merge(b, a));
  });

  it("the same record twice changes nothing", () => {
    const a = rec(res(300, 1), res(250, 4), [1, 4]);
    expect(X.merge(a, a)).toEqual(a);
    expect(X.merge(X.merge(a, a), a)).toEqual(a);
  });

  it("three records give one answer in any order", () => {
    const a = rec(res(300, 1), res(300, 1), [1]);
    const b = rec(res(450, 2), res(100, 9), [2, 9]);
    const c = rec(res(450, 1.5), res(450, 1.5), [1.5]);
    const m = X.merge;
    const want = m(m(a, b), c);
    for (const got of [m(a, m(b, c)), m(m(c, a), b), m(c, m(b, a)), m(m(b, c), a), m(b, m(a, c))]) expect(got).toEqual(want);
    expect(want).toEqual(rec(res(450, 1.5), res(100, 9), [1, 1.5, 2, 9]));
  });

  it("a missing side gives the other", () => {
    const a = rec(res(300, 1), res(300, 1), [1]);
    expect(X.merge(a, null)).toEqual(a);
    expect(X.merge(undefined, a)).toEqual(a);
    expect(X.merge(null, null)).toBeNull();
  });

  it("bad numbers count as missing and the order still does not matter", () => {
    const good = rec(res(300, 1), res(300, 1), [1, 2]);
    const noTotal = rec({ ...res(0, 5), total: "x" }, res(100, 5), [5, "a", NaN]);
    const noAt = rec({ total: 300, at: NaN }, { total: 50, at: undefined }, undefined);
    const bad = [noTotal, noAt, good];
    for (const a of bad) for (const b of bad) {
      expect(X.merge(a, b)).toEqual(X.merge(b, a));
      for (const c of bad) expect(X.merge(X.merge(a, b), c)).toEqual(X.merge(a, X.merge(b, c)));
    }
    expect(X.merge(good, noTotal).best.total).toBe(300);
    expect(X.merge(good, noAt).tries).toEqual([1, 2]);
    expect(X.merge(noAt, noAt).tries).toEqual([]);
  });

  it("reads an old record with n and no tries without throwing", () => {
    const old = { best: res(300, 1), last: res(200, 4), n: 7 };
    expect(() => X.merge(old, old)).not.toThrow();
    expect(X.merge(old, old).tries).toEqual([1, 4]);
  });
});

describe("exam store: devices and the cloud", () => {
  let X, dev;
  beforeEach(async () => { ({ X, dev } = await freshStore()); });

  it("applyRemote shows another device's record and uploads nothing", () => {
    const r = rec(res(300, 1), res(300, 1), [1]);
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { phone: r }));
    expect(X.resultOf("hsk1", "s1")).toEqual({ best: r.best, last: r.last, n: 1 });
    expect(X.unsentAll()).toEqual([]);
  });

  it("n counts the distinct attempts of all devices, best the highest, last the newest", () => {
    X.saveResult("hsk1", "s1", res(300, 5));
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", {
      a: rec(res(450, 1), res(450, 2), [1, 2]),
      b: rec(res(100, 3), res(100, 9), [3, 4, 9]),
    }));
    expect(X.resultOf("hsk1", "s1")).toEqual({ best: res(450, 1), last: res(100, 9), n: 6 });
  });

  it("isBest is false on the first save and true after another device's result is beaten", () => {
    expect(X.saveResult("hsk1", "s1", res(300, 1)).isBest).toBe(false);
    X.applyRemote("hsk1/mid1", cloud("hsk1/mid1", { phone: rec(res(300, 1), res(300, 1), [1]) }));
    expect(X.saveResult("hsk1", "mid1", res(200, 2)).isBest).toBe(false);
    expect(X.saveResult("hsk1", "mid1", res(350, 3)).isBest).toBe(true);
  });

  it("a newer cloud copy replaces the old one for the other devices", () => {
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { phone: rec(res(300, 1), res(300, 1), [1]) }));
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { phone: rec(res(200, 2), res(200, 2), [2]) }));
    expect(X.resultOf("hsk1", "s1").best.total).toBe(200);
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", {}));
    expect(X.resultOf("hsk1", "s1")).toBeNull();
  });

  it("this device's own cloud entry is merged into ours (reinstall) and is not unsent", () => {
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { [dev]: rec(res(400, 2), res(400, 2), [2, 3, 4, 5]) }));
    expect(X.resultOf("hsk1", "s1")).toMatchObject({ best: { total: 400 }, n: 4 });
    expect(X.unsentAll()).toEqual([]);
  });

  it("in the real order, save, our echo, then markUploaded: n stays 1 and the unsent entry clears", () => {
    X.setSyncer({ push: vi.fn() }, "u1");
    X.saveResult("hsk1", "s1", res(300, 1));
    const pushed = mineRecord(X);
    expect(X.applyRemote("hsk1/s1", cloud("hsk1/s1", { [dev]: pushed }))).toBe(false); // the echo of our pending write
    expect(X.resultOf("hsk1", "s1").n).toBe(1);
    expect(X.unsentAll()).toEqual([]);
    X.markUploaded("hsk1/s1", pushed);
    expect(X.resultOf("hsk1", "s1").n).toBe(1);
    expect(X.unsentAll()).toEqual([]);
  });

  it("the same echo arriving three times changes nothing", () => {
    X.saveResult("hsk1", "s1", res(100, 5));
    const doc = cloud("hsk1/s1", { [dev]: rec(res(300, 1), res(300, 1), [1, 2]), phone: rec(res(200, 1), res(200, 1), [10]) });
    X.applyRemote("hsk1/s1", doc);
    const once = X.resultOf("hsk1", "s1");
    expect(once.n).toBe(4); // 1, 2, 5 here and 10 on the phone
    X.applyRemote("hsk1/s1", doc);
    X.applyRemote("hsk1/s1", doc);
    expect(X.resultOf("hsk1", "s1")).toEqual(once);
  });

  it("an echo older than what we hold keeps the entry unsent and asks to send it", () => {
    X.setSyncer({ push: vi.fn() }, "u1");
    X.saveResult("hsk1", "s1", res(300, 1));
    const first = mineRecord(X);
    X.saveResult("hsk1", "s1", res(200, 2)); // saved again before the first write came back
    expect(X.applyRemote("hsk1/s1", cloud("hsk1/s1", { [dev]: first }))).toBe(true);
    expect(keys(X)).toEqual(["hsk1/s1"]);
    expect(X.resultOf("hsk1", "s1").n).toBe(2);
  });

  it("applyRemote ignores a null doc and malformed records", () => {
    X.applyRemote("hsk1/s1", null);
    X.applyRemote("hsk1/s1", undefined);
    X.applyRemote("hsk1/s1", { k: "hsk1/s1" });
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { a: null, b: {}, c: { best: {} }, d: { best: { total: NaN } }, e: { best: { total: "9" } }, f: 5 }));
    X.applyRemote(null, cloud(null, {}));
    expect(X.resultOf("hsk1", "s1")).toBeNull();
    expect(X.allResults()).toEqual({});
  });

  it("an old-shape record with n and no tries is read without throwing", () => {
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { a: { best: res(250, 1), last: res(100, 4), n: 9 } }));
    expect(X.resultOf("hsk1", "s1")).toMatchObject({ best: { total: 250 }, last: { total: 100 }, n: 2 });
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { a: { best: res(250, 1) } }));
    expect(X.resultOf("hsk1", "s1")).toMatchObject({ last: { total: 250 }, n: 1 });
  });

  it("subscribers are called on save and on remote changes, until unsubscribed", () => {
    const fn = vi.fn();
    const off = X.onResults(fn);
    X.saveResult("hsk1", "s1", res(100, 1));
    expect(fn).toHaveBeenCalledTimes(1);
    X.remoteDone();
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    X.saveResult("hsk1", "s1", res(200, 2));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("the unsent list grows on save and shrinks when marked uploaded", () => {
    X.saveResult("hsk1", "s1", res(100, 1));
    X.saveResult("hsk1", "mid1", res(200, 1));
    expect(keys(X)).toEqual(["hsk1/mid1", "hsk1/s1"]);
    X.markUploaded("hsk1/s1", mineRecord(X));
    expect(keys(X)).toEqual(["hsk1/mid1"]);
  });

  it("a record changed while uploading stays unsent", () => {
    X.saveResult("hsk1", "s1", res(100, 1));
    const sent = mineRecord(X);
    X.saveResult("hsk1", "s1", res(200, 2));
    X.markUploaded("hsk1/s1", sent);
    expect(X.unsentAll()).toHaveLength(1);
  });

  it("the syncer is told about each save with this device's own record", () => {
    const push = vi.fn();
    X.setSyncer({ push }, "u1");
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { phone: rec(res(500, 1), res(500, 1), [1]) }));
    X.saveResult("hsk1", "s1", res(100, 2));
    expect(push).toHaveBeenCalledWith("hsk1/s1", rec(res(100, 2), res(100, 2), [2]));
  });
});

describe("exam store: backup", () => {
  let X;
  beforeEach(async () => { ({ X } = await freshStore()); });

  it("a backup merges into this device's results and is sent", () => {
    X.saveResult("hsk1", "s1", res(100, 1));
    X.markUploaded("hsk1/s1", mineRecord(X));
    X.importResults({ "hsk1/s1": rec(res(300, 2), res(300, 2), [2, 3]), "bad": null, "worse": { best: { total: NaN } } });
    expect(X.resultOf("hsk1", "s1")).toMatchObject({ n: 3, best: { total: 300 } });
    expect(keys(X)).toEqual(["hsk1/s1"]);
    expect(Object.keys(X.exportResults())).toEqual(["hsk1/s1"]);
  });

  it("A n=1, B n=2: export on A, import on A keeps n at 3", () => {
    X.saveResult("hsk1", "s1", res(100, 1));
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { b: rec(res(300, 2), res(200, 3), [2, 3]) }));
    expect(X.resultOf("hsk1", "s1").n).toBe(3);
    const backup = JSON.parse(JSON.stringify({ tests: X.exportResults() }));
    expect(backup.tests["hsk1/s1"].tries).toEqual([1, 2, 3]);
    X.importResults(backup.tests);
    X.importResults(backup.tests);
    expect(X.resultOf("hsk1", "s1").n).toBe(3);
  });

  it("an older backup without tests, or nothing at all, changes nothing", () => {
    X.saveResult("hsk1", "s1", res(100, 1));
    const before = X.allResults();
    X.importResults(undefined);
    X.importResults(null);
    X.importResults("x");
    X.importResults({});
    expect(X.allResults()).toEqual(before);
  });
});

describe("exam store: storage", () => {
  it("results and the unsent list survive a reload", async () => {
    const { X, mem } = await freshStore();
    X.saveResult("hsk1", "s1", res(300, 1));
    X.saveResult("hsk1", "s1", res(200, 2));
    await flush();
    const { X: Y } = await freshStore(mem);
    expect(Y.resultOf("hsk1", "s1")).toEqual({ best: res(300, 1), last: res(200, 2), n: 2 });
    expect(keys(Y)).toEqual(["hsk1/s1"]);
  });

  it("works when storage throws on write or is missing", async () => {
    const { X } = await freshStore(new Map(), { throwOnSet: true });
    expect(() => X.saveResult("hsk1", "s1", res(300, 1))).not.toThrow();
    await flush();
    expect(X.resultOf("hsk1", "s1").n).toBe(1);

    delete globalThis.localStorage;
    vi.resetModules();
    const Z = await import("../src/exam/store.js");
    expect(Z.allResults()).toEqual({});
    expect(() => Z.saveResult("hsk1", "s1", res(300, 1))).not.toThrow();
    await flush();
    expect(Z.resultOf("hsk1", "s1").n).toBe(1);
  });
});

describe("exam store: accounts", () => {
  let X, dev;
  beforeEach(async () => { ({ X, dev } = await freshStore()); });

  it("what was saved signed out joins the account that signs in first", () => {
    X.saveResult("hsk1", "s1", res(300, 1));
    X.setSyncer({ push: vi.fn() }, "u1");
    expect(keys(X)).toEqual(["hsk1/s1"]);
  });

  it("sign-out then sign-in as another user pushes nothing from the first user", () => {
    X.setSyncer({ push: vi.fn() }, "u1");
    X.saveResult("hsk1", "s1", res(300, 1)); // tagged u1, not yet uploaded
    X.applyRemote("hsk1/mid1", cloud("hsk1/mid1", { phone: rec(res(200, 1), res(200, 1), [1]) }));
    X.setSyncer(null);
    X.clearRemote();
    expect(X.resultOf("hsk1", "mid1")).toBeNull(); // cloud data is gone
    expect(X.resultOf("hsk1", "s1")).not.toBeNull(); // still waiting
    const push = vi.fn();
    X.setSyncer({ push }, "u2");
    expect(X.unsentAll()).toEqual([]);
    expect(X.resultOf("hsk1", "s1")).toBeNull(); // dropped
    expect(push).not.toHaveBeenCalled();
  });

  it("an unsent result is still sent when the same user signs in again", () => {
    X.setSyncer({ push: vi.fn() }, "u1");
    X.saveResult("hsk1", "s1", res(300, 1));
    X.setSyncer(null);
    X.clearRemote();
    X.setSyncer({ push: vi.fn() }, "u1");
    expect(keys(X)).toEqual(["hsk1/s1"]);
  });

  it("uploaded results are dropped on sign-out and come back from the cloud", () => {
    X.setSyncer({ push: vi.fn() }, "u1");
    X.saveResult("hsk1", "s1", res(300, 1));
    X.markUploaded("hsk1/s1", mineRecord(X));
    X.setSyncer(null);
    X.clearRemote();
    expect(X.allResults()).toEqual({});
  });

  it("sign-out, save, sign-in with the cloud holding this device's older entry: n is 2 and the better best stays", () => {
    X.setSyncer({ push: vi.fn() }, "u1");
    X.saveResult("hsk1", "s1", res(300, 1));
    X.markUploaded("hsk1/s1", mineRecord(X));
    X.setSyncer(null);
    X.clearRemote();
    X.saveResult("hsk1", "s1", res(100, 2));
    X.setSyncer({ push: vi.fn() }, "u1");
    expect(X.applyRemote("hsk1/s1", cloud("hsk1/s1", { [dev]: rec(res(300, 1), res(300, 1), [1]) }))).toBe(true); // we hold more
    expect(X.resultOf("hsk1", "s1")).toEqual({ best: res(300, 1), last: res(100, 2), n: 2 });
    expect(keys(X)).toEqual(["hsk1/s1"]);
  });

  it("sign-out, save, sign-in as the same user keeps the better best from another device", () => {
    X.setSyncer({ push: vi.fn() }, "u1");
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { phone: rec(res(450, 1), res(450, 1), [1]) }));
    X.setSyncer(null);
    X.clearRemote();
    X.saveResult("hsk1", "s1", res(100, 3));
    X.setSyncer({ push: vi.fn() }, "u1");
    X.applyRemote("hsk1/s1", cloud("hsk1/s1", { phone: rec(res(450, 1), res(450, 1), [1]) }));
    expect(X.resultOf("hsk1", "s1")).toEqual({ best: res(450, 1), last: res(100, 3), n: 2 });
  });
});
