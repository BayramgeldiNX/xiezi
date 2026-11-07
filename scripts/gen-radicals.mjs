// Builds src/data/radical-families.gen.json from radicals-core.json (the radical list), public/dict/chars.json
// (radical + phonetic of ~9.5k characters) and the lesson characters. Frequency proxy: the number of CC-CEDICT
// words (public/dict/<n>.json shards) that contain the character.
// Usage: node scripts/gen-radicals.mjs [path/to/radicals-core.json]   (or env RADICALS_CORE)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, DATA_DIR, loadLessons, readJSON, isHanzi } from "./lib.mjs";

const OUT = path.join(DATA_DIR, "radical-families.gen.json");
const short = (en, max = 30) => {
  const s = (en || "").split(/[;,]/)[0].trim();
  return s.length > max ? s.slice(0, max).trim() : s;
};
const junk = /variant|surname|Kangxi|radical|abbr|archaic|\bsame as\b|used in|province|nationality|heavenly stem|earthly branch|ketone|amine|\bacid\b|ester|compound|Buddhis|Sanskrit|dialect|county|prefecture|\bcity\b|river in|name of|chemical|element/i;
const MIN_WORDS = 8; // a common char appears in at least this many CC-CEDICT words
const basicCJK = (c) => { const n = c.codePointAt(0); return n >= 0x4e00 && n <= 0x9fff; };

let singles;
function wordCounts() {
  const dir = path.join(ROOT, "public/dict");
  const n = new Map();
  singles = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!/^\d+\.json$/.test(f)) continue;
    for (const [w, v] of Object.entries(readJSON(path.join(dir, f)))) {
      if (typeof v === "string") continue; // traditional form pointing at the simplified word
      if ([...w].length === 1) singles.add(w);
      for (const c of new Set(w)) n.set(c, (n.get(c) || 0) + 1);
    }
  }
  return n;
}

export function genRadicals(corePath = process.argv[2] || process.env.RADICALS_CORE || path.join(DATA_DIR, "radicals-core.json")) {
  if (!fs.existsSync(corePath)) {
    console.log("radical-families: radicals-core.json missing, skipped");
    return;
  }
  const core = readJSON(corePath);
  const chars = readJSON(path.join(ROOT, "public/dict/chars.json"));
  const freq = wordCounts();
  // Book characters in order of first appearance.
  const bookOrder = [];
  const seen = new Set();
  for (const l of loadLessons()) for (const w of l.words) for (const c of w.w) if (isHanzi(c) && !seen.has(c)) { seen.add(c); bookOrder.push(c); }
  const byFreq = Object.keys(chars)
    .filter((c) => isHanzi(c) && (freq.get(c) || 0) > 0 && singles.has(c))
    .sort((a, b) => freq.get(b) - freq.get(a) || a.codePointAt(0) - b.codePointAt(0));

  const out = {};
  for (const st of core.stages) for (const r of st.radicals) {
    const forms = new Set([r.r, ...(r.variants || [])]);
    const inFam = (c) => chars[c] && forms.has(chars[c][2]);
    const book = [...new Set([...(r.examples || []).filter((c) => seen.has(c)), ...bookOrder.filter(inFam)])].slice(0, 30);
    const entry = (c) => {
      const [py, en, , , type, ph] = chars[c];
      const o = { c, py, en: short(en) };
      if (type === "pictophonetic" && ph) o.sound = ph;
      return o;
    };
    const ok = (c) => chars[c]?.[0] && short(chars[c][1]) && !junk.test(chars[c][1]);
    const pool = byFreq.filter((c) => inFam(c) && !seen.has(c) && ok(c) && basicCJK(c) && freq.get(c) >= MIN_WORDS);
    const exCommon = (r.examples || []).filter((c) => !seen.has(c) && chars[c]?.[0] && short(chars[c][1]));
    const commonC = [...new Set([...exCommon, ...pool])].slice(0, 12);
    const guessC = (r.guess || []).filter((g) => g && g.c).map((g) => ({ c: g.c, py: chars[g.c]?.[0] || "", en: g.en }));
    out[r.r] = { book, common: commonC.map(entry), guess: guessC };
  }
  const lines = Object.entries(out).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  fs.writeFileSync(OUT, `{\n${lines.join(",\n")}\n}\n`);
  const thin = Object.entries(out).filter(([, v]) => v.book.length + v.common.length < 4).map(([k]) => k);
  console.log(`radical-families.gen.json: ${lines.length} radicals${thin.length ? `, <4 chars: ${thin.join(" ")}` : ""}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) genRadicals();
