import { describe, it, expect } from "vitest";
const noop = () => {};
globalThis.document = { addEventListener: noop, dispatchEvent: noop, querySelector: () => null, documentElement: { dataset: {}, style: {} }, hidden: false };
globalThis.Event ??= class {};
globalThis.addEventListener ??= noop;
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

const { pick, NAMES, sessionSound, onSession, played } = await import("../src/lib/sfx.js");

describe("sound effects: the bell and the stamp of a test", () => {
  it("are made, next to the others", () => {
    expect(NAMES).toEqual(expect.arrayContaining(["bell", "stamp", "right", "finish"]));
  });
  it("win over a tap tick or an answer sound asked for in the same moment", () => {
    expect(pick("tick", "bell")).toBe("bell");
    expect(pick("stamp", "finish")).toBe("stamp");
    expect(pick("tick", "right")).toBe("right");
    expect(pick(null, "stamp")).toBe("stamp");
  });
  it("a quiet record makes no answer sound, and a test session no finish sound", async () => {
    expect(soundFor("q:你", { ok: true }, { quiet: true })).toBe(null);
    expect(soundFor("g:a/1.1", { ok: false }, { quiet: true })).toBe(null);
    expect(sessionSound({ type: "test" })).toBe(null);
    onSession({ type: "test" });
    await new Promise((r) => setTimeout(r, 5)); // sfx() fires on a macrotask
    expect(played).toEqual([]);
  });
  it("a normal session still ends with the finish sound", () => {
    expect(sessionSound({ type: "cards" })).toBe("finish");
    expect(sessionSound({ type: "dictation" })).toBe("finish");
  });
});
