import { describe, it, expect } from "vitest";
import { pickRadicalDistractors, allCoreRadicals, shuffleWith } from "../src/lib/radical-quiz.js";
import { RADICALS_CORE, RADICAL_FAMILIES, CHAR_INSIDE } from "../src/data/index.js";

const R = (r, stage, pos, extra = {}) => ({ r, full: r, variants: [], stage, pos, ...extra });

describe("Find-the-radical never offers a radical inside the character", () => {
  it("injected data: 好 never gets 子 when the target is 女", () => {
    const all = [R("女", "s", "left"), R("子", "s", "left"), R("口", "s", "left"), R("木", "s", "left"), R("火", "s", "left")];
    for (const seed of [0.1, 0.4, 0.7, 0.95]) {
      const d = pickRadicalDistractors(all[0], all, () => seed, 3, "好", { 好: "女子" });
      expect(d).not.toContain("子");
      expect(d).toHaveLength(3);
    }
  });
  it("variant forms count as inside", () => {
    const all = [R("月", "s", "left"), R("肉", "s", "left", { variants: ["⺼"] }), R("木", "s", "left"), R("口", "s", "left"), R("火", "s", "left")];
    const d = pickRadicalDistractors(all[3], all, () => 0.2, 4, "脸", { 脸: "⺼佥" }).concat();
    expect(d).not.toContain("肉");
  });
  it("real data: no family character gets a distractor from its own parts", () => {
    const all = allCoreRadicals();
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let n = 0;
    for (const x of all) {
      const f = RADICAL_FAMILIES[x.r];
      for (const c of [...f.book, ...f.common.map((y) => y.c)]) {
        for (let t = 0; t < 3; t++) {
          const inside = c + (CHAR_INSIDE[c] || "");
          for (const r of pickRadicalDistractors(x, all, rand, 3, c)) {
            const y = all.find((z) => z.r === r);
            for (const form of [y.r, y.full, ...y.variants]) expect(inside.includes(form), `${c} offers ${r}`).toBe(false);
          }
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(100);
    expect(RADICALS_CORE.stages.length).toBeGreaterThan(0);
    void shuffleWith;
  });
  it("twins come first", () => {
    const all = [R("a", "s", "left", { twins: [{ r: "e", tell: "x" }] }), R("b", "s", "left"), R("c", "s", "left"), R("d", "s", "left"), R("e", "z", "top")];
    expect(pickRadicalDistractors(all[0], all, () => 0.3, 3)[0]).toBe("e");
    expect(pickRadicalDistractors(all[0], all, () => 0.3, 3, "xe", { xe: "e" })).not.toContain("e");
  });
});

import { buildSpotQuestions, charGloss } from "../src/lib/radical-quiz.js";
import { RADICAL_FAMILIES as FAM, CHAR_INSIDE as INS } from "../src/data/index.js";

describe("spot the radical (lesson quick check)", () => {
  const all = allCoreRadicals();
  it("asks about a family character with three others that do not contain the radical", () => {
    for (const t of all) {
      const qs = buildSpotQuestions(t, all, { rand: () => 0.42, n: 2 });
      for (const q of qs) {
        expect(q.others).toHaveLength(3);
        const forms = [t.r, t.full, ...(t.variants || [])].filter(Boolean);
        for (const o of q.others) expect(forms.some((f) => (o.c + (INS[o.c] || "")).includes(f)), `${t.r} ${o.c}`).toBe(false);
        expect(new Set([q.c, ...q.others.map((o) => o.c)]).size).toBe(4);
      }
    }
  });
  it("prefers words the lesson did not show", () => {
    const t = all.find((x) => x.r === "耳");
    const shown = new Set([...(t.lesson.part || []), ...t.lesson.why.map((w) => w.c), ...(t.lesson.sound || []).map((s) => s.c)]);
    for (const seed of [0.1, 0.5, 0.9]) for (const q of buildSpotQuestions(t, all, { rand: () => seed })) expect(shown.has(q.c)).toBe(false);
  });
  it("glosses a character with its meaning", () => {
    const t = all.find((x) => x.r === "耳");
    expect(charGloss("聪", t).why).toMatch(/ear/);
    for (const c of FAM["耳"].common.map((x) => x.c)) expect(charGloss(c, t).en, c).toBeTruthy();
  });
});
