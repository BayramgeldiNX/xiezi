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

describe("sentencePy fallbacks and punctuation", () => {
  it("covers characters no word table has (ledu sentences, 〇)", () => {
    expect(sentencePy("我昨天很晚才睡着。")).toMatch(/cái/);
    expect(sentencePy("在“木”的下边加一横，就是“本”。")).toMatch(/jiā.*héng/);
    expect(sentencePy("二〇二六年")).toMatch(/líng/);
    expect(sentencePy("秋天")).toMatch(/qiū/);
  });
  it("attaches an opening quote to the next word and closing marks to the previous", () => {
    const out = sentencePy("他说“对不起”。");
    expect(out).toMatch(/shuō “duì/);
    expect(out).toMatch(/qǐ”。$/);
    expect(sentencePy("（你好）")).toBe("（nǐhǎo）");
  });
  it("spaces long dictionary phrases by word", () => {
    expect(sentencePy("祝你生日快乐！")).toMatch(/ /);
    expect(sentencePy("祝你生日快乐！")).not.toMatch(/^zhùnǐ/);
  });
  it("reads 地 after a word as de, but not inside 地铁 or 地方", () => {
    expect(sentencePy("他一心一意地学汉语。")).toMatch(/yìxīnyíyì de xué/);
    expect(sentencePy("坐地铁")).toMatch(/dì/);
  });
});
