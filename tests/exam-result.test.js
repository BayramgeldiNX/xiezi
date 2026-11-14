import { describe, it, expect } from "vitest";
const noop = () => {};
globalThis.document = { addEventListener: noop, dispatchEvent: noop, querySelector: () => null, documentElement: { dataset: {}, style: {} }, hidden: false };
globalThis.Event ??= class {};
globalThis.addEventListener ??= noop;
import { grade } from "../src/exam/grade.js";
import { readFileSync } from "node:fs";
const mod = await import("../src/views/exam-result.js");
const { recordsOf, commit, mistakesHtml } = mod;
const { reportHtml, clock } = await import("../src/views/exam-report.js");

const paper = () => ({
  parts: [
    { id: "listen", cn: "听力", en: "Listening", questions: [
      { n: 1, part: "listen", kind: "dialog", shape: "choice", key: "wb:a/d1", lesson: "b/1", audio: ["男：你好<b>", "你好吗？"], options: ["x", "y"], answer: 1 },
      { n: 2, part: "listen", kind: "hear", shape: "choice", key: "l:你", lesson: "b/1", audio: ["你"], options: ["a", "b"], answer: 0 },
    ] },
    { id: "write", cn: "书写", en: "Writing", questions: [
      { n: 3, part: "write", kind: "order", shape: "order", key: "o:s", lesson: "b/2", tiles: ["我", "好"], answer: ["我", "好"], tail: "。", en: "I am fine" },
      { n: 4, part: "write", kind: "hand", shape: "write", key: "wf:好", lesson: "b/2", word: "好", py: "hǎo", en: "good" },
    ] },
  ],
});
const A = { 1: 1, 2: 1, 3: ["好", "我"] }; // right, wrong, wrong; the write question is unanswered

describe("recordsOf", () => {
  it("one record per answered question, with its own key", () => {
    expect(recordsOf(paper(), A)).toEqual([{ key: "wb:a/d1", ok: true }, { key: "l:你", ok: false }, { key: "o:s", ok: false }]);
  });
  it("all three shapes, right answers", () => {
    expect(recordsOf(paper(), { 1: 1, 2: 0, 3: ["我", "好"], 4: true }).map((r) => r.ok)).toEqual([true, true, true, true]);
    expect(recordsOf(paper(), { 4: false })).toEqual([{ key: "wf:好", ok: false }]);
  });
  it("unanswered are left out", () => {
    expect(recordsOf(paper(), {})).toEqual([]);
    expect(recordsOf(paper(), { 3: [] })).toEqual([]);
  });
  it("a half-built sentence is not recorded, and is shown as no answer", () => {
    const p = paper(), P = { 3: ["我"] };
    expect(recordsOf(p, P)).toEqual([]);
    expect(mistakesHtml(p, P, grade(p, P))).toContain("no answer");
  });
});

describe("commit", () => {
  const book = { id: "b" }, test = { id: "s1", cn: "小测", en: "Quiz" };
  it("saves, records and adds a session once per paper", () => {
    const calls = { save: 0, rec: [], ses: [] }, p = paper();
    const io = { prior: () => null, save: () => { calls.save++; return { isBest: true }; }, record: (k, r, o) => calls.rec.push([k, r, o]), session: (s) => calls.ses.push(s) };
    const first = commit({ book, test, paper: p, answers: A, secs: 5 }, io);
    const second = commit({ book, test, paper: p, answers: A, secs: 5 }, io);
    expect(calls.save).toBe(1);
    expect(calls.rec.length).toBe(3);
    expect(calls.rec[0]).toEqual(["wb:a/d1", { ok: true, miss: 0 }, { quiet: true }]);
    expect(calls.rec[1][1]).toEqual({ ok: false, miss: 1 });
    expect(calls.ses).toHaveLength(1);
    expect(calls.ses[0]).toMatchObject({ type: "test", score: 1, total: 4 });
    expect(first.isBest).toBe(true);
    expect(second.again).toBe(true);
    expect(second.g).toBe(first.g);
  });
});

describe("commit again and again", () => {
  const book = { id: "b" }, test = { id: "s1", cn: "小测", en: "Quiz" };
  it("a new paper of the same test is saved again, the same paper is not; the saved result is returned", () => {
    let saves = 0, last = null;
    const io = { prior: () => null, save: (b, t, r) => { saves++; last = r; return { isBest: false }; }, record: () => {}, session: () => {} };
    const p1 = paper(), p2 = paper();
    const a = commit({ book, test, paper: p1, answers: A, secs: 1 }, io);
    commit({ book, test, paper: p1, answers: A, secs: 1 }, io);
    expect(saves).toBe(1);
    commit({ book, test, paper: p2, answers: A, secs: 1 }, io);
    expect(saves).toBe(2);
    expect(a.result).toBe(a.result);
    expect(commit({ book, test, paper: p1, answers: A, secs: 1 }, io).result.at).toBe(a.result.at);
    expect(last.total).toBe(commit({ book, test, paper: p2, answers: A, secs: 1 }, io).result.total);
  });
  it("a failing record does not stop the rest, and cannot lead to a second save", () => {
    const rec = [];
    let saves = 0;
    const io = { prior: () => null, save: () => { saves++; return {}; }, record: (k) => { rec.push(k); if (rec.length === 1) throw new Error("x"); }, session: () => { throw new Error("y"); } };
    const p = paper();
    expect(() => commit({ book, test, paper: p, answers: A, secs: 1 }, io)).not.toThrow();
    expect(rec).toHaveLength(3);
    commit({ book, test, paper: p, answers: A, secs: 1 }, io);
    expect(saves).toBe(1);
  });
});

describe("retry missed", () => {
  const src = readFileSync(new URL("../src/views/exam-result.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("function retry("), src.indexOf("/* ---------- The page"));
  it("records, saves and adds a session nothing", () => {
    expect(body).not.toMatch(/record|saveResult|addSession|io\.|progress\./);
  });
  it("checks answers by the paper's own rule", () => {
    const { retryOk } = mod;
    expect(retryOk({ shape: "choice", answer: 1 }, 1)).toBe(true);
    expect(retryOk({ shape: "choice", answer: 1 }, 0)).toBe(false);
    expect(retryOk({ shape: "order", answer: ["我", "好"] }, ["我", "好"])).toBe(true);
    expect(retryOk({ shape: "order", answer: ["我", "好"] }, ["好", "我"])).toBe(false);
  });
});

describe("mistakes", () => {
  it("shows speakers on separate lines without the tag, escapes text, and names unanswered", () => {
    const p = paper(), B = { 1: 0, 3: ["好", "我"] }, html = mistakesHtml(p, B, grade(p, B));
    expect(html).not.toContain("男：");
    expect(html).toContain("<p>男 你好&lt;b&gt;</p><p>女 你好吗？</p>");
    expect(html).toContain("not written correctly");
    expect(html).not.toContain("skipped");
    expect(html).toContain("我好。");
  });
});

describe("report and result agree", () => {
  it("a perfect paper has the same seal on the result and on the report", () => {
    const p = { parts: ["a", "b", "c", "d", "e"].map((id, i) => ({ id, questions: [{ n: i + 1, shape: "choice", lesson: "b/1", answer: 0 }] })) };
    const g = grade(p, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    const h = reportHtml({ book: { id: "b", title: "B" }, test: { id: "s1", kind: "small", cn: "a", en: "b" }, result: { total: g.total, parts: g.parts.map((x) => x.score), at: 0, secs: 1 } });
    expect(g.seal).toBe("满分");
    expect(g.total).toBe(500);
    expect(h).toContain(">" + g.seal + "<");
  });
  it("numbers from a malformed saved result render as 0 and a dash", () => {
    const h = reportHtml({ book: { id: "b", title: "B" }, test: { id: "s1", kind: "small", cn: "a", en: "b" }, result: { total: "abc", parts: [NaN, 999, -5, "x"], at: "nonsense", secs: {} } });
    expect(h).toContain("0 / 500");
    expect(h).toContain("100 / 100");
    expect(h).not.toContain("NaN");
    expect(h).toContain("—");
    expect(h).toContain("未通过");
  });
});

describe("reportHtml", () => {
  const book = { id: "b", title: "Book <1>" };
  const part = [90, 80, 70, 60, 50];
  const res = (total) => ({ total, parts: part, at: new Date(2026, 10, 13).getTime(), secs: 3725 });
  it("escapes, shows the date, the parts and the total", () => {
    const h = reportHtml({ book, test: { id: "s1", kind: "small", cn: "小测", en: "Quiz" }, result: res(350) });
    expect(h).toContain("Book &lt;1&gt;");
    expect(h).toContain("2026年11月13日");
    expect(h).toContain("13 November 2026");
    expect(h).toContain("1:02:05");
    expect(h).toContain("90 / 100");
    expect(h).toContain("350 / 500");
    expect(h).toContain("成绩单");
    expect(h).not.toContain("结业证书");
  });
  it("未通过 below 300, no seal", () => {
    const h = reportHtml({ book, test: { id: "s1", kind: "small", cn: "小测", en: "Quiz" }, result: res(299) });
    expect(h).toContain("未通过");
    expect(h).not.toContain("xr-seal");
  });
  it("the certificate only for a passed final", () => {
    const final = { id: "final", kind: "final", cn: "期末", en: "Final" };
    expect(reportHtml({ book, test: final, result: res(320) })).toContain("结业证书");
    expect(reportHtml({ book, test: final, result: res(320) })).toContain("has completed Book &lt;1&gt;");
    expect(reportHtml({ book, test: final, result: res(250) })).not.toContain("结业证书");
    expect(reportHtml({ book, test: { id: "mid1", kind: "mid", cn: "期中", en: "Mid" }, result: res(400) })).not.toContain("结业证书");
  });
  it("clock", () => { expect(clock(65)).toBe("01:05"); });
});
