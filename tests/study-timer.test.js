import { describe, it, expect } from "vitest";
import { createTimer, formatElapsed, TIMER_KEY } from "../src/lib/study-timer.js";

const setup = (data = {}) => {
  let t = 1_000_000;
  const mem = { ...data };
  const store = { get: (k, d) => mem[k] ?? d, set: (k, v) => { mem[k] = v; } };
  return { clock: { now: () => t, adv: (ms) => { t += ms; } }, mem, store };
};

describe("formatElapsed", () => {
  it("formats minutes and hours", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(247000)).toBe("4:07");
    expect(formatElapsed(3735000)).toBe("1:02:15");
  });
});

describe("study timer", () => {
  it("counts while running, pauses by hand, and stops", () => {
    const { clock, store } = setup();
    const tm = createTimer(clock.now, store);
    tm.start(); clock.adv(5000);
    expect(tm.elapsed()).toBe(5000);
    tm.toggle(); clock.adv(9000);
    expect(tm.isPaused()).toBe(true);
    expect(tm.elapsed()).toBe(5000);
    tm.toggle(); clock.adv(1000);
    expect(tm.elapsed()).toBe(6000);
    tm.stop(); clock.adv(4000);
    expect(tm.elapsed()).toBe(6000);
    expect(tm.isRunning()).toBe(false);
  });
  it("stays paused on start when the user paused", () => {
    const { clock, store } = setup();
    const tm = createTimer(clock.now, store);
    tm.start(); clock.adv(2000); tm.toggle(); tm.stop(); clock.adv(1000); tm.start(); clock.adv(3000);
    expect(tm.isRunning()).toBe(false);
    expect(tm.elapsed()).toBe(2000);
  });
  it("starts a new session after 30 minutes away", () => {
    const { clock, store } = setup();
    const tm = createTimer(clock.now, store);
    tm.start(); clock.adv(10000); tm.stop();
    clock.adv(10 * 60000); tm.start(); clock.adv(1000);
    expect(tm.elapsed()).toBe(11000);
    tm.stop(); clock.adv(31 * 60000); tm.start();
    expect(tm.elapsed()).toBe(0);
  });
  it("resets to zero and keeps running", () => {
    const { clock, store } = setup();
    const tm = createTimer(clock.now, store);
    tm.start(); clock.adv(8000); tm.reset(); clock.adv(2000);
    expect(tm.elapsed()).toBe(2000);
  });
  it("keeps time through a reload", () => {
    const { clock, store, mem } = setup();
    const tm = createTimer(clock.now, store);
    tm.start(); clock.adv(7000); tm.persist();
    expect(mem[TIMER_KEY].ms).toBe(7000);
    clock.adv(60000);
    const again = createTimer(clock.now, store);
    expect(again.elapsed()).toBe(7000);
    expect(again.isRunning()).toBe(false);
  });
});
