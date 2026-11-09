// One example character per tone for every syllable the tone quiz can ask, so a wrong answer can be
// heard next to the right one: src/data/tone-samples.gen.json = { "ben": ["奔", "", "本", "笨"], ... }.
//   node scripts/gen-tone-samples.mjs      (then npm run gen:audio records the new characters)
// Order of preference: the classic tone sets, book characters, then common characters from the
// CC-CEDICT dictionary in public/dict/ (common = appears in the most dictionary words).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTone, addTone } from "../src/lib/pinyin.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "src/data");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

const CHARS = read(path.join(DATA, "chars.json"));
const SETS = read(path.join(DATA, "tone-sets.json"));
const MINOR = /^(surname |variant of|old variant|archaic|erhua variant|abbr\. for|see |also written|used in |\(archaic\)|\(old\)|\(dialect\)|\(literary\)|\(Tw\)|\(Cant\.\))/i;
const HAN = /^\p{Script=Han}$/u;

// Read the dictionary once: how many words use each character, and each everyday one-syllable reading.
const uses = new Map(), byPy = new Map(), readings = new Map();
const dir = path.join(ROOT, "public/dict");
for (const f of fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
  for (const [word, entry] of Object.entries(read(path.join(dir, f)))) {
    if (typeof entry === "string") continue; // traditional form pointing to its simplified key
    if (word.length > 1) for (const c of new Set(word)) uses.set(c, (uses.get(c) || 0) + 1);
    else if (HAN.test(word)) for (const [py, en] of entry) {
      (readings.get(word) || readings.set(word, new Set()).get(word)).add(py.toLowerCase()); // every reading, even rare ones
      if (/\s/.test(py) || py[0] !== py[0].toLowerCase() || MINOR.test(en)) continue;
      if (!byPy.has(py)) byPy.set(py, new Set());
      byPy.get(py).add(word);
    }
  }
}

const bookPy = new Map();
for (const [c, v] of Object.entries(CHARS)) if (v.py && !/\s/.test(v.py)) (bookPy.get(v.py) || bookPy.set(v.py, []).get(v.py)).push(c);

const plains = new Set(SETS.map(([p]) => p));
for (const v of Object.values(CHARS)) if (v.py && !/\s/.test(v.py)) plains.add(stripTone(v.py));

const out = {};
let filled = 0, total = 0;
for (const plain of [...plains].sort()) {
  const set = SETS.find(([p]) => p === plain);
  out[plain] = [1, 2, 3, 4].map((t) => {
    total++;
    const py = addTone(plain, t);
    const pick = set?.[t] || bookPy.get(py)?.[0]
      // A character with two everyday readings (号 háo/hào) could be recorded in the wrong tone.
      || [...(byPy.get(py) || [])].filter((c) => readings.get(c).size === 1 && (!CHARS[c] || CHARS[c].py === py)).sort((a, b) => (uses.get(b) || 0) - (uses.get(a) || 0))[0] || "";
    if (pick) filled++;
    return pick;
  });
}
fs.writeFileSync(path.join(DATA, "tone-samples.gen.json"), JSON.stringify(out, null, 0).replace(/\],"/g, '],\n"') + "\n");
console.log(`tone samples: ${Object.keys(out).length} syllables, ${filled}/${total} tones have a character`);
