import { describe, it, expect } from "vitest";
import { syllables, stripTone, addTone } from "../src/lib/pinyin.js";
import lesson1 from "../src/data/lessons/lesson01.json";
import chars from "../src/data/chars.json";

describe("pinyin", () => {
  it("splits words into syllables with tones", () => {
    expect(syllables("Huáichéng")).toEqual([["Huái", 2], ["chéng", 2]]);
    expect(syllables("xièxie")).toEqual([["xiè", 4], ["xie", 5]]);
    expect(syllables("guānxi")).toEqual([["guān", 1], ["xi", 5]]);
    expect(syllables("nǐmen")).toEqual([["nǐ", 3], ["men", 5]]);
  });
  it("adds and removes tone marks", () => {
    expect(stripTone("lǚ")).toBe("lü");
    expect(addTone("ma", 3)).toBe("mǎ");
    expect(addTone("shui", 4)).toBe("shuì");
    expect(addTone("lü", 4)).toBe("lǜ");
    expect(addTone("gou", 1)).toBe("gōu");
  });
  it("every lesson word splits into one syllable per character", () => {
    for (const w of lesson1.words) {
      const sy = w.py.split(" ").flatMap(syllables);
      expect(sy.length, w.w).toBe([...w.w].length);
    }
  });
  it("every character's pinyin is a single syllable", () => {
    for (const [c, info] of Object.entries(chars)) expect(syllables(info.py).length, c).toBe(1);
  });
});
