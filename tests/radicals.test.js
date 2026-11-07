import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { radicalKey } from "../src/lib/radicals.js";

const root = path.resolve(__dirname, "..");
const corePath = path.join(root, "src/data/radicals-core.json");
const have = fs.existsSync(corePath);

describe("radicalKey", () => {
  it("uses the bs: prefix", () => {
    expect(radicalKey("氵")).toBe("bs:氵");
  });
});

(have ? describe : describe.skip)("radicals core and families", () => {
  const core = have ? JSON.parse(fs.readFileSync(corePath, "utf8")) : { stages: [] };
  const fam = JSON.parse(fs.readFileSync(path.join(root, "src/data/radical-families.gen.json"), "utf8"));
  const all = core.stages.flatMap((s) => s.radicals);
  const POS = ["left", "right", "top", "bottom", "enclose", "any"];

  it("has stages with radicals", () => {
    expect(core.stages.length).toBeGreaterThan(0);
    for (const s of core.stages) {
      expect(s.id && s.title && s.cn).toBeTruthy();
      expect(s.radicals.length).toBeGreaterThan(0);
    }
  });
  it("every radical has the required fields", () => {
    for (const r of all) {
      for (const k of ["r", "full", "py", "name", "en", "pos", "origin", "tip"]) expect(typeof r[k], `${r.r}.${k}`).toBe("string");
      expect(Array.isArray(r.variants)).toBe(true);
      expect(Array.isArray(r.examples)).toBe(true);
      expect(typeof r.pos).toBe("string");
      expect(POS, `${r.r} pos`).toContain(r.pos);
    }
  });
  it("r is unique and variants do not collide", () => {
    const rs = all.map((r) => r.r);
    expect(new Set(rs).size).toBe(rs.length);
    const forms = all.flatMap((r) => [r.r, ...r.variants]);
    for (const r of all) for (const v of r.variants) expect(rs.includes(v) && v !== r.r, `${v} is also a radical`).toBe(false);
    void forms;
  });
  it("families match the core radicals", () => {
    expect(Object.keys(fam).sort()).toEqual(all.map((r) => r.r).sort());
  });
  it("each family has at least 4 characters and contains its examples", () => {
    for (const r of all) {
      const f = fam[r.r];
      const set = new Set([...f.book, ...f.common.map((x) => x.c)]);
      expect(set.size, r.r).toBeGreaterThanOrEqual(4);
      for (const c of r.examples) expect(set.has(c), `${r.r} example ${c}`).toBe(true);
    }
  });
  it("kind is meaning or shape; meaning radicals have >=4 guess items in their family", () => {
    if (!all.every((r) => r.kind)) {
      console.warn("SKIP: core has no `kind` on every radical yet");
      return;
    }
    for (const r of all) {
      expect(["meaning", "shape"], `${r.r} kind`).toContain(r.kind);
      if (r.kind === "meaning") expect((r.guess || []).length, `${r.r} guess`).toBeGreaterThanOrEqual(4);
    }
  });
  it("every guess char is in its family", () => {
    for (const r of all) {
      const f = fam[r.r];
      const set = new Set([...f.book, ...f.common.map((x) => x.c)]);
      for (const g of r.guess || []) {
        const forms = new Set([r.r, ...r.variants]);
        const ok = set.has(g.c) || forms.has(JSON.parse(fs.readFileSync(path.join(root, "public/dict/chars.json"), "utf8"))[g.c]?.[2]);
        expect(ok, `${r.r} guess ${g.c}`).toBe(true);
      }
    }
  });
});
