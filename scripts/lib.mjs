// Shared helpers for the data scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "src/data");
export const BOOKS_DIR = path.join(DATA_DIR, "books");
const require = createRequire(path.join(ROOT, "package.json"));

export const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const writeJSON = (p, v, pretty = true) =>
  fs.writeFileSync(p, (pretty ? JSON.stringify(v, null, 2) : JSON.stringify(v)) + "\n");

export const isHanzi = (ch) => /\p{Script=Han}/u.test(ch);

export function loadBooks() {
  return fs.readdirSync(BOOKS_DIR).filter(d => fs.existsSync(path.join(BOOKS_DIR, d, "book.json")))
    .map(d => ({ dir: d, ...readJSON(path.join(BOOKS_DIR, d, "book.json")) }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

// Lessons of one book (or of all books), each with its file name and book id.
export function loadLessons(bookId) {
  return loadBooks().filter(b => !bookId || b.id === bookId).flatMap(b => {
    const dir = path.join(BOOKS_DIR, b.dir);
    return fs.readdirSync(dir).filter(f => /^lesson\d+\.json$/.test(f)).sort()
      .map(f => ({ file: `${b.dir}/${f}`, book: b.id, ...readJSON(path.join(dir, f)) }));
  });
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
