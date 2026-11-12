import { describe, it, expect } from "vitest";
import { LESSONS } from "../src/data/index.js";
import { exerciseItems, lessonParts, available } from "../src/progress/lesson-exercises.js";
import { isDone } from "../src/progress/completion.js";

const lesson = (id) => LESSONS.find((l) => l.id === id);
const keysOf = (id, L) => exerciseItems(id, L).map((e) => e.item);

describe("exerciseItems", () => {
  it("Tones leaves out neutral-tone characters", () => {
    const L = lesson("kouyu-rumen/1"); // 你们
    expect(keysOf("tones", L)).toContain("t:你");
    expect(keysOf("tones", L)).not.toContain("t:们");
  });

  it("Sentences asks a sentence two words share once", () => {
    for (const L of LESSONS) {
      const asked = exerciseItems("sentence", L).map((e) => e.of.ex.hz);
      expect(new Set(asked).size).toBe(asked.length);
      expect(new Set(asked)).toEqual(new Set(L.words.filter((w) => w.ex?.hz).map((w) => w.ex.hz)));
    }
  });

  it("exercises that share items ask the same ones", () => {
    const L = lesson("hsk1/3");
    expect(keysOf("pinyin", L)).toEqual(keysOf("dict", L));
    expect(keysOf("match", L)).toEqual(keysOf("cards", L));
    expect(keysOf("cards", L)[0]).toEqual(["f:" + L.words[0].w, "q:" + L.words[0].w]);
  });

  it("exercises that record nothing ask nothing", () => {
    expect(exerciseItems("texts", lesson("hsk1/1"))).toEqual([]);
  });
});

describe("a text in lesson %", () => {
  const L = lesson("kouyu-rumen/2");
  const [text] = lessonParts(L).read.find((p) => p.exercises.includes("text-quiz")).items;
  const [r, rqs] = text;
  const got = (keys) => (k) => (keys.includes(k) ? { ok: 1 } : undefined);

  it("is done when its own quiz was passed", () => expect(isDone(text, got([r]))).toBe(true));
  it("is done when every question of it was answered right", () => expect(isDone(text, got(rqs))).toBe(true));
  it("is open while one question is left", () => expect(isDone(text, got(rqs.slice(1)))).toBe(false));
  it("uses the same keys as the questions Read & answer asks", () => {
    const asked = exerciseItems("text-quiz", L).filter((e) => e.label === exerciseItems("text-quiz", L)[0].label);
    expect(asked.map((e) => e.item)).toEqual(rqs.map((q) => [r, q]));
  });
});

describe("enough items", () => {
  const word = { w: "你", py: "nǐ", en: "you", ex: { hz: "你好！", py: "nǐ hǎo!", en: "Hello!" } };
  const one = { id: "test/1", words: [word] };

  it("an exercise that chooses between words needs two", () => {
    expect(available("hear", one)).toBe(false);
    expect(available("sentence", one)).toBe(false);
    expect(available("cards", one)).toBe(true);
    expect(available("dict", one)).toBe(true);
  });

  it("an exercise that cannot run does not count toward lesson %", () => {
    const names = Object.values(lessonParts(one)).flat().map((p) => p.name);
    expect(names).not.toContain("Hear the word");
    expect(names).not.toContain("Sentences");
    expect(names).toContain("Flashcards or Word quiz");
  });

  it("exercises without items need their content", () => {
    expect(available("hanzi", one)).toBe(false);
    expect(available("texts", one)).toBe(true);
    expect(available("hear", undefined)).toBe(false);
  });
});
