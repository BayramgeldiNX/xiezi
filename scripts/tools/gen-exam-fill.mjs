// Writes src/data/exam-fill.json from the teachers' files docs/test-audit/fill-<book>.json:
// for each "fill in the word" sentence a test may use, the three wrong options a teacher chose.
//
//   node scripts/tools/gen-exam-fill.mjs
//
// { "<book>": { "<word>": ["wrong1", "wrong2", "wrong3"] } }. A word without an entry is not asked as fill-in.
// A word taught in several lessons with different sentences may have one set per lesson instead:
// { "<word>": { "<lesson number>": [three], … } } (the teacher writes the key as "<word>#<lesson>").
// An entry is dropped (and reported) when an option is not a word the learner knows by that lesson.
import fs from "node:fs";
import path from "node:path";
import { ROOT, DATA_DIR, loadLessons, readJSON, writeJSON } from "../lib.mjs";

const AUDIT = path.join(ROOT, "docs/test-audit");
const PRIOR = { hsk2: ["hsk1"] }; // as in src/exam/plan.js
const out = {};
let dropped = 0;

for (const file of fs.readdirSync(AUDIT).filter((f) => /^fill-.+\.json$/.test(f)).sort()) {
  const book = file.slice(5, -5);
  const lessonOf = new Map(); // word → the first lesson that teaches it (0: an earlier book)
  for (const p of PRIOR[book] || []) for (const l of loadLessons(p)) for (const w of l.words) lessonOf.set(w.w, 0);
  const own = new Map();
  for (const l of loadLessons(book)) for (const w of l.words) { if (!lessonOf.has(w.w)) lessonOf.set(w.w, l.n); if (!own.has(w.w)) own.set(w.w, l.n); }
  const map = {};
  let nulls = 0;
  const inLesson = (w, n) => loadLessons(book).find((l) => l.n === n)?.words.some((x) => x.w === w);
  for (const [key, opts] of Object.entries(readJSON(path.join(AUDIT, file)))) {
    if (opts === null) { nulls++; continue; }
    const [word, n] = key.split("#");
    const at = n ? (inLesson(word, +n) ? +n : 0) : own.get(word);
    const why = !at ? "not a word of the book"
      : !Array.isArray(opts) || opts.length !== 3 || new Set([word, ...opts]).size !== 4 ? "needs three different wrong options"
      : opts.find((o) => !lessonOf.has(o)) ? "unknown word " + opts.find((o) => !lessonOf.has(o))
      : opts.find((o) => lessonOf.get(o) > at) ? "taught later: " + opts.find((o) => lessonOf.get(o) > at)
      : "";
    if (why) { console.error(`${book} ${key}: ${why}`); dropped++; continue; }
    if (n) (map[word] ||= {})[n] = opts; else map[word] = opts;
  }
  out[book] = map;
  console.log(book, Object.keys(map).length, "fill items,", nulls, "left out by the teacher");
}
writeJSON(path.join(DATA_DIR, "exam-fill.json"), out);
if (dropped) console.log(dropped, "entries dropped");
