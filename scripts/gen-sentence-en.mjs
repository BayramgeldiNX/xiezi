// English for the Chinese sentences shown in quizzes and tests (the English switch).
// Sentences that already have English in the lesson data (words' examples, readings, drills) are
// collected automatically; the rest are hand-translated in src/data/sentence-en/*.json ({ "汉字": "English" }).
//   node scripts/gen-sentence-en.mjs            → writes src/data/sentence-en.gen.json
//   node scripts/gen-sentence-en.mjs --todo N   → writes the untranslated ones to src/data/sentence-en/todo-1..N.json
import fs from "fs";
import path from "path";

const HAN = /\p{Script=Han}/u;
const ROOT = "src/data/books";
const SRC = "src/data/sentence-en";
export const norm = (s) => s.replace(/^[AB男女]\s*[:：]\s*/, "").replace(/\s+/g, "").trim();

const known = new Map(), all = new Set(), words = new Set();
function walk(v) {
  if (typeof v === "string") { if (HAN.test(v)) all.add(v); return; }
  if (Array.isArray(v)) return v.forEach(walk);
  if (v && typeof v === "object") {
    const hz = v.hz ?? v.q;
    if (typeof hz === "string" && typeof v.en === "string" && HAN.test(hz) && !/[A-Za-z]|___/.test(hz)) known.set(norm(hz), v.en);
    for (const k in v) walk(v[k]);
  }
}
for (const b of fs.readdirSync(ROOT)) for (const f of fs.readdirSync(path.join(ROOT, b))) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, b, f), "utf8"));
  (j.words || []).forEach((w) => words.add(w.w));
  walk(j);
}

const done = {};
if (fs.existsSync(SRC)) for (const f of fs.readdirSync(SRC)) {
  if (!f.endsWith(".json") || f.startsWith("todo-")) continue;
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8")))) done[norm(k)] = v; // "" = not language (character lists)
}

const want = (s) => !/[A-Za-z]|___/.test(s) && !words.has(s) && !/^第.+课$/.test(s) && [...s.replace(/[\p{P}\s]/gu, "")].length >= 2;
const missing = [...new Set([...all].filter(want).map(norm))].filter((s) => !known.has(s) && !(s in done));

const i = process.argv.indexOf("--todo");
if (i > 0) {
  const n = +process.argv[i + 1] || 8, size = Math.ceil(missing.length / n);
  fs.mkdirSync(SRC, { recursive: true });
  for (let k = 0; k < n; k++) {
    const part = missing.slice(k * size, (k + 1) * size);
    if (part.length) fs.writeFileSync(path.join(SRC, `todo-${k + 1}.json`), JSON.stringify(Object.fromEntries(part.map((s) => [s, ""])), null, 1) + "\n");
  }
  console.log(`${missing.length} untranslated → ${n} todo files`);
} else {
  const out = Object.fromEntries([...known, ...Object.entries(done).filter(([, v]) => v)].sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync("src/data/sentence-en.gen.json", JSON.stringify(out) + "\n");
  console.log(`sentence-en: ${Object.keys(out).length} sentences, ${missing.length} still untranslated`);
}
