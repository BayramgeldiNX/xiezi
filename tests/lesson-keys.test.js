import { describe, it, expect } from "vitest";
import { LESSONS } from "../src/data/index.js";
import { lessonParts } from "../src/progress/lesson-exercises.js";

// Progress keys are saved on every device: a change here orphans the owner's progress.
// Every part of every lesson, one line each: lesson · skill · part, then its items and labels.
describe("lesson keys", () => {
  it("stay the same for every lesson of every book", async () => {
    const lines = [];
    for (const L of LESSONS) for (const [skill, parts] of Object.entries(lessonParts(L))) for (const p of parts) {
      lines.push(`${L.id} · ${skill} · ${p.name}`, "  " + JSON.stringify(p.items));
      // Labels only where they are not just the key without its prefix.
      const plain = (it, i) => typeof it === "string" && it.slice(it.indexOf(":") + 1) === p.labels[i];
      if (p.labels && !p.items.every(plain)) lines.push("  " + JSON.stringify(p.labels));
    }
    await expect(lines.join("\n") + "\n").toMatchFileSnapshot("__snapshots__/lesson-keys.txt");
  });
});
