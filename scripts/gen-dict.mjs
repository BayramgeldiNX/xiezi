// Builds the Notebook dictionary from CC-CEDICT (CC BY-SA 4.0, see public/dict/LICENSE.txt).
//   HTTPS_PROXY=http://127.0.0.1:7897 node --use-env-proxy scripts/gen-dict.mjs [cedict.txt.gz]
// Also writes public/dict/chars.json (radicals and parts) from data-src/makemeahanzi-dictionary.txt (or $HANZI).
// Writes public/dict/<n>.json, n = (code point of the word's first character) % 64:
//   { "外卖": [["wài mài", "takeout; to deliver food; measure word: 个"], ...], "外賣": "外卖" }
// keyed by simplified, at most 6 senses per reading plus its measure words;
// a traditional form that differs points to its simplified key.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { addTone } from "../src/lib/pinyin.js";

const URL_ = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz";
export const SHARDS = 64;
const MAX_SENSES = 6;

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

// "CL:個|个[ge4],隻|只[zhi1]" -> ["个", "只"]
const measureWords = (s) => s.slice(3).split(",").map((c) => c.replace(/\[.*$/, "").split("|").pop()).filter(Boolean);

export function parseCedict(text) {
  const words = new Map(); // simplified -> Map(reading -> senses[])
  const trad = new Map(); // traditional -> simplified
  for (const line of text.split("\n")) {
    if (!line || line[0] === "#") continue;
    const m = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/.exec(line);
    if (!m) continue;
    const [, tw, simp, numbered, defs] = m;
    if (tw !== simp && !trad.has(tw)) trad.set(tw, simp);
    let senses = defs.split("/").filter(Boolean);
    const cl = senses.filter((s) => /^CL:/.test(s)).flatMap(measureWords);
    const real = senses.filter((s) => !/^CL:/.test(s));
    if (real.length) senses = real;
    const py = numberedToMarks(numbered);
    const byReading = words.get(simp) || words.set(simp, new Map()).get(simp);
    const cur = byReading.get(py) || byReading.set(py, { senses: [], minor: true }).get(py);
    cur.senses.push(...senses);
    cur.cl = [...new Set([...(cur.cl || []), ...cl])];
    if (!senses.every((s) => MINOR.test(s))) cur.minor = false;
  }
  const out = {};
  for (const [simp, byReading] of words) {
    const list = [...byReading].map(([py, v], i) => {
      const senses = [...new Set(v.senses)].slice(0, MAX_SENSES);
      if (v.cl?.length && real(senses)) senses.push(`measure word: ${v.cl.join(", ")}`);
      return { py, en: senses.join("; "), minor: v.minor, i };
    });
    list.sort((a, b) => a.minor - b.minor || a.i - b.i);
    out[simp] = list.map((e) => [e.py, e.en]);
  }
  for (const [tw, simp] of trad) if (!out[tw]) out[tw] = simp;
  return out;
}

const real = (senses) => senses.some((s) => !/^CL:/.test(s));

// Every character's radical and parts, from Make Me a Hanzi (https://github.com/skishore/makemeahanzi).
// public/dict/chars.json: { "语": ["yǔ", "words", "讠", "⿰讠吾", "pictophonetic", "吾", "words"] }
//   = [pinyin, short meaning, radical, decomposition, type, sound part, origin hint]
export function parseHanzi(text) {
  const out = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    const dec = (e.decomposition || "").includes("？") ? "" : e.decomposition || "";
    out[e.character] = [e.pinyin?.[0] || "", (e.definition || "").split(/[;,]/)[0].trim(), e.radical || "", dec,
      e.etymology?.type || "", e.etymology?.phonetic || "", e.etymology?.hint || ""];
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
  const hanzi = process.env.HANZI || path.join(dir, "../../data-src/makemeahanzi-dictionary.txt");
  if (fs.existsSync(hanzi)) {
    const chars = parseHanzi(fs.readFileSync(hanzi, "utf8"));
    fs.writeFileSync(path.join(dir, "chars.json"), JSON.stringify(chars));
    console.log(`public/dict/chars.json: radicals and parts of ${Object.keys(chars).length} characters`);
  } else console.log("chars.json: Make Me a Hanzi not downloaded, keeping the existing file");
  console.log(`public/dict: ${Object.values(dict).filter((v) => typeof v !== "string").length} words, ${Object.values(dict).filter((v) => typeof v === "string").length} traditional forms, in ${SHARDS} files`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
