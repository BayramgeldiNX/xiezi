import { describe, it, expect } from "vitest";
import { problems, questions } from "../scripts/explain.mjs";
import gen from "../src/data/explain.gen.json";

describe("Answer explanations", () => {
  it("every question has a why, and a reason for each wrong option", () => {
    expect(problems()).toEqual([]);
  });
  it("explain.gen.json is up to date (run: node scripts/explain.mjs build)", () => {
    const keys = new Set(questions().map((q) => q.key));
    expect(Object.keys(gen).length).toBe(keys.size);
    for (const k of Object.keys(gen)) expect(keys.has(k)).toBe(true);
  });
});
