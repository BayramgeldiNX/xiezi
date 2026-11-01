import { describe, it, expect } from "vitest";
import { matchesWord } from "../src/lib/search.js";

const w = { w: "你好", py: "nǐ hǎo", en: "hello" };

describe("matchesWord", () => {
  it("finds a word by 汉字, pinyin, tones, spaces or English", () => {
    for (const q of ["你", "你好", "ni hao", "nǐ hǎo", "nihao", "NI", "hello", "ell"]) expect(matchesWord(w, q)).toBe(true);
  });
  it("does not match something else", () => {
    for (const q of ["谢", "xie", "goodbye"]) expect(matchesWord(w, q)).toBe(false);
  });
  it("an empty query matches everything", () => {
    expect(matchesWord(w, "")).toBe(true);
    expect(matchesWord(w, "  ")).toBe(true);
  });
});
