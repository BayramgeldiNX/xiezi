import { describe, it, expect } from "vitest";
import { syllables, stripTone, addTone } from "../src/lib/pinyin.js";
import { LESSONS } from "../src/data/index.js";
import chars from "../src/data/chars.json";

describe("pinyin", () => {
  it("splits words into syllables with tones", () => {
    expect(syllables("Huáichéng")).toEqual([["Huái", 2], ["chéng", 2]]);
    expect(syllables("xièxie")).toEqual([["xiè", 4], ["xie", 5]]);
    expect(syllables("guānxi")).toEqual([["guān", 1], ["xi", 5]]);
    expect(syllables("nǐmen")).toEqual([["nǐ", 3], ["men", 5]]);
    expect(syllables("xuésheng")).toEqual([["xué", 2], ["sheng", 5]]);
    expect(syllables("yuè")).toEqual([["yuè", 4]]);
    expect(syllables("yìdiǎnr")).toEqual([["yì", 4], ["diǎnr", 3]]);
    expect(syllables("zhèr")).toEqual([["zhèr", 4]]);
  });
  it("adds and removes tone marks", () => {
    expect(stripTone("lǚ")).toBe("lü");
    expect(addTone("ma", 3)).toBe("mǎ");
    expect(addTone("shui", 4)).toBe("shuì");
    expect(addTone("lü", 4)).toBe("lǜ");
    expect(addTone("gou", 1)).toBe("gōu");
  });
  it("every lesson word splits into one syllable per character", () => {
    for (const w of LESSONS.flatMap((l) => l.words)) {
      const sy = w.py.split(/[\s']/).flatMap(syllables);
      const erhua = w.w.length > 1 && w.w.endsWith("儿") && /r$/.test(w.py) && !/'[eēéěè]r$/.test(w.py); // 这儿 zhèr: 儿 adds no syllable
      expect(sy.length, w.w).toBe([...w.w].length - (erhua ? 1 : 0));
    }
  });
  it("every character's pinyin is a single syllable", () => {
    for (const [c, info] of Object.entries(chars)) expect(syllables(info.py).length, c).toBe(1);
  });
});
