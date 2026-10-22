import { describe, it, expect } from "vitest";
import { nextReview, isDue, latest, INTERVALS } from "../src/progress/model.js";

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
});
