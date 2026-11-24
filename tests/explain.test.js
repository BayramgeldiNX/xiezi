import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { problems, questions } from "../scripts/explain.mjs";
import gen from "../src/data/explain.gen.json";

describe("Answer explanations", () => {
  it("every question has a why, and a reason for each wrong option", () => {
    expect(problems()).toEqual([]);
  });
  it("explain.gen.json is up to date (run: node scripts/explain.mjs build)", () => {
    // Books without an explain file yet (kouyu-rumen-2: explanations still to write) are not counted.
    const withFiles = new Set(fs.readdirSync(path.join(__dirname, "../src/data/explain")).map((f) => f.replace(/-(grammar|comprehension)\.json$/, "")));
    const keys = new Set(questions().filter((q) => withFiles.has(q.book)).map((q) => q.key));
    expect(Object.keys(gen).length).toBe(keys.size);
    for (const k of Object.keys(gen)) expect(keys.has(k)).toBe(true);
  });
});
