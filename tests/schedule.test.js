import { describe, it, expect } from "vitest";
import { nextReview, isDue, latest, addResult, INTERVALS } from "../src/progress/model.js";

const DAY = 864e5, T = 1_800_000_000_000;
const stat = (o) => ({ n: 1, ok: 1, miss: 0, last: T, lastOk: true, streak: 1, ...o });

describe("review schedule", () => {
  it("never practiced → not due", () => {
    expect(nextReview(null)).toBeNull();
    expect(isDue({ n: 0 }, T + 999 * DAY)).toBe(false);
  });
  it("right answers push the next review further each time", () => {
    const gaps = [1, 2, 3, 4, 5, 6, 7, 9].map((streak) => (nextReview(stat({ streak })) - T) / DAY);
    expect(gaps).toEqual([1, 3, 7, 14, 30, 60, 120, 120]);
    expect(INTERVALS[0]).toBe(1);
  });
  it("a wrong answer brings it back the next day", () => {
    expect((nextReview(stat({ lastOk: false, streak: 0 })) - T) / DAY).toBe(1);
  });
  it("is due exactly when its time comes", () => {
    const s = stat({ streak: 2 }); // 3 days
    expect(isDue(s, T + 2.9 * DAY)).toBe(false);
    expect(isDue(s, T + 3 * DAY)).toBe(true);
  });
  it("uses the most recent result when several exercises count", () => {
    const quiz = stat({ last: T, lastOk: true, streak: 3 });
    const cards = stat({ last: T + DAY, lastOk: false, streak: 0 });
    expect(latest([quiz, cards, null])).toBe(cards);
    expect(latest([null, undefined])).toBeNull();
  });

  describe("addResult streak", () => {
    it("five right answers at the same time stay at streak 1", () => {
      let s = null;
      for (let i = 0; i < 5; i++) s = addResult(s, { ok: true }, T);
      expect(s.streak).toBe(1);
      expect((nextReview(s) - T) / DAY).toBe(1);
    });
    it("right when due grows the streak", () => {
      const s = addResult(addResult(null, { ok: true }, T), { ok: true }, T + DAY);
      expect(s.streak).toBe(2);
      expect((nextReview(s) - (T + DAY)) / DAY).toBe(3);
    });
    it("right before due keeps the streak and moves last", () => {
      const s = addResult(addResult(null, { ok: true }, T), { ok: true }, T + 0.5 * DAY);
      expect(s.streak).toBe(1);
      expect(s.last).toBe(T + 0.5 * DAY);
    });
    it("wrong resets to 0, the next right gives 1", () => {
      let s = addResult(addResult(null, { ok: true }, T), { ok: false, miss: 1 }, T + DAY);
      expect(s.streak).toBe(0);
      s = addResult(s, { ok: true }, T + 2 * DAY);
      expect(s.streak).toBe(1);
    });
    it("starts from the shared stat of all devices", () => {
      const shared = { n: 5, ok: 5, miss: 0, last: T, lastOk: true, streak: 5 };
      expect(addResult(null, { ok: true }, T + 30 * DAY, shared).streak).toBe(6);
    });
  });
});
