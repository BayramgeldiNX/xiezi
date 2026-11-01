import { describe, it, expect, vi } from "vitest";
import { directionPicker } from "../src/lib/util.js";

describe("directionPicker", () => {
  it("returns a fixed mode as it is", () => {
    expect(directionPicker("word", "word", "meaning")({ w: "你" })).toBe("word");
  });
  it("mixed: random, but the same for a word during one round", () => {
    const pick = directionPicker("mixed", "word", "meaning");
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      const w = { w: "w" + i };
      const d = pick(w);
      expect(["word", "meaning"]).toContain(d);
      expect(pick(w)).toBe(d);
      seen.add(d);
    }
    expect(seen.size).toBe(2);
  });
  it("mixed: follows Math.random", () => {
    const r = vi.spyOn(Math, "random").mockReturnValue(0.9);
    expect(directionPicker("mixed", "a", "b")({ w: "x" })).toBe("b");
    r.mockRestore();
  });
});
