import { describe, it, expect, beforeEach, vi } from "vitest";

// Fresh store module (and fake localStorage) for every test.
async function freshStore() {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  vi.resetModules();
  return import("../src/progress/store.js");
}

describe("progress store", () => {
  let S;
  beforeEach(async () => { S = await freshStore(); });

  it("records on this device and reads it back", () => {
    S.record("w:你", { ok: true });
    S.record("w:你", { ok: true });
    expect(S.get("w:你")).toMatchObject({ n: 2, ok: 2, lastOk: true });
    expect(S.get("w:好")).toBeNull();
  });

  it("adds results from other devices without touching our own", () => {
    S.record("d:你好", { ok: false, miss: 2 });
    const me = S.deviceId();
    S.applyRemoteItem("d:你好", {
      [me]: { n: 99, ok: 99, miss: 0, last: 1, lastOk: true, streak: 99 }, // our own copy in the cloud is ignored
      "dev-ipad": { n: 3, ok: 3, miss: 0, last: 1, lastOk: true, streak: 3 },
    });
    expect(S.get("d:你好")).toMatchObject({ n: 4, ok: 3, miss: 2, lastOk: false });
    expect(S.allMine()["d:你好"].n).toBe(1);
  });

  it("pushes every new result to the syncer", () => {
    const pushItem = vi.fn(), pushSession = vi.fn();
    S.setSyncer({ pushItem, pushSession });
    S.record("f:坐", { ok: true });
    S.addSession({ type: "cards", lesson: 1, score: 1, total: 1 });
    expect(pushItem).toHaveBeenCalledWith("f:坐", expect.objectContaining({ n: 1, ok: 1 }));
    expect(pushSession).toHaveBeenCalledWith(expect.objectContaining({ type: "cards", dev: S.deviceId() }));
  });

  it("forgets other devices on sign out but keeps its own", () => {
    S.record("w:你", { ok: true });
    S.applyRemoteItem("w:你", { "dev-x": { n: 5, ok: 5, miss: 0, last: 1, lastOk: true, streak: 5 } });
    S.applyRemoteSession({ id: "x1", dev: "dev-x", at: 1, type: "dict", score: 1, total: 1 });
    S.clearRemote();
    expect(S.get("w:你").n).toBe(1);
    expect(S.sessions().some((s) => s.dev === "dev-x")).toBe(false);
  });

  it("does not duplicate sessions that arrive twice", () => {
    const s = { id: "a1", dev: "dev-x", at: 5, type: "dict", score: 3, total: 4 };
    S.applyRemoteSession(s);
    S.applyRemoteSession(s);
    expect(S.sessions().filter((x) => x.id === "a1")).toHaveLength(1);
  });

  it("backup round trip: another device's backup merges as that device", async () => {
    S.record("w:你", { ok: true });
    const backup = S.exportBackup();
    const T = await freshStore();           // a different device
    T.record("w:你", { ok: false, miss: 1 });
    T.importBackup(JSON.parse(JSON.stringify(backup)));
    expect(T.get("w:你")).toMatchObject({ n: 2, ok: 1, miss: 1 });
    T.importBackup(JSON.parse(JSON.stringify(backup))); // importing twice changes nothing
    expect(T.get("w:你").n).toBe(2);
    expect(() => T.importBackup({ hello: 1 })).toThrow(/backup/);
  });
});
