import { describe, it, expect, beforeEach, vi } from "vitest";

async function freshStore() {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  vi.resetModules();
  const [N, P] = await Promise.all([import("../src/notebook/store.js"), import("../src/progress/store.js")]);
  return { N, P };
}

describe("notebook store", () => {
  let N, P;
  beforeEach(async () => { ({ N, P } = await freshStore()); });

  it("saves a word at once, newest first, waiting for Claude", () => {
    N.addWord("外卖", { at: 1000 });
    N.addWord("奶茶", { at: 2000 });
    expect(N.list().map((e) => e.w)).toEqual(["奶茶", "外卖"]);
    expect(N.getWord("外卖")).toMatchObject({ status: "new", py: "", sentence: null, deleted: false });
  });

  it("keeps a pending patch when the cloud copy arrives", () => {
    N.addWord("外卖");
    N.update("外卖", { en: "takeout" });
    N.applyRemote("外卖", { w: "外卖", py: "wài mài", en: "", status: "filled", sentence: { cn: "a", py: "b", en: "c" }, at: 1 });
    const e = N.getWord("外卖");
    expect(e.en).toBe("takeout");     // our unconfirmed edit stays
    expect(e.py).toBe("wài mài");     // Claude's fill arrives
    expect(e.sentence.cn).toBe("a");
  });

  it("confirm clears only an unchanged patch", () => {
    N.addWord("外卖");
    const sent = { ...N.pendingAll()[0][1] };
    N.update("外卖", { en: "takeout" }); // edited after the push started
    N.confirm("外卖", sent);
    expect(N.pendingAll()).toHaveLength(1);
    N.confirm("外卖", { ...N.pendingAll()[0][1] });
    expect(N.pendingAll()).toHaveLength(0);
    expect(N.getWord("外卖").en).toBe("takeout");
  });

  it("pushes every change to the syncer", () => {
    const push = vi.fn();
    N.setSyncer({ push });
    N.addWord("外卖");
    N.update("外卖", { py: "wài mài" });
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[1][1]).toMatchObject({ w: "外卖", py: "wài mài" });
  });

  it("deleting leaves a tombstone; saving again brings the word back", () => {
    N.addWord("外卖");
    N.remove("外卖");
    expect(N.list()).toHaveLength(0);
    expect(N.getWord("外卖").deleted).toBe(true);
    N.addWord("外卖");
    expect(N.list().map((e) => e.w)).toEqual(["外卖"]);
  });

  it("a tombstone from the cloud hides the word", () => {
    N.applyRemote("外卖", { w: "外卖", deleted: true, at: 1 });
    expect(N.list()).toHaveLength(0);
  });

  it("due includes new words, and practised ones only when their time has come", () => {
    N.addWord("外卖");
    N.addWord("奶茶");
    expect(N.dueWords().map((e) => e.w).sort()).toEqual(["外卖", "奶茶"].sort());
    P.record("nb:外卖", { ok: true }); // just practised: next review is later
    expect(N.dueWords().map((e) => e.w)).toEqual(["奶茶"]);
    expect(N.dueWords(Date.now() + 400 * 864e5).map((e) => e.w).sort()).toEqual(["外卖", "奶茶"].sort());
  });

  it("sign-out drops cloud-only entries but keeps unsent ones", () => {
    N.applyRemote("奶茶", { w: "奶茶", at: 1 });
    N.addWord("外卖");
    N.clearRemote();
    expect(N.list().map((e) => e.w)).toEqual(["外卖"]);
  });

  it("imports a backup without overwriting what is there", () => {
    N.addWord("外卖", { en: "mine" });
    N.importEntries([{ w: "外卖", en: "theirs", py: "wài mài" }, { w: "奶茶", en: "milk tea", py: "nǎichá" }]);
    expect(N.getWord("外卖")).toMatchObject({ en: "mine", py: "wài mài" });
    expect(N.getWord("奶茶").en).toBe("milk tea");
    N.importEntries(undefined);
  });
});
