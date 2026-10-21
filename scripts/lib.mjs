// Shared helpers for the data scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "src/data");
export const LESSON_DIR = path.join(DATA_DIR, "lessons");
const require = createRequire(path.join(ROOT, "package.json"));

export const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const writeJSON = (p, v, pretty = true) =>
  fs.writeFileSync(p, (pretty ? JSON.stringify(v, null, 2) : JSON.stringify(v)) + "\n");

export const isHanzi = (ch) => /\p{Script=Han}/u.test(ch);

export function loadLessons() {
  return fs.readdirSync(LESSON_DIR).filter(f => /^lesson\d+\.json$/.test(f)).sort()
    .map(f => ({ file: f, ...readJSON(path.join(LESSON_DIR, f)) }));
}

// Every character a learner writes: the characters of each lesson word.
export function lessonChars(lessons) {
  const set = new Set();
  for (const l of lessons) for (const w of l.words) for (const c of w.w) if (isHanzi(c)) set.add(c);
  return [...set];
}

export function strokeData(c) {
  try {
    const d = require(`hanzi-writer-data/${c}.json`);
    return { strokes: d.strokes, medians: d.medians, radStrokes: d.radStrokes ?? null };
  } catch {
    return null;
  }
}
