// Validates lessons, chars.json, stroke names and stroke data against each other.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { DATA_DIR, loadBooks, loadLessons, lessonChars, readJSON } from "./lib.mjs";

export function checkData() {
  const lessons = loadLessons();
  const chars = readJSON(path.join(DATA_DIR, "chars.json"));
  const names = readJSON(path.join(DATA_DIR, "stroke-names.json"));
  const strokesFile = path.join(DATA_DIR, "strokes.gen.json");
  const strokes = fs.existsSync(strokesFile) ? readJSON(strokesFile) : {};
  const problems = [];
  const books = loadBooks();
  const ids = new Set();
  for (const b of books) {
    for (const k of ["id", "title"]) if (!b[k]) problems.push(`books/${b.dir}/book.json: missing "${k}"`);
    if (b.id !== b.dir) problems.push(`books/${b.dir}/book.json: id "${b.id}" must match its folder name`);
    if (ids.has(b.id)) problems.push(`book id ${b.id} used twice`);
    ids.add(b.id);
  }

  const perBook = {};
  lessons.forEach((l) => {
    const expect = (perBook[l.book] = (perBook[l.book] || 0) + 1);
    if (l.n !== expect) problems.push(`${l.file}: lesson number ${l.n}, expected ${expect}`);
    for (const k of ["cn", "title"]) if (!l[k]) problems.push(`${l.file}: missing "${k}"`);
    const seen = new Set();
    for (const w of l.words || []) {
      if (seen.has(w.w)) problems.push(`${l.file}: word ${w.w} appears twice`);
      seen.add(w.w);
      for (const k of ["w", "py", "en"]) if (!w[k]) problems.push(`${l.file}: word ${w.w || "?"} missing "${k}"`);
      if (!w.ex?.hz || !w.ex?.py || !w.ex?.en) problems.push(`${l.file}: word ${w.w} needs ex.hz, ex.py, ex.en`);
    }
  });

  // Reading texts: every Chinese character must have a meaning to show when tapped,
  // and every question a valid answer.
  const glossary = readJSON(path.join(DATA_DIR, "glossary.json"));
  const known = new Set([...Object.keys(chars), ...Object.keys(glossary).flatMap((w) => [...w]), ...lessons.flatMap((l) => l.words.flatMap((w) => [...w.w]))]);
  for (const l of lessons) for (const r of l.readings || []) {
    for (const k of ["id", "title", "py", "en"]) if (!r[k]) problems.push(`${l.file}: reading ${r.id || "?"} missing "${k}"`);
    for (const line of r.lines || []) {
      for (const k of ["hz", "py", "en"]) if (!line[k]) problems.push(`${l.file}: reading ${r.id} has a line missing "${k}"`);
      for (const ch of line.hz || "") if (/\p{Script=Han}/u.test(ch) && !known.has(ch)) problems.push(`${l.file}: reading ${r.id}: ${ch} has no meaning (add it to glossary.json)`);
    }
    for (const q of r.questions || []) if (!q.options?.[q.answer]) problems.push(`${l.file}: reading ${r.id}: question "${q.q}" has no valid answer`);
  }

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
  console.log(`Data check OK: ${books.length} book(s), ${lessons.length} lesson(s), ${lessonChars(lessons).length} characters.`);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(checkData() ? 0 : 1);
