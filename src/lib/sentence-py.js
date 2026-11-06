// Pinyin for any Chinese sentence: words come from the app's dictionary (right for most
// polyphones such as 了 / 得 / 都), single characters fall back to the character table, then to
// extra-py.json (generated from CC-CEDICT by scripts/gen-extra-py.mjs, for characters the lessons
// use in sentences but no table covers). Punctuation stays: opening brackets and quotes belong to
// the next word, everything else to the word before. Returns plain pinyin text; wrap it in tonePy().
import { makeSegmenter } from "./segment.js";
import { DICT, CHARINFO } from "../data/index.js";
import EXTRA from "../data/extra-py.json";

const segment = makeSegmenter(DICT);
// Long dictionary entries (whole phrases such as 祝你生日快乐) are split into their words.
const shortSegment = makeSegmenter(Object.fromEntries(Object.entries(DICT).filter(([k]) => [...k].length <= 3)));
const cache = new Map();

const OPEN = /^[“‘「『（《〈【［(\[]$/;
const wordPy = (t, info) => info?.py || [...t].map((c) => CHARINFO[c]?.py?.split(/[;,/ ]/)[0] || EXTRA[c] || "").join("");
const clean = (py) => py.replace(/\s+/g, "");

export function sentencePy(hz) {
  if (cache.has(hz)) return cache.get(hz);
  const items = []; // { py } words, { open } or { close }
  let prev = null; // previous Chinese token, for the 地 rule
  for (const s of segment(hz)) {
    if (!s.word) {
      for (const ch of s.t) {
        if (/\s/.test(ch)) continue;
        items.push(OPEN.test(ch) ? { open: ch } : /[\p{P}\p{S}]/u.test(ch) ? { close: ch } : { py: ch, text: true });
      }
      prev = null;
      continue;
    }
    if (s.t === "地" && prev && [...prev].length >= 2) { items.push({ py: "de" }); prev = s.t; continue; }
    if ([...s.t].length >= 5) {
      for (const p of shortSegment(s.t)) items.push({ py: clean(wordPy(p.t, p.info)) });
    } else items.push({ py: clean(wordPy(s.t, s.info)) });
    prev = s.t;
  }
  let out = "", opening = "";
  for (const it of items) {
    if (it.open) { opening += it.open; continue; }
    if (it.close) { out += (opening ? opening : "") + it.close; opening = ""; continue; }
    out += (out ? " " : "") + opening + it.py;
    opening = "";
  }
  out += opening;
  out = out.trim();
  cache.set(hz, out);
  return out;
}
