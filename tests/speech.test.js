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
const net = { slow: false, waiting: [] };
const word = Object.keys(AUDIO).find((t) => [...t].length === 1);

beforeAll(async () => {
  const noop = () => {};
  globalThis.Audio = vi.fn(function () { player = new FakeAudio(); return player; });
  globalThis.document = { addEventListener: noop, dispatchEvent: noop, querySelector: () => null, documentElement: { dataset: {} } };
  globalThis.addEventListener = noop;
  // Downloads answer when the test says so (net.slow) or at once.
  globalThis.fetch = vi.fn((url) => new Promise((resolve) => {
    const done = () => resolve({ ok: true, blob: () => Promise.resolve(new Blob([url])) });
    if (net.slow) net.waiting.push(done); else done();
  }));
  speech = await import("../src/lib/speech.js");
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => { speech.stopSpeech(); vi.useRealTimers(); net.slow = false; net.waiting = []; });

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

describe("speech: one download per word", () => {
  const other = Object.keys(AUDIO).filter((t) => [...t].length === 2)[3];

  it("fetches a word once and plays it from memory the next time", async () => {
    fetch.mockClear();
    const second = Object.keys(AUDIO).filter((t) => [...t].length === 2)[7];
    speech.say(second);
    await vi.advanceTimersByTimeAsync(0);
    expect(player.getAttribute("src")).toMatch(/^blob:/);
    speech.stopSpeech();
    speech.say(second);
    await vi.advanceTimersByTimeAsync(0);
    expect(player.getAttribute("src")).toMatch(/^blob:/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the download arrives after the safety time", async () => {
    net.slow = true;
    let result;
    speech.say(other).then((v) => { result = v; });
    await vi.advanceTimersByTimeAsync(speech.START_WAIT + 5000);
    expect(result).toBe(false);
    net.waiting.forEach((f) => f());
    await vi.advanceTimersByTimeAsync(0);
    expect(player.getAttribute("src")).toBeNull();
  });

  it("a word tapped while another downloads plays alone", async () => {
    net.slow = true;
    const a = Object.keys(AUDIO).filter((t) => [...t].length === 3)[1], b = Object.keys(AUDIO).filter((t) => [...t].length === 3)[2];
    speech.say(a);
    speech.say(b);
    const [first, second] = net.waiting;
    second();
    await vi.advanceTimersByTimeAsync(0);
    const playing = player.getAttribute("src");
    expect(playing).toMatch(/^blob:/);
    first();
    await vi.advanceTimersByTimeAsync(0);
    expect(player.getAttribute("src")).toBe(playing);
  });
});
