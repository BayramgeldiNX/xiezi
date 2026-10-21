// All lesson data. A new lesson is a new src/data/lessons/lessonNN.json file (see README).
import CHARS from "./chars.json";
import STROKE_NAMES from "./stroke-names.json";
import STROKE_DATA from "./strokes.gen.json";
import TONE_SETS from "./tone-sets.json";

const files = import.meta.glob("./lessons/lesson*.json", { eager: true, import: "default" });
export const LESSONS = Object.keys(files).sort().map((k) => files[k]);

export { CHARS, STROKE_NAMES, STROKE_DATA, TONE_SETS };

export const wordChars = (w) => [...new Set(w.w)].filter((c) => STROKE_DATA[c]);
export const lessonChars = (lesson) => [...new Set(lesson.words.flatMap(wordChars))];
