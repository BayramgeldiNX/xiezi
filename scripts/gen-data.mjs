// Builds src/data/strokes.gen.json (stroke shapes for every lesson character) and stroke-chars.gen.json (their list)
// from the hanzi-writer-data package, then checks that the hand-written data agrees.
import path from "node:path";
import { DATA_DIR, loadLessons, lessonChars, strokeData, writeJSON } from "./lib.mjs";
import { checkData } from "./check-data.mjs";
import { genCharInfo } from "./gen-charinfo.mjs";

const lessons = loadLessons();
const out = {};
const missing = [];
for (const c of lessonChars(lessons)) {
  const d = strokeData(c);
  if (d) out[c] = d; else missing.push(c);
}
writeJSON(path.join(DATA_DIR, "strokes.gen.json"), out, false);
console.log(`strokes.gen.json: ${Object.keys(out).length} characters`);
// Home only needs to know which characters have strokes, so this list stays in the main file while the shapes load later.
writeJSON(path.join(DATA_DIR, "stroke-chars.gen.json"), Object.keys(out), false);
if (missing.length) {
  console.error(`No stroke data for: ${missing.join(" ")}`);
  process.exit(1);
}
genCharInfo();
if (!checkData()) process.exit(1);
