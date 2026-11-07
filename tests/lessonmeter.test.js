import { describe, it, expect } from "vitest";
import { crossed } from "../src/views/lessonmeter.js";

describe("crossed", () => {
  it("detects the 60% seal and 100% gold", () => {
    expect(crossed(0.5, 0.6)).toEqual({ seal: true, gold: false });
    expect(crossed(0.59, 1)).toEqual({ seal: true, gold: true });
    expect(crossed(0.7, 1)).toEqual({ seal: false, gold: true });
    expect(crossed(0.7, 0.8)).toEqual({ seal: false, gold: false });
    expect(crossed(1, 1)).toEqual({ seal: false, gold: false });
  });
});
