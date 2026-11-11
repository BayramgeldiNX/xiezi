import { describe, it, expect } from "vitest";
import { pickRound, openFirst } from "../src/lib/round.js";

const list = ["a", "b", "c", "d", "e", "f"];
const key = (x) => "o:" + x;
const doneSet = (...xs) => (k) => (xs.map(key).includes(k) ? { ok: 1 } : undefined);

describe("pickRound", () => {
  it("asks only what is not done yet", () => {
    for (let i = 0; i < 20; i++) {
      const r = pickRound(list, key, doneSet("a", "b", "c", "d"), 3);
      expect(r.sort()).toEqual(["e", "f"]);
    }
  });
  it("caps the round at n", () => {
    expect(pickRound(list, key, () => undefined, 4)).toHaveLength(4);
    expect(pickRound(list, key, () => undefined)).toHaveLength(6);
  });
  it("asks any of them once all are done", () => {
    const r = pickRound(list, key, doneSet(...list), 4);
    expect(r).toHaveLength(4);
    expect(r.every((x) => list.includes(x))).toBe(true);
  });
  it("counts an item done when any of its keys is (Flashcards or Word quiz)", () => {
    const r = pickRound(list, (x) => ["f:" + x, "q:" + x], (k) => (k === "f:a" || k === "q:b" ? { ok: 1 } : undefined));
    expect(r.sort()).toEqual(["c", "d", "e", "f"]);
  });
  it("a wrong answer stays open", () => {
    const r = pickRound(["a", "b"], key, (k) => (k === "o:a" ? { ok: 0, miss: 1 } : { ok: 1 }));
    expect(r).toEqual(["a"]);
  });
});

describe("openFirst", () => {
  it("keeps every item, open ones first", () => {
    const r = openFirst(list, key, doneSet("a", "c", "e"));
    expect(r).toHaveLength(6);
    expect(r.slice(0, 3).sort()).toEqual(["b", "d", "f"]);
  });
});
