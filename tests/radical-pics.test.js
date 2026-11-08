import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import core from "../src/data/radicals-core.json";

const dir = path.resolve(__dirname, "../public/radicals/pic");
const radicals = core.stages.flatMap((s) => s.radicals.map((r) => r.r));

describe("radical pictures", () => {
  it("covers every core radical", () => {
    expect(radicals.length).toBeGreaterThan(0);
    for (const r of radicals) {
      const id = r.codePointAt(0).toString(16);
      expect(fs.existsSync(path.join(dir, id + ".svg")), `${r} (${id}.svg)`).toBe(true);
    }
  });

  for (const r of radicals) {
    const id = r.codePointAt(0).toString(16);
    it(`${r} ${id}.svg is a safe 120x120 svg`, () => {
      const file = path.join(dir, id + ".svg");
      const src = fs.readFileSync(file, "utf8");
      expect(Buffer.byteLength(src)).toBeLessThanOrEqual(2048);
      expect(src).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(src).toMatch(/viewBox="0 0 120 120"/);
      expect(src.trim().endsWith("</svg>")).toBe(true);
      expect(src).not.toMatch(/<script/i);
      expect(src).not.toMatch(/<text/i);
      expect(src).not.toMatch(/href\s*=/i);
      expect(src).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
      expect(src).not.toMatch(/\son\w+\s*=/i);
      // well-formed: every tag opens and closes
      const open = (src.match(/<g[\s>]/g) || []).length, close = (src.match(/<\/g>/g) || []).length;
      expect(open).toBe(close);
    });
  }
});
