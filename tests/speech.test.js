import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import AUDIO from "../src/data/audio.gen.json";

// A stand-in for the browser's audio player: the test decides when a sound begins and ends.
class FakeAudio {
  constructor() { this.attrs = {}; this.currentTime = 0; this.duration = NaN; this.playbackRate = 1; }
  set src(v) { this.attrs.src = v; this.currentTime = 0; }
  get src() { return this.attrs.src || ""; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  play() { return Promise.resolve(); }
  pause() {}
  load() {}
  begin(duration) { this.duration = duration; this.currentTime = 0.1; this.onplaying?.(); }
}

let speech, player;
const word = Object.keys(AUDIO).find((t) => [...t].length === 1);

beforeAll(async () => {
  const noop = () => {};
  globalThis.Audio = vi.fn(function () { player = new FakeAudio(); return player; });
  globalThis.document = { addEventListener: noop, dispatchEvent: noop, querySelector: () => null, documentElement: { dataset: {} } };
  globalThis.addEventListener = noop;
  globalThis.fetch = () => Promise.resolve();
  speech = await import("../src/lib/speech.js");
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => { speech.stopSpeech(); vi.useRealTimers(); });

describe("speech: a recording on a slow line", () => {
  it("still plays when its download takes a few seconds", async () => {
    let result;
    speech.say(word).then((v) => { result = v; });
    await vi.advanceTimersByTimeAsync(4000);
    expect(result).toBeUndefined();
    expect(player.getAttribute("src")).toBeTruthy();
    player.begin(1);
    player.onended();
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBe(true);
  });

  it("is dropped when it never begins, so it can't start much later out of nowhere", async () => {
    let result;
    speech.say(word).then((v) => { result = v; });
    await vi.advanceTimersByTimeAsync(speech.START_WAIT + 4000);
    expect(result).toBe(false);
    expect(player.getAttribute("src")).toBeNull();
  });

  it("gets its real length once it begins", async () => {
    let result;
    speech.say(word).then((v) => { result = v; });
    await vi.advanceTimersByTimeAsync(1000);
    player.begin(20);
    await vi.advanceTimersByTimeAsync(15000);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10000);
    expect(result).toBe(false);
  });
});
