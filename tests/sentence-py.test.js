import { describe, it, expect } from "vitest";
import { sentencePy } from "../src/lib/sentence-py.js";

describe("sentencePy", () => {
  it("gives pinyin for a short sentence", () => {
    expect(sentencePy("你好！")).toBe("nǐhǎo!".replace("!", "！"));
  });
  it("keeps punctuation and covers every character", () => {
    const out = sentencePy("他有两个女儿。");
    expect(out.endsWith("。")).toBe(true);
    expect(out).toMatch(/tā/);
    expect(out).toMatch(/liǎng/);
  });
  it("handles 不 and 一 inside words", () => {
    expect(sentencePy("我不是学生")).toMatch(/b[uú]shì/);
    expect(sentencePy("一个人")).toMatch(/yī|yí/);
  });
  it("leaves no Chinese character without pinyin", () => {
    expect(sentencePy("我家有四口人，你呢？")).not.toMatch(/\p{Script=Han}/u);
  });
});
