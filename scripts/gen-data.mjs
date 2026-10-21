// Builds src/data/strokes.gen.json (stroke shapes for every lesson character)
// from the hanzi-writer-data package, then checks that the hand-written data agrees.
import path from "node:path";
import { DATA_DIR, loadLessons, lessonChars, strokeData, writeJSON } from "./lib.mjs";
import { checkData } from "./check-data.mjs";

const lessons = loadLessons();
const out = {};
const missing = [];
for (const c of lessonChars(lessons)) {
  const d = strokeData(c);
  if (d) out[c] = d; else missing.push(c);
}
writeJSON(path.join(DATA_DIR, "strokes.gen.json"), out, false);
console.log(`strokes.gen.json: ${Object.keys(out).length} characters`);
if (missing.length) {
  console.error(`No stroke data for: ${missing.join(" ")}`);
  process.exit(1);
}
if (!checkData()) process.exit(1);
