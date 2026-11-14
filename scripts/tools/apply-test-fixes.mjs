// Applies the teachers' accepted fixes (docs/test-audit/<book>.json, verdict "fix") to the lesson files.
// Safe to run again: it sets fields to fixed values. Run it after any re-import of a book
// (scripts/import-book.mjs), because the book sources in data-src/ do not carry these fixes.
//
//   node scripts/tools/apply-test-fixes.mjs [--check]     --check only reports what would change
//
// Fixes touch grammar drills, workbook dialogues, true-or-false items, replies and text questions.
// Words, example sentences and text lines are never changed (progress keys depend on them).
import fs from "node:fs";
import path from "node:path";
import { ROOT, BOOKS_DIR, readJSON, writeJSON } from "../lib.mjs";

const check = process.argv.includes("--check");
const AUDIT = path.join(ROOT, "docs/test-audit");
const decisions = readJSON(path.join(AUDIT, "decisions.json"));
const ALLOWED = {
  grammar: ["q", "options", "answer"], dialog: ["q", "options", "answer"], judge: ["text", "claim", "ok"],
  reply: ["q", "a"], textq: ["q", "options", "answer"],
};

// The object a finding's id names, inside its lesson.
function target(L, kind, rest) {
  let m;
  if (kind === "grammar" && (m = /^(\d+)\.(\d+)$/.exec(rest))) return L.grammar?.[m[1] - 1]?.drills?.[m[2] - 1];
  if (kind === "dialog" && (m = /^d(\d+)$/.exec(rest))) return L.workbook?.dialogs?.[m[1] - 1];
  if (kind === "judge" && (m = /^j(\d+)$/.exec(rest))) return L.workbook?.judge?.[m[1] - 1];
  if (kind === "reply" && (m = /^r(\d+)$/.exec(rest))) return L.workbook?.replies?.[m[1] - 1];
  if (kind === "textq" && (m = /^(\w+)#(\d+)$/.exec(rest))) return L.readings?.find((r) => r.id === m[1])?.questions?.[+m[2]];
  return null;
}

let changed = 0, bad = 0;
for (const file of fs.readdirSync(AUDIT).filter((f) => f.endsWith(".json") && f !== "decisions.json")) {
  const book = file.replace(".json", "");
  const lessons = {};
  const lesson = (n) => (lessons[n] ||= { file: path.join(BOOKS_DIR, book, `lesson${String(n).padStart(2, "0")}.json`), dirty: false });
  for (const f of readJSON(path.join(AUDIT, file)).filter((x) => x.verdict === "fix")) {
    const m = /^(.+)\/(\d+)\/(.+)$/.exec(f.id);
    const fix = decisions.override[f.id] || f.fix;
    const slot = m && m[1] === book && lesson(+m[2]);
    if (slot) slot.data ||= readJSON(slot.file);
    const t = slot && target(slot.data, f.kind, m[3]);
    const keys = Object.keys(fix || {});
    if (!t || !keys.length || keys.some((k) => !ALLOWED[f.kind].includes(k))) { console.error("cannot apply", f.id, f.kind, JSON.stringify(fix)); bad++; continue; }
    if (fix.options && (fix.answer == null || new Set(fix.options).size !== fix.options.length || !fix.options[fix.answer])) { console.error("bad options", f.id); bad++; continue; }
    for (const k of keys) if (JSON.stringify(t[k]) !== JSON.stringify(fix[k])) {
      if (check) console.log(f.id, k, JSON.stringify(t[k]), "→", JSON.stringify(fix[k]));
      t[k] = fix[k]; slot.dirty = true; changed++;
    }
  }
  if (!check) for (const s of Object.values(lessons)) if (s.dirty) writeJSON(s.file, s.data);
}
console.log(`${check ? "would change" : "changed"} ${changed} field${changed === 1 ? "" : "s"}${bad ? `, ${bad} could not be applied` : ""}`);
process.exit(bad ? 1 : 0);
