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

describe("countdown", () => {
  const MIN = 60000;
  it("defaults to a stopwatch of 45 minutes and loads old state", () => {
    const { clock, store } = setup({ [TIMER_KEY]: { ms: 5000, paused: false, lastSeen: 1_000_000 } });
    const tm = createTimer(clock.now, store);
    expect(tm.mode()).toBe("up");
    expect(tm.minutes()).toBe(45);
    expect(tm.left()).toBe(45 * MIN);
    expect(tm.elapsed()).toBe(5000);
  });
  it("counts down, pauses, resumes and resets", () => {
    const { clock, store } = setup();
    const tm = createTimer(clock.now, store);
    tm.setMode("down"); tm.startDown(); clock.adv(10000);
    expect(tm.left()).toBe(45 * MIN - 10000);
    expect(tm.isDownRunning()).toBe(true);
    tm.pauseDown(); clock.adv(5 * MIN);
    expect(tm.isDownPaused()).toBe(true);
    expect(tm.left()).toBe(45 * MIN - 10000);
    tm.resumeDown(); clock.adv(1000);
    expect(tm.left()).toBe(45 * MIN - 11000);
    tm.resetDown();
    expect(tm.left()).toBe(45 * MIN);
    expect(tm.isDownRunning()).toBe(false);
  });
  it("finishes while the app is hidden and rings once", () => {
    const { clock, store } = setup();
    const tm = createTimer(clock.now, store);
    tm.setMinutes(5); tm.startDown();
    clock.adv(2 * 60 * MIN);
    expect(tm.isDone()).toBe(true);
    expect(tm.left()).toBe(0);
    expect(tm.needsRing()).toBe(true);
    tm.markRang();
    expect(tm.needsRing()).toBe(false);
    expect(tm.isDone()).toBe(true);
    const again = createTimer(clock.now, store);   // reload: already acknowledged
    expect(again.needsRing()).toBe(false);
    again.ackDone();
    expect(again.isDone()).toBe(false);
    expect(again.left()).toBe(5 * MIN);
  });
  it("rings after a reload if it ended meanwhile", () => {
    const { clock, store } = setup();
    const tm = createTimer(clock.now, store);
    tm.startDown(); clock.adv(46 * MIN);
    expect(createTimer(clock.now, store).needsRing()).toBe(true);
  });
  it("clamps the length and restarts a running countdown", () => {
    const { clock, store } = setup();
    const tm = createTimer(clock.now, store);
    tm.setMinutes(1); expect(tm.minutes()).toBe(5);
    tm.setMinutes(999); expect(tm.minutes()).toBe(180);
    tm.setMinutes(12.4); expect(tm.minutes()).toBe(12);
    tm.setMinutes(25); tm.startDown(); clock.adv(10 * MIN);
    tm.setMinutes(15);
    expect(tm.left()).toBe(15 * MIN);
    expect(tm.isDownRunning()).toBe(true);
  });
  it("switching mode stops the other one", () => {
    const { clock, store } = setup();
    const tm = createTimer(clock.now, store);
    tm.start(); clock.adv(7000);
    tm.setMode("down");
    clock.adv(5000);
    expect(tm.elapsed()).toBe(7000);
    expect(tm.isRunning()).toBe(false);
    tm.startDown(); clock.adv(1000);
    tm.setMode("up");
    expect(tm.isDownRunning()).toBe(false);
    expect(tm.left()).toBe(45 * MIN);
    expect(tm.isRunning()).toBe(true);
    expect(tm.elapsed()).toBe(7000);
  });
});

describe("countdown doneFor", () => {
  it("says how long ago the countdown finished", () => {
    let t = 1_000_000;
    const mem = {}; const store = { get: (k, d) => mem[k] ?? d, set: (k, v) => { mem[k] = v; } };
    const tm = createTimer(() => t, store);
    tm.setMinutes(5); tm.startDown();
    expect(tm.doneFor()).toBe(0);
    t += 5 * 60000 + 31 * 60000;
    expect(tm.doneFor()).toBe(31 * 60000);
    tm.ackDone();
    expect(tm.doneFor()).toBe(0);
  });
});
