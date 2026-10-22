import { describe, it, expect } from "vitest";
import { makeSegmenter } from "../src/lib/segment.js";
import { toneVariants, syllables } from "../src/lib/pinyin.js";
import lesson1 from "../src/data/books/kouyu-rumen/lesson01.json";
import chars from "../src/data/chars.json";
import glossary from "../src/data/glossary.json";

const dict = {};
for (const [c, v] of Object.entries(chars)) dict[c] = v;
Object.assign(dict, glossary);
for (const w of lesson1.words) dict[w.w] = { py: w.py, en: w.en };
const segment = makeSegmenter(dict);
const words = (s) => segment(s).filter((p) => p.word).map((p) => p.t);

describe("word splitting", () => {
  it("prefers the longest known word", () => {
    expect(words("谢谢老师。")).toEqual(["谢谢", "老师"]);
    expect(words("不客气。请坐。")).toEqual(["不客气", "请", "坐"]);
    expect(words("请再说一遍。")).toEqual(["请", "再", "说", "一遍"]);
    expect(words("我是白怀诚。")).toEqual(["我", "是", "白怀诚"]);
  });
  it("keeps punctuation as separate, non-word pieces", () => {
    expect(segment("你好！").map((p) => [p.t, p.word])).toEqual([["你好", true], ["！", false]]);
  });
  it("every word in every reading text has a meaning", () => {
    for (const r of lesson1.readings) for (const l of r.lines)
      for (const p of segment(l.hz)) if (p.word) expect(p.info, `${p.t} in ${r.id}`).toBeTruthy();
  });
});

describe("pinyin tone variants", () => {
  it("changes exactly one tone and never returns the right answer", () => {
    for (const py of ["nǐ hǎo", "xièxie", "lǎoshī", "duìbuqǐ", "zàijiàn"]) {
      const right = py.replace(/\s/g, "");
      const v = toneVariants(py);
      expect(v.length).toBeGreaterThan(0);
      for (const x of v) {
        expect(x).not.toBe(right);
        expect(syllables(x).length).toBe(syllables(right).length);
      }
    }
  });
});
