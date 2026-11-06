// Pinyin for characters the lessons use in sentences but no word/character table covers.
//   node scripts/gen-extra-py.mjs        (reads public/dict/*.json from gen-dict.mjs; no network)
// Writes src/data/extra-py.json { 字: "pinyin" }, used as the last fallback by src/lib/sentence-py.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const books = path.join(root, "src/data/books");
const known = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "src/data/chars.json"), "utf8"))));
try { for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(root, "src/data/charinfo.gen.json"), "utf8")))) known.add(k); } catch {}
const han = /\p{Script=Han}|〇/u;
const seen = new Set();
const grab = (v) => { if (typeof v === "string") for (const c of v) if (han.test(c)) seen.add(c); else if (c === "〇") seen.add(c); else if (Array.isArray(v)) 0; else 0; };
const walk = (v, key) => {
  if (typeof v === "string") { if (key !== "py") grab(v); }
  else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
};
for (const b of fs.readdirSync(books)) for (const f of fs.readdirSync(path.join(books, b)).filter((f) => /^lesson/.test(f)))
  walk(JSON.parse(fs.readFileSync(path.join(books, b, f), "utf8")));
// single-character words in the lessons already have pinyin
for (const b of fs.readdirSync(books)) for (const f of fs.readdirSync(path.join(books, b)).filter((f) => /^lesson/.test(f)))
  for (const w of JSON.parse(fs.readFileSync(path.join(books, b, f), "utf8")).words || []) if ([...w.w].length === 1) known.add(w.w);
const out = { "〇": "líng" };
for (const c of [...seen].sort()) {
  if (known.has(c) || out[c]) continue;
  const shard = path.join(root, "public/dict", `${c.codePointAt(0) % 64}.json`);
  const rs = JSON.parse(fs.readFileSync(shard, "utf8"))[c] || [];
  const hit = (rs.find((r) => !/^\p{Lu}/u.test(r[0])) || rs[0])?.[0]?.toLowerCase(); // skip surname-only readings
  if (hit) out[c] = hit;
  else console.log("no pinyin found for", c);
}
fs.writeFileSync(path.join(root, "src/data/extra-py.json"), JSON.stringify(out, null, 0) + "\n");
console.log(Object.keys(out).length, "characters");
