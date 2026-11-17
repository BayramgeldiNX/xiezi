import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { charKind } from "../src/lib/char-kind.js";

// Real data: public/dict/chars.json (the tier comes from scripts/gen-dict.mjs).
const all = JSON.parse(fs.readFileSync(new URL("../public/dict/chars.json", import.meta.url), "utf8"));
const entry = (c) => {
  const e = all[c];
  if (!e) return null;
  const [py, en, , dec, type, sound, hint, tier] = e;
  return { c, py, en, dec, type, sound, hint, tier };
};
const kind = (c, env) => charKind(c, entry(c), env).kind;

describe("charKind: the owner's sample", () => {
  it("common characters are worth learning", () => {
    for (const c of "央换马口手大交反尼巴") expect(kind(c)).toBe("common");
  });
  it("rare characters are parts", () => {
    for (const c of "奂曷娄") expect(kind(c)).toBe("part");
  });
  it("bare shapes end the trail", () => {
    for (const c of "⺈丷冂") expect(kind(c)).toBe("shape");
  });
  it("a character from your books says so, and where", () => {
    expect(charKind("马", entry("马"), { lesson: "HSK 2 · Lesson 5" })).toMatchObject({ kind: "book", text: "Comes in HSK 2 · Lesson 5." });
    expect(charKind("马", entry("马"), { lesson: true }).text).toBe("You know it.");
  });
  it("a radical side form names its full form", () => {
    const r = charKind("扌", entry("扌"), { side: { full: "手", name: "hand", core: "扌" } });
    expect(r).toMatchObject({ kind: "side", full: "手", core: "扌" });
    expect(r.text).toContain("Side form of 手 (hand)");
  });
  it("a side form without a core radical still says what it is", () => {
    expect(charKind("⺈", null, { side: { name: "knife" } }).text).toMatch(/^A radical form \(knife\)/);
  });
  it("a character with no entry is a shape", () => {
    expect(charKind("𠃊", null).kind).toBe("shape");
  });
});

describe("charKind: sound families", () => {
  it("a rare sound part names the sound and the family", () => {
    const family = ["换", "唤", "焕", "涣", "痪"].map((c) => ({ c }));
    const r = charKind("奂", entry("奂"), { family });
    expect(r.kind).toBe("part");
    expect(r.text).toContain("gives the sound huan in 换 唤 焕 涣");
    expect(r.family).toHaveLength(5);
  });
  it("a rare character with no family says it is mostly a part", () => {
    expect(charKind("曷", entry("曷"), { family: [] }).text).toMatch(/mostly meet it as a part/);
  });
});

describe("the common tier", () => {
  it("is about 2,000-3,500 characters", () => {
    const n = Object.values(all).filter((e) => e[7] >= 2).length;
    expect(n).toBeGreaterThan(2000);
    expect(n).toBeLessThan(3500);
  });
});
