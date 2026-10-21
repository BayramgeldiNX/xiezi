// Validates lessons, chars.json, stroke names and stroke data against each other.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { DATA_DIR, loadLessons, lessonChars, readJSON } from "./lib.mjs";

export function checkData() {
  const lessons = loadLessons();
  const chars = readJSON(path.join(DATA_DIR, "chars.json"));
  const names = readJSON(path.join(DATA_DIR, "stroke-names.json"));
  const strokesFile = path.join(DATA_DIR, "strokes.gen.json");
  const strokes = fs.existsSync(strokesFile) ? readJSON(strokesFile) : {};
  const problems = [];

  lessons.forEach((l, i) => {
    if (l.n !== i + 1) problems.push(`${l.file}: lesson number ${l.n}, expected ${i + 1}`);
    for (const k of ["cn", "title"]) if (!l[k]) problems.push(`${l.file}: missing "${k}"`);
    const seen = new Set();
    for (const w of l.words || []) {
      if (seen.has(w.w)) problems.push(`${l.file}: word ${w.w} appears twice`);
      seen.add(w.w);
      for (const k of ["w", "py", "en"]) if (!w[k]) problems.push(`${l.file}: word ${w.w || "?"} missing "${k}"`);
      if (!w.ex?.hz || !w.ex?.py || !w.ex?.en) problems.push(`${l.file}: word ${w.w} needs ex.hz, ex.py, ex.en`);
    }
  });

  for (const c of lessonChars(lessons)) {
    const info = chars[c];
    if (!info) { problems.push(`chars.json: no entry for ${c}`); continue; }
    for (const k of ["py", "en", "tip"]) if (!info[k]) problems.push(`chars.json: ${c} missing "${k}"`);
    const n = strokes[c]?.strokes.length;
    if (n == null) problems.push(`strokes.gen.json: no stroke data for ${c} (run npm run gen:data)`);
    else if (info.strokes.length !== n) problems.push(`chars.json: ${c} has ${info.strokes.length} stroke names but ${n} strokes`);
    const blank = info.strokes.filter((s) => s === "?").length;
    if (blank) problems.push(`chars.json: ${c} has ${blank} stroke name(s) still "?"`);
    for (const s of new Set(info.strokes)) if (s !== "?" && !names[s]) problems.push(`stroke-names.json: unknown stroke name ${s} (in ${c})`);
  }

  if (problems.length) {
    console.error(`Data check found ${problems.length} problem(s):\n  ` + problems.join("\n  "));
    return false;
  }
  console.log(`Data check OK: ${lessons.length} lesson(s), ${lessonChars(lessons).length} characters.`);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(checkData() ? 0 : 1);
