import { describe, it, expect } from "vitest";
import { addResult, combine, charMastered, charStatus, wordStatus, weakness, weakReasons } from "../src/progress/model.js";

const at = (n) => 1_700_000_000_000 + n;

describe("addResult", () => {
  it("counts attempts, perfects, mistakes and streaks", () => {
    let s = addResult(null, { ok: true }, at(1));
    s = addResult(s, { ok: false, miss: 2 }, at(2));
    s = addResult(s, { ok: true }, at(3));
    s = addResult(s, { ok: true }, at(4));
    expect(s).toEqual({ n: 4, ok: 3, miss: 2, last: at(4), lastOk: true, streak: 2 });
  });
  it("never counts negative mistakes", () => {
    expect(addResult(null, { ok: false, miss: -5 }).miss).toBe(0);
  });
  it("does not change the input stat", () => {
    const s = addResult(null, { ok: true });
    const copy = { ...s };
    addResult(s, { ok: false, miss: 1 });
    expect(s).toEqual(copy);
  });
});

describe("combine (several devices)", () => {
  it("adds counts and takes the latest result from the most recent device", () => {
    const phone = { n: 3, ok: 2, miss: 1, last: at(10), lastOk: true, streak: 2 };
    const pad = { n: 2, ok: 0, miss: 4, last: at(20), lastOk: false, streak: 0 };
    expect(combine([phone, pad])).toEqual({ n: 5, ok: 2, miss: 5, last: at(20), lastOk: false, streak: 0 });
  });
  it("ignores missing devices and returns null when nothing is there", () => {
    expect(combine([undefined, null])).toBeNull();
    const one = { n: 1, ok: 1, miss: 0, last: at(1), lastOk: true, streak: 1 };
    expect(combine([undefined, one])).toEqual(one);
  });
  it("is the same in any order", () => {
    const a = { n: 1, ok: 1, miss: 0, last: at(5), lastOk: true, streak: 1 };
    const b = { n: 4, ok: 1, miss: 6, last: at(2), lastOk: false, streak: 0 };
    expect(combine([a, b])).toEqual(combine([b, a]));
  });
});

describe("mastery", () => {
  it("needs two perfect writes, the last one included", () => {
    expect(charMastered({ n: 1, ok: 1, lastOk: true })).toBe(false);
    expect(charMastered({ n: 3, ok: 2, lastOk: false })).toBe(false);
    expect(charMastered({ n: 2, ok: 2, lastOk: true })).toBe(true);
    expect(charStatus(null)).toBe("new");
    expect(charStatus({ n: 1, ok: 0, lastOk: false })).toBe("learning");
  });
  it("word is known when all characters are mastered and dictation was perfect", () => {
    const db = {
      "w:你": { n: 2, ok: 2, lastOk: true }, "w:好": { n: 2, ok: 2, lastOk: true },
      "d:你好": { n: 1, ok: 1, lastOk: true },
    };
    const get = (k) => db[k] || null;
    expect(wordStatus({ word: "你好", list: ["你", "好"] }, get)).toBe("known");
    db["d:你好"] = { n: 2, ok: 1, lastOk: false };
    expect(wordStatus({ word: "你好", list: ["你", "好"] }, get)).toBe("learning");
    expect(wordStatus({ word: "谢谢", list: ["谢"] }, get)).toBe("new");
  });
});

describe("weakness", () => {
  const now = Date.now();
  it("is null for words never practiced", () => {
    expect(weakness("谢谢", ["谢"], () => null)).toBeNull();
  });
  it("ranks a missed word above a perfect one", () => {
    const db = {
      "d:您": { n: 2, ok: 0, miss: 5, last: now, lastOk: false },
      "d:你好": { n: 2, ok: 2, miss: 0, last: now, lastOk: true },
    };
    const get = (k) => db[k] || null;
    expect(weakness("您", ["您"], get)).toBeGreaterThan(weakness("你好", ["你", "好"], get));
    expect(weakness("你好", ["你", "好"], get)).toBe(0);
    expect(weakReasons("您", ["您"], get)).toEqual(["missed in dictation"]);
  });
  it("grows when practice is old", () => {
    const fresh = { "f:坐": { n: 1, ok: 1, miss: 0, last: now, lastOk: true } };
    const old = { "f:坐": { n: 1, ok: 1, miss: 0, last: now - 14 * 864e5, lastOk: true } };
    expect(weakness("坐", ["坐"], (k) => old[k])).toBeGreaterThan(weakness("坐", ["坐"], (k) => fresh[k]));
  });
});
