// The progress keys each skill of a lesson asks for, built from the same helpers the modes use.
// Public lesson data only (no private readings), so the % is the same signed in or out.
import { CHARS, CHARINFO, grammarOf, lessonChars } from "../data/index.js";
import { syllables } from "./pinyin.js";
import { modeAvailable, lessonSentences } from "../views/practice.js";
import { workbookOf } from "../views/workbook.js";
import { buildable } from "../views/reading.js";
import { isDone } from "../progress/completion.js";

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

// Each skill as parts: the items one exercise (or a few that share a key) covers.
// part: { name, modes (exercise ids that record these items; none = the stroke-order page itself),
//         items, labels? (what to show for each item, same order) }
export function lessonParts(L) {
  const words = L.words, readings = L.readings || [];
  const chars = lessonChars(L);
  const withEx = words.filter((w) => w.ex?.hz);
  const sentences = buildable(lessonSentences(words, readings));
  const fill = words.filter((w) => w.ex?.hz?.includes(w.w));
  const radChars = modeAvailable("radical", L) ? chars.filter((c) => CHARINFO[c]?.radical?.c && CHARINFO[c].radical.c !== c) : [];
  const texts = readings.filter((r) => r.questions?.length);
  const tones = toneChars(words);
  const wb = workbookOf([L]);
  const hz = words.map((w) => w.w);
  const part = (name, modes, items, labels) => ({ name, modes, items, labels });
  const parts = {
    write: [
      part("Write the characters", [], chars.map((c) => "w:" + c), chars),
      part("Dictation", ["dict", "pinyin", "meaning"], hz.map((w) => "d:" + w), hz),
    ],
    listen: [
      part("Hear the word", ["hear"], hz.map((w) => "l:" + w), hz),
      part("Sentences", ["sentence"], withEx.map((w) => "ls:" + w.w), withEx.map((w) => w.w)),
      part("Tones", ["tones"], tones.map((c) => "t:" + c), tones),
    ],
    speak: [
      part("Say the word", ["say-word"], hz.map((w) => "s:" + w), hz),
      part("Say the sentence", ["say-sentence"], withEx.map((w) => "s:" + w.w + "#ex"), withEx.map((w) => w.w)),
    ],
    read: [
      // A text counts when its own quiz was passed (r:), or when every question of it has been
      // answered right in the general "Read & answer" (rq:, one key per question, see textQuiz).
      part("Read & answer", ["text-quiz"], texts.map((r) => {
        const key = L.id + "/" + r.id;
        return ["r:" + key, r.questions.map((_, i) => "rq:" + key + "#" + i)];
      }), texts.map((r) => r.title)),
      part("Build the sentence", ["order"], sentences.map((s) => "o:" + s.hz)),
      part("How do you read it?", ["read-pinyin"], hz.map((w) => "rp:" + w), hz),
    ],
    words: [
      part("Flashcards or Word quiz", ["cards", "match", "word-quiz"], hz.map((w) => ["f:" + w, "q:" + w]), hz),
      part("Which radical?", ["radical"], radChars.map((c) => "rad:" + c), radChars),
    ],
    exercises: [
      part("Grammar", ["gr-fill"], grammarOf([L]).map((d) => "g:" + d.id)),
      ...[["dialog", "Dialogues"], ["judge", "True or false"], ["reply", "Pick the reply"]].map(([kind, name]) =>
        part(name, ["wb-" + kind], wb.filter((d) => d.kind === kind).map((d) => "wb:" + d.id))),
      part("Fill in the word", ["fill"], fill.length >= 2 ? fill.map((w) => "wf:" + w.w) : [], fill.map((w) => w.w)),
    ],
  };
  for (const k in parts) parts[k] = parts[k].filter((p) => p.items.length);
  return parts;
}

export const lessonItems = (L) =>
  Object.fromEntries(Object.entries(lessonParts(L)).map(([k, ps]) => [k, ps.flatMap((p) => p.items)]));

// What is still open: { write: [{ name, modes, total, left, labels (of the open items) }], … }
export const lessonLeft = (L, get) =>
  Object.fromEntries(Object.entries(lessonParts(L)).map(([k, ps]) => [k, ps.map((p) => {
    const open = p.items.map((it, i) => (isDone(it, get) ? -1 : i)).filter((i) => i >= 0);
    return { name: p.name, modes: p.modes, total: p.items.length, left: open.length, labels: p.labels ? open.map((i) => p.labels[i]) : [] };
  })]));
