// Builds the Notebook dictionary from CC-CEDICT (CC BY-SA 4.0, see public/dict/LICENSE.txt).
//   HTTPS_PROXY=http://127.0.0.1:7897 node --use-env-proxy scripts/gen-dict.mjs [cedict.txt.gz]
// Writes public/dict/<n>.json, n = (code point of the word's first character) % 64:
//   { "外卖": [["wài mài", "takeout"], ...] }   keyed by simplified, at most 3 senses per reading.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { addTone } from "../src/lib/pinyin.js";

const URL_ = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz";
export const SHARDS = 64;
const MAX_SENSES = 3;

// "wai4 mai4" -> "wài mài";  "lu:4" -> "lǜ";  tone 5 (neutral) and "r5" (erhua) get no mark.
export function numberedToMarks(numbered) {
  return numbered.trim().split(/\s+/).map((syl) => {
    const m = /^([A-Za-z:üÜ]+?)([1-5])?$/.exec(syl);
    if (!m) return syl;
    const plain = m[1].replace(/u:|v/gi, "ü").replace(/U:/g, "Ü");
    const tone = m[2] ? +m[2] : 5;
    if (tone === 5) return plain;
    const lower = plain.toLowerCase(), marked = addTone(lower, tone);
    return plain[0] !== lower[0] ? marked[0].toUpperCase() + marked.slice(1) : marked;
  }).join(" ");
}

const MINOR = /^(surname |variant of|old variant|archaic|erhua variant|abbr\. for|see |also written)/i;

export function parseCedict(text) {
  const words = new Map(); // simplified -> Map(reading -> senses[])
  for (const line of text.split("\n")) {
    if (!line || line[0] === "#") continue;
    const m = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/.exec(line);
    if (!m) continue;
    const [, , simp, numbered, defs] = m;
    let senses = defs.split("/").filter(Boolean);
    const real = senses.filter((s) => !/^CL:/.test(s));
    if (real.length) senses = real;
    const py = numberedToMarks(numbered);
    const byReading = words.get(simp) || words.set(simp, new Map()).get(simp);
    const cur = byReading.get(py) || byReading.set(py, { senses: [], minor: true }).get(py);
    cur.senses.push(...senses);
    if (!senses.every((s) => MINOR.test(s))) cur.minor = false;
  }
  const out = {};
  for (const [simp, byReading] of words) {
    const list = [...byReading].map(([py, v], i) => ({ py, en: [...new Set(v.senses)].slice(0, MAX_SENSES).join("; "), minor: v.minor, i }));
    list.sort((a, b) => a.minor - b.minor || a.i - b.i);
    out[simp] = list.map((e) => [e.py, e.en]);
  }
  return out;
}

export const shardOf = (word) => word.codePointAt(0) % SHARDS;

async function main() {
  const src = process.argv[2];
  const buf = src ? fs.readFileSync(src) : Buffer.from(await (await fetch(URL_)).arrayBuffer());
  const text = (src && !src.endsWith(".gz")) ? buf.toString("utf8") : zlib.gunzipSync(buf).toString("utf8");
  const dict = parseCedict(text);
  const shards = Array.from({ length: SHARDS }, () => ({}));
  for (const [w, v] of Object.entries(dict)) shards[shardOf(w)][w] = v;
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/dict");
  fs.mkdirSync(dir, { recursive: true });
  shards.forEach((s, n) => fs.writeFileSync(path.join(dir, `${n}.json`), JSON.stringify(s)));
  console.log(`public/dict: ${Object.keys(dict).length} words in ${SHARDS} files`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
