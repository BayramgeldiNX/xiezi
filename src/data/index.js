// All course data. Each book is a folder src/data/books/<id>/ with book.json and lessonNN.json files
// (see README). LESSONS is every lesson of every book, in book order.
import CHARS from "./chars.json";
import STROKE_NAMES from "./stroke-names.json";
import STROKE_DATA from "./strokes.gen.json";
import TONE_SETS from "./tone-sets.json";

const bookFiles = import.meta.glob("./books/*/book.json", { eager: true, import: "default" });
const lessonFiles = import.meta.glob("./books/*/lesson*.json", { eager: true, import: "default" });

export const BOOKS = Object.values(bookFiles)
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  .map((b) => ({
    ...b,
    lessons: Object.keys(lessonFiles)
      .filter((k) => k.startsWith(`./books/${b.id}/`))
      .sort()
      .map((k) => ({ ...lessonFiles[k], book: b.id, id: `${b.id}/${lessonFiles[k].n}` })),
  }));

export const LESSONS = BOOKS.flatMap((b) => b.lessons);
export const bookOf = (lesson) => BOOKS.find((b) => b.id === lesson.book);
export const lessonIndex = (id) => LESSONS.findIndex((l) => l.id === id);

export { CHARS, STROKE_NAMES, STROKE_DATA, TONE_SETS };

export const wordChars = (w) => [...new Set(w.w)].filter((c) => STROKE_DATA[c]);
export const lessonChars = (lesson) => [...new Set(lesson.words.flatMap(wordChars))];

// Every word of the given lessons, each tagged with its lesson (a word can appear in several lessons;
// the first one wins).
export function wordsOf(lessons) {
  const seen = new Set(), out = [];
  for (const l of lessons) for (const w of l.words) {
    if (seen.has(w.w)) continue;
    seen.add(w.w);
    out.push({ ...w, lesson: l.id });
  }
  return out;
}
