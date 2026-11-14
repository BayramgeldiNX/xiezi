// Writes src/data/exam-exclude.json from the teachers' audits (docs/test-audit/<book>.json):
// what the tests must not use, and words that must never be options of the same question.
//
//   node scripts/tools/gen-exam-exclude.mjs
//
// Per book: { exclude: ["fill:<word>", "order:<sentence>", "sentence:<sentence>"], near: [[wordA, wordB], …] }.
// An exclusion names one kind of question only; the sentence stays in the app and in the other kinds.
import fs from "node:fs";
import path from "node:path";
import { ROOT, DATA_DIR, loadLessons, readJSON, writeJSON } from "../lib.mjs";

const AUDIT = path.join(ROOT, "docs/test-audit");
const strip = (hz) => hz.replace(/[AB]: /g, ""); // as lessonSentences does
const out = {};
let problems = 0;

const round2 = readJSON(path.join(AUDIT, "round2-excludes.json")).books; // from the sample papers, already as test ids

for (const file of fs.readdirSync(AUDIT).filter((f) => /^[a-z0-9-]+.json$/.test(f) && !/^(decisions|round2-)/.test(f)).sort()) {
  const book = file.replace(".json", "");
  const lessons = new Map(loadLessons(book).map((l) => [l.n, l]));
  const exclude = new Set(), near = new Map();
  const wordOf = (id) => /^[^/]+\/(\d+):(.+)$/.exec(id || "");
  const pair = (a, b) => { if (a && b && a !== b) near.set([a, b].sort().join("|"), [a, b].sort()); };

  for (const f of readJSON(path.join(AUDIT, file))) {
    if (f.verdict === "near" || (f.verdict === "exclude" && f.kind === "word")) {
      // Same meaning, or the same sound: fine as questions, but never options together.
      const a = wordOf(f.id)?.[2];
      for (const w of f.with || []) pair(a, wordOf(w)?.[2] ?? w);
      if (!a || !(f.with || []).length) { console.error("near without a pair:", f.id); problems++; }
    } else if (f.verdict === "exclude" && f.kind === "example") {
      const m = wordOf(f.id), w = m && lessons.get(+m[1])?.words.find((x) => x.w === m[2]);
      if (!w?.ex?.hz) { console.error("no such example:", f.id); problems++; continue; }
      const fill = /fill/i.test(f.reason), order = /build|order/i.test(f.reason), listen = /listen/i.test(f.reason);
      const all = !fill && !order && !listen;
      if (fill || all) exclude.add("fill:" + w.w);
      if (order || all) exclude.add("order:" + strip(w.ex.hz));
      if (listen || all) exclude.add("sentence:" + strip(w.ex.hz));
    } else if (f.verdict === "exclude" && f.kind === "line") {
      const m = /^[^/]+\/(\d+)\/(\w+)#L(\d+)$/.exec(f.id), line = m && lessons.get(+m[1])?.readings?.find((r) => r.id === m[2])?.lines[+m[3]];
      if (!line) { console.error("no such line:", f.id); problems++; continue; }
      exclude.add("order:" + line.hz);
    } else if (f.verdict !== "fix") { console.error("not understood:", f.id, f.kind, f.verdict); problems++; }
  }
  for (const x of round2[book] || []) exclude.add(x.id);
  out[book] = { exclude: [...exclude].sort(), near: [...near.values()].sort((a, b) => a.join().localeCompare(b.join())) };
  console.log(book, out[book].exclude.length, "exclusions,", out[book].near.length, "pairs");
}
writeJSON(path.join(DATA_DIR, "exam-exclude.json"), out);
process.exit(problems ? 1 : 0);
