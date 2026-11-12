// Lesson exercises: what each exercise of a lesson asks about, and the progress keys it records.
// The one place that knows this. Lesson %, the "what's open" list and the lesson's exercises all ask here,
// so they cannot drift apart. Pure: no DOM, no views. Words and terms: see GLOSSARY.md.
//
//   exerciseItems(id, L, texts?)  → [{ of, item, label }]   what exercise `id` asks in lesson L
//   lessonParts(L)                → { skill: [{ name, exercises, items, labels? }] }
//   lessonItems(L), lessonLeft(L, get)                       lesson % and what is still open
//   available(id, L)              → can exercise `id` run in lesson L?
//
// `of` is what the exercise shows (a word, character, sentence, text question or workbook task);
// `item` is its completion item (a key, or keys: see completion.js); `label` names it in the open list.
// texts: the lesson's texts. Lesson % counts the public ones only (the default), so it is the same
// signed in or out.
import { CHARS, CHARINFO, DICT, grammarOf, lessonChars, workbookOf } from "../data/index.js";
import { syllables, stripTone } from "../lib/pinyin.js";
import { makeSegmenter } from "../lib/segment.js";
import { isDone } from "./completion.js";

/* ---------- Helpers the exercises share (also used by the book Review) ---------- */
const sentenceItems = (words) => words.filter((w) => w.ex?.hz);
// Two words can share one example sentence; the Sentences quiz asks it once (as the first word).
export const uniqueSentences = (words) => sentenceItems(words).filter((w, i, a) => a.findIndex((x) => x.ex.hz === w.ex.hz) === i);
// Example sentences (without A:/B:) and text lines, each once.
export const lessonSentences = (words, readings) => [
  ...sentenceItems(words).map((w) => ({ hz: w.ex.hz.replace(/[AB]: /g, ""), py: w.ex.py.replace(/[AB]: /g, ""), en: w.ex.en })),
  ...readings.flatMap((r) => r.lines),
].filter((s, i, a) => a.findIndex((x) => x.hz === s.hz) === i);
// Sentences that can be built: 3–8 words (punctuation is shown at the end, not placed).
let segment = null;
export const buildable = (sentences) => {
  segment ||= makeSegmenter(DICT);
  return sentences.map((s) => ({ ...s, parts: segment(s.hz).filter((p) => p.word).map((p) => p.t) }))
    .filter((s) => s.parts.length >= 3 && s.parts.length <= 8);
};

/* ---------- What each exercise asks ---------- */
const textKey = (L, r) => r.key || L.id + "/" + r.id;
const publicTexts = (L) => L.readings || [];
const words = (L) => L.words.map((w) => ({ ...w, lesson: L.id }));
const word = (prefix) => (w) => ({ of: w, item: prefix + w.w, label: w.w });

// Characters with tone 1–4 (neutral-tone characters like 们 are not asked).
function toneQuestions(L) {
  const seen = new Set(), qs = [];
  for (const w of L.words) for (const c of w.w) {
    const py = CHARS[c]?.py;
    if (!py || seen.has(c)) continue;
    const tone = syllables(py)[0][1];
    if (tone < 1 || tone > 4) continue;
    seen.add(c);
    qs.push({ say: c, plain: stripTone(py), tone, hz: c });
  }
  return qs;
}

// Characters whose radical is a separate part (not the character itself).
const radicalChars = (L) => lessonChars(L).filter((c) => CHARINFO[c]?.radical?.c && CHARINFO[c].radical.c !== c);
const WB = { "wb-dialog": "dialog", "wb-judge": "judge", "wb-reply": "reply" };

const EXERCISES = {
  strokes: (L) => lessonChars(L).map((c) => ({ of: c, item: "w:" + c, label: c })),
  dict: (L) => words(L).map(word("d:")),
  hear: (L) => words(L).map(word("l:")),
  sentence: (L) => uniqueSentences(words(L)).map(word("ls:")),
  tones: (L) => toneQuestions(L).map((q) => ({ of: q, item: "t:" + q.hz, label: q.hz })),
  "say-word": (L) => words(L).map(word("s:")),
  "say-sentence": (L) => sentenceItems(words(L)).map((w) => ({ of: w, item: "s:" + w.w + "#ex", label: w.w })),
  // One entry per question: done here (rq:) or when its text's own quiz was passed (r:).
  "text-quiz": (L, texts) => texts.flatMap((r) => (r.questions || []).map((q, i) => {
    const key = textKey(L, r);
    return { of: { r, q, i }, item: ["r:" + key, "rq:" + key + "#" + i], label: r.title };
  })),
  order: (L, texts) => buildable(lessonSentences(words(L), texts)).map((s) => ({ of: s, item: "o:" + s.hz })),
  "read-pinyin": (L) => words(L).map(word("rp:")),
  // Flashcards, Match and Word quiz count together.
  cards: (L) => words(L).map((w) => ({ of: w, item: ["f:" + w.w, "q:" + w.w], label: w.w })),
  radical: (L) => radicalChars(L).map((c) => ({ of: c, item: "rad:" + c, label: c })),
  "gr-fill": (L) => grammarOf([L]).map((d) => ({ of: d, item: "g:" + d.id })),
  ...Object.fromEntries(Object.entries(WB).map(([id, kind]) => [id,
    (L) => workbookOf([L]).filter((d) => d.kind === kind).map((d) => ({ of: d, item: "wb:" + d.id }))])),
  fill: (L) => words(L).filter((w) => w.ex?.hz?.includes(w.w)).map(word("wf:")),
};
// Exercises that ask the same items as another.
const SAME = { pinyin: "dict", meaning: "dict", match: "cards", "word-quiz": "cards" };

// What exercise `id` asks in lesson L. Exercises that record nothing (texts, notes, lists) ask nothing.
export function exerciseItems(id, L, texts = publicTexts(L)) {
  const f = EXERCISES[SAME[id] || id];
  return f ? f(L, texts) : [];
}

// The fewest items an exercise needs (choosing between words needs two); 1 for the rest.
const MIN = { hear: 2, sentence: 2, match: 2, "word-quiz": 2, fill: 2 };
const enough = (id, n) => n >= (MIN[id] || 1);
// Exercises that ask nothing but need lesson content to show.
const NEEDS = { hanzi: (L) => !!L.hanzi, pron: (L) => !!L.pron?.length };

// Can exercise `id` run in lesson L? An exercise without enough items is not offered and does not
// count toward lesson %. Texts, grammar notes and the word list always can.
export function available(id, L) {
  if (!L) return false;
  if (NEEDS[id]) return NEEDS[id](L);
  if (!EXERCISES[SAME[id] || id]) return true;
  return enough(id, exerciseItems(id, L).length);
}

/* ---------- Lesson % ---------- */
// Each skill as parts: the items one exercise (or a few that share them) asks, counted once.
// part: { name, exercises (ids; "strokes" is the stroke-order page), items, labels? }
const PARTS = {
  write: [["Write the characters", ["strokes"]], ["Dictation", ["dict", "pinyin", "meaning"]]],
  listen: [["Hear the word", ["hear"]], ["Sentences", ["sentence"]], ["Tones", ["tones"]]],
  speak: [["Say the word", ["say-word"]], ["Say the sentence", ["say-sentence"]]],
  read: [["Read & answer", ["text-quiz"]], ["Build the sentence", ["order"]], ["How do you read it?", ["read-pinyin"]]],
  words: [["Flashcards or Word quiz", ["cards", "match", "word-quiz"]], ["Which radical?", ["radical"]]],
  exercises: [["Grammar", ["gr-fill"]], ["Dialogues", ["wb-dialog"]], ["True or false", ["wb-judge"]], ["Pick the reply", ["wb-reply"]], ["Fill in the word", ["fill"]]],
};
// Parts without labels in the open list (their items have no short name).
const UNLABELLED = new Set(["order", "gr-fill", "wb-dialog", "wb-judge", "wb-reply"]);

// A text counts as one item: done when its own quiz was passed (r:), or when every question of it
// has been answered right in the general "Read & answer" (rq:).
function textItems(L) {
  const texts = publicTexts(L).filter((r) => r.questions?.length);
  return {
    items: texts.map((r) => { const key = textKey(L, r); return ["r:" + key, r.questions.map((_, i) => "rq:" + key + "#" + i)]; }),
    labels: texts.map((r) => r.title),
  };
}

// A part counts when at least one of its exercises can run (they share the same items).
function partOf(L, name, exercises) {
  const id = exercises[0];
  let entries = exerciseItems(id, L);
  if (!exercises.some((x) => enough(x, entries.length))) entries = [];
  if (id === "text-quiz") return { name, exercises, ...(entries.length ? textItems(L) : { items: [] }) };
  const part = { name, exercises, items: entries.map((e) => e.item) };
  if (!UNLABELLED.has(id)) part.labels = entries.map((e) => e.label);
  return part;
}

export function lessonParts(L) {
  const parts = {};
  for (const [skill, defs] of Object.entries(PARTS)) parts[skill] = defs.map(([name, ex]) => partOf(L, name, ex)).filter((p) => p.items.length);
  return parts;
}

export const lessonItems = (L) =>
  Object.fromEntries(Object.entries(lessonParts(L)).map(([k, ps]) => [k, ps.flatMap((p) => p.items)]));

// What is still open: { write: [{ name, exercises, total, left, labels (of the open items) }], … }
export const lessonLeft = (L, get) =>
  Object.fromEntries(Object.entries(lessonParts(L)).map(([k, ps]) => [k, ps.map((p) => {
    const open = p.items.map((it, i) => (isDone(it, get) ? -1 : i)).filter((i) => i >= 0);
    return { name: p.name, exercises: p.exercises, total: p.items.length, left: open.length, labels: p.labels ? open.map((i) => p.labels[i]) : [] };
  })]));
