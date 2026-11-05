// Pinyin for any Chinese sentence: words come from the app's dictionary (right for most
// polyphones such as 了 / 得 / 都), single characters fall back to the character table.
// Punctuation stays. Returns plain pinyin text; wrap it in tonePy() to color it.
import { makeSegmenter } from "./segment.js";
import { DICT, CHARINFO } from "../data/index.js";

const segment = makeSegmenter(DICT);
const cache = new Map();

export function sentencePy(hz) {
  if (cache.has(hz)) return cache.get(hz);
  const parts = [];
  for (const s of segment(hz)) {
    if (!s.word) { parts.push(s.t.replace(/\s+/g, "")); continue; }
    let py = s.info?.py;
    if (!py) py = [...s.t].map((c) => CHARINFO[c]?.py?.split(/[;,/ ]/)[0] || "").join("");
    parts.push(py.replace(/\s+/g, ""));
  }
  // words separated by spaces, punctuation attached to the word before it
  const out = parts.reduce((acc, p) => (/^[\p{P}\p{S}]+$/u.test(p) && acc ? acc + p : acc ? `${acc} ${p}` : p), "").trim();
  cache.set(hz, out);
  return out;
}
