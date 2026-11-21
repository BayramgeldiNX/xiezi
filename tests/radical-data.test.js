import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RADICALS_CORE } from "../src/data/index.js";

const chars = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../public/dict/chars.json"), "utf8"));
const all = RADICALS_CORE.stages.flatMap((s) => s.radicals);
const formsOf = (r) => [r.r, r.full, ...(r.variants || [])];

describe("radicals-core data", () => {
  it("every meaning+sound example shows a sound part the learner can see", () => {
    for (const r of all) for (const it of r.lesson?.sound || []) {
      const e = chars[it.c];
      expect(e, `${r.r} ${it.c} in dictionary`).toBeTruthy();
      expect(formsOf(r), `${r.r} ${it.c} radical ${e[2]}`).toContain(e[2]);
      expect(e[3], `${r.r} ${it.c} IDS has ${it.sound}`).toContain(it.sound);
      expect(e[0], `${r.r} ${it.c} py`).toBe(it.py);
      if (e[5]) expect(e[5], `${r.r} ${it.c} phonetic`).toBe(it.sound);
    }
  });
  it("radicals that were converted from shape to meaning are complete", () => {
    for (const k of ["月", "王", "阝", "囗", "子"]) {
      const r = all.find((x) => x.r === k);
      expect(r.kind, k).toBe("meaning");
      expect(r.guess.length, `${k} guess`).toBeGreaterThanOrEqual(4);
      expect(r.lesson.sound, `${k} sound`).toHaveLength(2);
      expect(r.lesson.shape, `${k} shape`).toBeUndefined();
      expect(r.lesson.why, `${k} why`).toHaveLength(4);
      for (const w of r.lesson.why) expect(w.why.split(/\s+/).length, `${k} ${w.c}`).toBeLessThanOrEqual(12);
      expect(r.meaningNote).not.toMatch(/sorting radical/i);
    }
  });
  it("guess characters of the converted radicals belong to the radical, is common and has a reading", () => {
    for (const r of all.filter((x) => ["月", "王", "阝", "囗", "子"].includes(x.r))) for (const g of r.guess || []) {
      const e = chars[g.c];
      expect(e, `${r.r} ${g.c}`).toBeTruthy();
      expect(formsOf(r), `${r.r} ${g.c} radical ${e[2]}`).toContain(e[2]);
      expect(e[0] && e[7] >= 2, `${r.r} ${g.c} common`).toBeTruthy();
    }
  });
});

describe("guess does not repeat the lesson", () => {
  // 身 has only five characters, so its guess has to reuse the lesson's.
  it("no guess character is in the lesson's why or part", () => {
    for (const r of all.filter((x) => x.r !== "身")) {
      const seen = new Set([...(r.lesson?.why || []).map((w) => w.c), ...(r.lesson?.part || [])]);
      for (const g of r.guess || []) expect(seen.has(g.c), `${r.r} guess ${g.c} is in the lesson`).toBe(false);
    }
  });
});
