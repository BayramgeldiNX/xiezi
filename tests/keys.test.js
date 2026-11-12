import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { KINDS, kindOf, afterTries, silent } from "../src/progress/keys.js";
import { LESSONS } from "../src/data/index.js";
import { lessonItems } from "../src/progress/lesson-exercises.js";

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith(".js") ? [p] : [];
});

describe("progress keys", () => {
  it("every key kind written in the code is listed in keys.js", () => {
    const used = new Set();
    for (const f of files("src")) for (const m of readFileSync(f, "utf8").matchAll(/["'`]([a-z]{1,3}):["'`]/g)) used.add(m[1]);
    expect([...used].filter((k) => !KINDS[k])).toEqual([]);
  });

  it("every key a lesson counts is of a listed kind", () => {
    const keys = LESSONS.flatMap((L) => Object.values(lessonItems(L)).flat(3));
    expect(keys.filter((k) => !KINDS[kindOf(k)])).toEqual([]);
  });

  it("writing counts after tries and makes no answer sound", () => {
    expect(afterTries("w:你")).toBe(true);
    expect(afterTries("d:你好")).toBe(true);
    expect(afterTries("q:你好")).toBe(false);
    expect(silent("f:你好")).toBe(true);
    expect(silent("m:你")).toBe(true);
    expect(silent("s:你好#ex")).toBe(false);
    expect(silent("unknown")).toBe(false);
  });
});
