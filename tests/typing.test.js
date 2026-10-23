import { describe, it, expect } from "vitest";
import { checkHanzi, checkPinyin, toneSyllables } from "../src/lib/typing-check.js";
import lesson1 from "../src/data/books/kouyu-rumen/lesson01.json";

describe("typing Chinese", () => {
  it("ignores spaces and punctuation", () => {
    expect(checkHanzi("你好！", "你好").ok).toBe(true);
    expect(checkHanzi("老师，您好！", "老师 您好").ok).toBe(true);
  });
  it("marks each wrong character", () => {
    const r = checkHanzi("谢谢", "射谢");
    expect(r.ok).toBe(false);
    expect(r.chars.map((c) => c.ok)).toEqual([false, true]);
  });
  it("too short or too long is wrong", () => {
    expect(checkHanzi("不客气", "不客").ok).toBe(false);
    expect(checkHanzi("你好", "你好吗").ok).toBe(false);
  });
});

describe("typing pinyin with tone numbers", () => {
  it("reads the expected tones from the lesson pinyin", () => {
    expect(toneSyllables("nǐ hǎo").map((s) => `${s.p}${s.tone}`)).toEqual(["ni3", "hao3"]);
    expect(toneSyllables("xièxie").map((s) => `${s.p}${s.tone}`)).toEqual(["xie4", "xie5"]);
    expect(toneSyllables("lǜ").map((s) => `${s.p}${s.tone}`)).toEqual(["lv4"]);
  });
  it("accepts spaces or none, and neutral tone as 5, 0 or no number", () => {
    for (const t of ["ni3 hao3", "ni3hao3", "NI3 HAO3"]) expect(checkPinyin("nǐ hǎo", t).ok, t).toBe(true);
    for (const t of ["xie4 xie5", "xie4xie0", "xie4 xie"]) expect(checkPinyin("xièxie", t).ok, t).toBe(true);
  });
  it("accepts v, ü and u: for ü", () => {
    for (const t of ["lv4", "lü4", "lu:4"]) expect(checkPinyin("lǜ", t).ok, t).toBe(true);
  });
  it("finds a wrong tone but right spelling", () => {
    const r = checkPinyin("nǐ hǎo", "ni4 hao3");
    expect(r.ok).toBe(false);
    expect(r.spellingOk).toBe(true);
    expect(r.syllables.map((s) => s.toneOk)).toEqual([false, true]);
    expect(r.syllables[0].gotTone).toBe(4);
  });
  it("accepts the spoken tone change 3+3 → 2+3, and notes it", () => {
    const r = checkPinyin("nǐ hǎo", "ni2 hao3");
    expect(r.ok).toBe(true);
    expect(r.sandhi).toBe(true);
    expect(checkPinyin("nǐ hǎo", "ni2 hao2").ok).toBe(false); // only the first of the two changes
    expect(checkPinyin("lǎoshī", "lao2 shi1").ok).toBe(false); // no 3rd tone after it: no change
  });
  it("a missing tone number on a toned syllable is wrong", () => {
    expect(checkPinyin("nǐ hǎo", "ni hao3").syllables[0].toneOk).toBe(false);
  });
  it("finds spelling mistakes and extra letters", () => {
    expect(checkPinyin("lǎoshī", "lao3si1").spellingOk).toBe(false);
    expect(checkPinyin("nǐ", "ni3hao3").spellingOk).toBe(false);
  });
  it("every lesson word can be typed correctly", () => {
    for (const w of lesson1.words) {
      const answer = toneSyllables(w.py).map((s) => s.p + (s.tone === 5 ? "" : s.tone)).join(" ");
      expect(checkPinyin(w.py, answer).ok, `${w.w} ${answer}`).toBe(true);
    }
  });
});
