import { describe, it, expect } from "vitest";
import { soundFor, louder, PRIORITY } from "../src/lib/sfx-pick.js";

describe("sound effects: which sound for a saved answer", () => {
  it("right and wrong answers", () => {
    expect(soundFor("q:你", { ok: true })).toBe("right");
    expect(soundFor("t:好", { ok: false, miss: 1 })).toBe("wrong");
  });
  it("writing and flashcards are silent here (they have their own sounds)", () => {
    for (const k of ["w:你", "m:你", "d:你好", "f:你好"]) expect(soundFor(k, { ok: false, miss: 2 })).toBe(null);
  });
  it("a named sound wins, and quiet wins over everything", () => {
    expect(soundFor("q:你", { ok: false, miss: 1 }, { sfx: "right" })).toBe("right");
    expect(soundFor("bsl:氵", { ok: true }, { sfx: "finish" })).toBe("finish");
    expect(soundFor("nb:你", { ok: false }, { quiet: true, sfx: "wrong" })).toBe(null);
  });
});

describe("sound effects: only the most important sound of a moment plays", () => {
  it("picks by priority, in any order", () => {
    expect(louder("tick", "right")).toBe("right");
    expect(louder("finish", "right")).toBe("finish");
    expect(louder("stroke", "done")).toBe("done");
    expect(louder(null, "tick")).toBe("tick");
    expect(louder("tick", null)).toBe("tick");
  });
  it("knows every sound", () => {
    expect(PRIORITY).toEqual(["tick", "flip", "stroke", "miss", "right", "wrong", "done", "finish"]);
  });
});
