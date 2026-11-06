// The progress keys each skill of a lesson asks for, built from the same helpers the modes use.
// Public lesson data only (no private readings), so the % is the same signed in or out.
import { CHARS, CHARINFO, grammarOf, lessonChars } from "../data/index.js";
import { syllables } from "./pinyin.js";
import { modeAvailable, lessonSentences } from "../views/practice.js";
import { workbookOf } from "../views/workbook.js";
import { buildable } from "../views/reading.js";

// Characters the Tones mode asks about (tones 1–4 only, as in tones.js).
function toneChars(words) {
  const seen = new Set();
  for (const w of words) for (const c of w.w) {
    const py = CHARS[c]?.py;
    if (!py || seen.has(c)) continue;
    const tone = syllables(py)[0][1];
    if (tone >= 1 && tone <= 4) seen.add(c);
  }
  return [...seen];
}

export function lessonItems(L) {
  const words = L.words, readings = L.readings || [];
  const chars = lessonChars(L);
  const withEx = words.filter((w) => w.ex?.hz);
  const sentences = buildable(lessonSentences(words, readings));
  const fill = words.filter((w) => w.ex?.hz?.includes(w.w));
  const radChars = chars.filter((c) => CHARINFO[c]?.radical?.c && CHARINFO[c].radical.c !== c);
  return {
    write: [...chars.map((c) => "w:" + c), ...words.map((w) => "d:" + w.w)],
    listen: [...words.map((w) => "l:" + w.w), ...withEx.map((w) => "ls:" + w.w), ...toneChars(words).map((c) => "t:" + c)],
    speak: [...words.map((w) => "s:" + w.w), ...withEx.map((w) => "s:" + w.w + "#ex")],
    read: [
      ...readings.filter((r) => r.questions?.length).map((r) => "r:" + L.id + "/" + r.id),
      ...sentences.map((s) => "o:" + s.hz),
      ...words.map((w) => "rp:" + w.w),
    ],
    words: [
      ...words.map((w) => ["f:" + w.w, "q:" + w.w]),
      ...(modeAvailable("radical", L) ? radChars.map((c) => "rad:" + c) : []),
    ],
    exercises: [
      ...grammarOf([L]).map((d) => "g:" + d.id),
      ...workbookOf([L]).map((d) => "wb:" + d.id),
      ...(fill.length >= 2 ? fill.map((w) => "wf:" + w.w) : []),
    ],
  };
}
