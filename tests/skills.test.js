import { describe, it, expect } from "vitest";
import { weakness, weakReasons } from "../src/progress/model.js";
import { overlap, clean } from "../src/lib/compare.js";

describe("speaking check", () => {
  it("ignores punctuation and spaces", () => {
    expect(clean("你好！ 我叫白怀诚。")).toBe("你好我叫白怀诚");
  });
  it("is 1 for an exact match and partial for near misses", () => {
    expect(overlap("你好", "你好。")).toBe(1);
    expect(overlap("谢谢", "谢")).toBe(0.5);
    expect(overlap("对不起", "我说对不起")).toBe(1);
    expect(overlap("没关系", "")).toBe(0);
  });
  it("counts characters in order for sentences", () => {
    expect(overlap("老师，您好！", "老师你好")).toBe(0.75);
  });
});

describe("weakness includes listening, quiz and speaking results", () => {
  it("a missed listening answer makes a word weak", () => {
    const db = { "l:谢谢": { n: 1, ok: 0, miss: 1, last: Date.now(), lastOk: false } };
    const get = (k) => db[k] || null;
    expect(weakness("谢谢", ["谢"], get)).toBeGreaterThan(0.5);
    expect(weakReasons("谢谢", ["谢"], get)).toEqual(["missed in listening"]);
  });
  it("a word practiced only in a quiz is no longer 'never practiced'", () => {
    const db = { "q:坐": { n: 1, ok: 1, miss: 0, last: Date.now(), lastOk: true } };
    expect(weakness("坐", ["坐"], (k) => db[k] || null)).toBe(0);
  });
});
