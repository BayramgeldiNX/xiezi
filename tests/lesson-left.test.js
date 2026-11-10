import { describe, it, expect } from "vitest";
import { LESSONS } from "../src/data/index.js";
import { completion } from "../src/progress/completion.js";

// lesson-items pulls in the views, which touch the page when loaded: give them an empty one.
const el = () => new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : el()), apply: () => el(), construct: () => el(), set: () => true });
for (const k of ["document", "window", "localStorage", "navigator", "addEventListener", "matchMedia", "Audio"]) globalThis[k] ??= el();
const { lessonItems, lessonParts, lessonLeft } = await import("../src/lib/lesson-items.js");

const L = LESSONS[0];
const sum = (ps, f) => ps.reduce((n, p) => n + p[f], 0);

describe("lessonLeft", () => {
  it("lists everything as left on a new lesson, and agrees with completion()", () => {
    const left = lessonLeft(L, () => undefined), c = completion(lessonItems(L), () => undefined);
    for (const [k, ps] of Object.entries(left)) {
      expect(sum(ps, "total")).toBe(c.skills[k].total);
      expect(sum(ps, "left")).toBe(c.skills[k].total);
    }
  });
  it("drops an item once it is done, and names the open ones", () => {
    const w = L.words[0].w;
    const hear = lessonLeft(L, (k) => (k === "l:" + w ? { ok: 1 } : undefined)).listen.find((p) => p.modes.includes("hear"));
    expect(hear.left).toBe(L.words.length - 1);
    expect(hear.labels).not.toContain(w);
    expect(hear.labels).toContain(L.words[1].w);
  });
  it("every lesson: no empty parts, labels match items", () => {
    for (const l of LESSONS) for (const ps of Object.values(lessonParts(l))) for (const p of ps) {
      expect(p.items.length).toBeGreaterThan(0);
      if (p.labels) expect(p.labels.length).toBe(p.items.length);
    }
  });
});
