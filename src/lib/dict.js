// Dictionary for the Notebook: book words first (book pinyin and meaning), then CC-CEDICT shards
// (public/dict/<n>.json, loaded on demand). Never throws: no result is [].
import { DICT, CHARS, RADICALS } from "../data/index.js";

const shards = new Map(); // shard number -> Promise of { word: [[py, en], ...] }
const shard = (word) => word.codePointAt(0) % 64;

function loadShard(n) {
  if (!shards.has(n)) {
    shards.set(n, fetch(`${import.meta.env.BASE_URL}dict/${n}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => { shards.delete(n); return {}; }));
  }
  return shards.get(n);
}

async function cedict(word) {
  if (!word) return [];
  let hit = (await loadShard(shard(word)))[word];
  // A traditional form points to its simplified entry (門 -> 门).
  if (typeof hit === "string") hit = (await loadShard(shard(hit)))[hit];
  return hit ? hit.map(([py, en]) => ({ py, en })) : [];
}

// Radical and parts of any character (public/dict/chars.json, from Make Me a Hanzi). null if unknown.
let charsFile = null;
export async function charParts(c) {
  try {
    charsFile ||= fetch(`${import.meta.env.BASE_URL}dict/chars.json`).then((r) => (r.ok ? r.json() : {}))
      .catch(() => { charsFile = null; return {}; });
    const all = await charsFile, e = all[c];
    if (!e) return null;
    const [py, en, radical, dec, type, sound, hint] = e;
    const brief = (x) => ({ c: x, py: all[x]?.[0] || "", en: RADICALS[x] || all[x]?.[1] || "" });
    const parts = [...new Set([...dec].filter((x) => !/[⿰-⿿]/u.test(x)))];
    return { c, py, en, dec, type, hint, sound, radical: radical ? brief(radical) : null, parts: parts.length > 1 ? parts.map(brief) : [] };
  } catch { return null; }
}

// Fetch every shard once, so the whole dictionary works offline (the service worker keeps them).
const ALL_KEY = "xz-dict-all-v2";
export async function saveForOffline() {
  try {
    if (localStorage.getItem(ALL_KEY) || !navigator.onLine) return;
    for (const n of ["chars", ...Array.from({ length: 64 }, (_, i) => i)]) {
      const r = await fetch(`${import.meta.env.BASE_URL}dict/${n}.json`);
      if (!r.ok) return;
      await r.arrayBuffer();
    }
    localStorage.setItem(ALL_KEY, "1");
  } catch { /* try again next time */ }
}

export async function lookup(word) {
  try {
    const book = DICT[word];
    if (book && book.py) return [{ py: book.py, en: book.en || "" }];
    const found = await cedict(word);
    if (found.length) return found;
    // Not a dictionary word: join the first reading of each character, leaving the meaning empty.
    const chars = [...word];
    if (chars.length < 2) return [];
    const parts = await Promise.all(chars.map(async (c) => (CHARS[c]?.py || (await cedict(c))[0]?.py || "").split(/[,;/]/)[0].trim()));
    return parts.every(Boolean) ? [{ py: parts.join(" "), en: "" }] : [];
  } catch {
    return [];
  }
}
