import { describe, it, expect, vi } from "vitest";
import * as screen from "../src/lib/screen.js";

describe("screen", () => {
  it("leave() ends what the screen started, newest first, once", () => {
    const order = [];
    screen.onLeave(() => order.push("mic"));
    screen.onLeave(() => order.push("timer"));
    screen.leave();
    screen.leave();
    expect(order).toEqual(["timer", "mic"]);
  });

  it("an unregistered cleanup does not run", () => {
    const fn = vi.fn();
    const off = screen.onLeave(fn);
    off();
    screen.leave();
    expect(fn).not.toHaveBeenCalled();
  });

  it("one failing cleanup does not stop the others", () => {
    const later = vi.fn();
    screen.onLeave(later);
    screen.onLeave(() => { throw new Error("gone"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    screen.leave();
    expect(later).toHaveBeenCalled();
  });

  it("keys go to the newest handler that takes them, and stop after leave()", () => {
    screen.onKey((e) => e.key === "1");
    const newer = vi.fn(() => false);
    screen.onKey(newer);
    expect(screen.key({ key: "1" })).toBe(true);
    expect(newer).toHaveBeenCalled();
    screen.leave();
    expect(screen.key({ key: "1" })).toBe(false);
  });

  it("resize handlers run until leave()", () => {
    const fn = vi.fn();
    screen.onResize(fn);
    screen.resized();
    screen.leave();
    screen.resized();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
