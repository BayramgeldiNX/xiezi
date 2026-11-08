import { describe, it, expect } from "vitest";
import { lessonSteps, stepIndex, nextRadical, firstUndone, learnHash, picId } from "../src/lib/radical-lesson.js";

describe("radical lesson helpers", () => {
  it("skips the sound step when there is nothing for it", () => {
    expect(lessonSteps({ kind: "meaning", lesson: { sound: [] } })).toHaveLength(5);
    expect(lessonSteps({ kind: "meaning", lesson: { sound: [{ c: "湖" }] } })).toHaveLength(6);
    expect(lessonSteps({ kind: "shape", lesson: { shape: "x" } })).toHaveLength(6);
  });
  it("clamps step numbers", () => {
    expect(stepIndex("9", 6)).toBe(6);
    expect(stepIndex(undefined, 6)).toBe(1);
    expect(stepIndex("0", 6)).toBe(1);
  });
  it("finds next and first undone", () => {
    const all = [{ r: "a" }, { r: "b" }, { r: "c" }];
    expect(nextRadical(all, "a").r).toBe("b");
    expect(nextRadical(all, "c")).toBe(null);
    expect(firstUndone(all, (r) => r === "a").r).toBe("b");
    expect(firstUndone(all, () => true)).toBe(null);
  });
  it("addresses and picture ids", () => {
    expect(learnHash("氵", 3)).toBe("#/radical/%E6%B0%B5/learn/3");
    expect(picId("氵")).toBe("6c35");
  });
});
