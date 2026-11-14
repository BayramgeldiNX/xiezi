// Tests: where they sit in a book and how big they are. Pure: no DOM, no views. Terms: see GLOSSARY.md.
//
//   testsOf(book)      → every test of the book, in book-page order
//   testOf(book, id)   → one test ("s1"…, "mid1", "mid2", "final")
//
// A test: { id, kind: "small"|"mid"|"final", after, lessons, earlier, counts, total, minutes, cn, en }
//   after    the 1-based place of the lesson it follows;  lessons: the lesson objects it covers
//   earlier  (small tests only) lessons of the book before the first covered one
//   counts   { part: { kind: n } }, the question kinds are listed in KINDS

export const PARTS = [
  { id: "listen", cn: "听力", en: "Listening" },
  { id: "vocab", cn: "词汇", en: "Vocabulary" },
  { id: "grammar", cn: "语法", en: "Grammar" },
  { id: "read", cn: "阅读", en: "Reading" },
  { id: "write", cn: "书写", en: "Writing" },
];

// Books whose words count as already taught (HSK 2 follows HSK 1).
export const PRIOR = { hsk2: ["hsk1"] };

// Question kinds of each part, in paper order.
//   listen: hear a word / hear a sentence / hear a dialogue     vocab: meaning / pick the word / fill the gap
//   read: true or false / pick the reply / text question        write: build the sentence / write by hand
export const KINDS = {
  listen: ["hear", "sentence", "dialog"],
  vocab: ["meaning", "pick", "fill"],
  grammar: ["blank"],
  read: ["judge", "reply", "text"],
  write: ["order", "hand"],
};

// The one table of sizes: [small, mid, final of a 15-lesson book, final of a shorter book].
const SIZES = {
  listen: { hear: [3, 5, 10, 8], sentence: [3, 8, 12, 10], dialog: [6, 12, 23, 20] },
  vocab: { meaning: [4, 7, 12, 10], pick: [3, 6, 11, 10], fill: [3, 7, 12, 10] },
  grammar: { blank: [8, 15, 30, 25] },
  read: { judge: [4, 9, 15, 13], reply: [4, 8, 15, 12], text: [4, 8, 15, 12] },
  write: { order: [4, 7, 12, 10], hand: [4, 8, 13, 10] },
};
const MINUTES = { small: 30, mid: 60, final: [105, 90] };

function countsOf(kind, n) {
  const col = kind === "small" ? 0 : kind === "mid" ? 1 : n >= 15 ? 2 : 3;
  return Object.fromEntries(Object.entries(SIZES).map(([part, kinds]) =>
    [part, Object.fromEntries(Object.entries(kinds).map(([k, row]) => [k, row[col]]))]));
}

const NAMES = {
  small: (i) => ({ cn: `小测 ${i}`, en: `Small test ${i}` }),
  mid: (i) => ({ cn: `期中 ${i}`, en: `Mid-book test ${i}` }),
  final: () => ({ cn: "期末", en: "Final test" }),
};

function make(book, id, kind, after, from, num) {
  const n = book.lessons.length;
  const counts = countsOf(kind, n);
  const total = Object.values(counts).reduce((s, p) => s + Object.values(p).reduce((a, b) => a + b, 0), 0);
  const lessons = book.lessons.slice(from, after);
  return {
    id, kind, after, lessons,
    earlier: kind === "small" ? book.lessons.slice(0, from) : [],
    counts, total,
    minutes: kind === "final" ? MINUTES.final[n >= 15 ? 0 : 1] : MINUTES[kind],
    ...NAMES[kind](num),
  };
}

export function testsOf(book) {
  const n = book.lessons.length, h = Math.ceil(n / 2);
  const places = [];
  for (let p = 3; p < h - 1; p += 3) places.push(p);
  for (let p = h + 3; p < n; p += 3) places.push(p);
  const tests = places.map((p, i) => make(book, "s" + (i + 1), "small", p, p - 3, i + 1));
  tests.push(make(book, "mid1", "mid", h, 0, 1), make(book, "mid2", "mid", n, h, 2), make(book, "final", "final", n, 0, 1));
  const rank = (t) => t.after * 10 + (t.id === "final" ? 2 : t.kind === "mid" ? 1 : 0);
  return tests.sort((a, b) => rank(a) - rank(b));
}

export const testOf = (book, id) => testsOf(book).find((t) => t.id === id);
