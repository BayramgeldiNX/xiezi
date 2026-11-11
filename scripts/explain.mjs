// Explanations for choice questions: why the right answer is right, and why each wrong option is wrong.
//   node scripts/explain.mjs skeleton   adds new questions to src/data/explain/<book>-<part>.json (keeps what is written)
//   node scripts/explain.mjs build      checks the files and writes src/data/explain.gen.json (key → { why, not })
// Parts: "grammar" (fill the blank) and "comprehension" (reading questions, workbook dialogs and true/false).
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, loadBooks, loadLessons, readJSON, writeJSON } from "./lib.mjs";
import { keyOf } from "../src/lib/explain-key.js";

const DIR = path.join(DATA_DIR, "explain");

// Every question with what a writer needs to explain it.
export function questions() {
  const out = [];
  for (const b of loadBooks()) for (const l of loadLessons(b.id)) {
    const lesson = l.n;
    (l.grammar || []).forEach((g) => g.drills.forEach((d) => out.push({ book: b.id, part: "grammar", key: keyOf.grammar(d), type: "grammar", lesson,
      q: d.q, options: d.options, answer: d.options[d.answer], context: { point: g.point, rule: g.en, en: d.en } })));
    (l.readings || []).forEach((r) => (r.questions || []).forEach((q) => out.push({ book: b.id, part: "comprehension", key: keyOf.reading(q), type: "reading", lesson,
      q: q.q, options: q.options, answer: q.options[q.answer], context: { title: r.title, lines: r.lines.map((x) => `${x.who ? x.who + "：" : ""}${x.hz}${x.en ? "  (" + x.en + ")" : ""}`) } })));
    const wb = l.workbook || {};
    (wb.dialogs || []).forEach((d) => out.push({ book: b.id, part: "comprehension", key: keyOf.dialog(d), type: "dialog", lesson,
      q: d.q, options: d.options, answer: d.options[d.answer], context: { lines: d.lines.map(([who, t]) => `${who}：${t}`) } }));
    (wb.judge || []).forEach((d) => out.push({ book: b.id, part: "comprehension", key: keyOf.judge(d), type: "judge", lesson,
      q: d.claim, options: ["对", "错"], answer: d.ok ? "对" : "错", context: { text: d.text } }));
  }
  return out;
}

const fileOf = (book, part) => path.join(DIR, `${book}-${part}.json`);
const read = (f) => (fs.existsSync(f) ? readJSON(f) : []);

function skeleton() {
  fs.mkdirSync(DIR, { recursive: true });
  const groups = Map.groupBy(questions(), (q) => `${q.book}|${q.part}`);
  for (const [g, qs] of groups) {
    const [book, part] = g.split("|");
    const f = fileOf(book, part);
    const old = new Map(read(f).map((e) => [e.key, e]));
    const seen = new Set();
    const entries = [];
    for (const { book: _b, part: _p, ...q } of qs) {
      if (seen.has(q.key)) continue; // the same question twice: one explanation
      seen.add(q.key);
      const o = old.get(q.key);
      entries.push({ ...q, why: o?.why || "", not: o?.not || {}, ...(o?.flag ? { flag: o.flag } : {}) });
    }
    writeJSON(f, entries);
    console.log(`${path.basename(f)}: ${entries.length} questions, ${entries.filter((e) => !e.why).length} to write`);
  }
}

// Problems in the written files: empty, too long, a wrong option without a reason, a reason for an option that does not exist.
export function problems() {
  const out = [];
  const keys = new Set(questions().map((q) => q.key));
  for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")) : []) {
    for (const e of read(path.join(DIR, f))) {
      const at = `${f} ${e.key} (${e.q})`;
      if (!keys.has(e.key)) { out.push(`${at}: no such question (run skeleton)`); continue; }
      if (!e.why?.trim()) { out.push(`${at}: no why`); continue; }
      if (e.type === "judge") continue; // true / false: "why" says it all
      for (const o of e.options) if (o !== e.answer && !e.not?.[o]?.trim()) out.push(`${at}: no reason for "${o}"`);
      for (const o of Object.keys(e.not || {})) if (!e.options.includes(o) || o === e.answer) out.push(`${at}: reason for "${o}", which is not a wrong option`);
    }
  }
  return out;
}

function build() {
  const out = {};
  for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort() : []) {
    for (const e of read(path.join(DIR, f))) if (e.why?.trim()) out[e.key] = e.type === "judge" || !Object.keys(e.not || {}).length ? { why: e.why } : { why: e.why, not: e.not };
  }
  writeJSON(path.join(DATA_DIR, "explain.gen.json"), out, false);
  const p = problems();
  console.log(`explain.gen.json: ${Object.keys(out).length} explanations, ${p.length} problems`);
  for (const x of p.slice(0, 30)) console.log("  " + x);
}

if (process.argv[1]?.endsWith("explain.mjs")) {
  const cmd = process.argv[2];
  if (cmd === "skeleton") skeleton();
  else if (cmd === "build") build();
  else console.log("usage: node scripts/explain.mjs skeleton | build");
}
