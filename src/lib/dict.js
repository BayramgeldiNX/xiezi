// Dictionary for the Notebook: book words first (book pinyin and meaning), then CC-CEDICT shards
// (public/dict/<n>.json, loaded on demand). Never throws: no result is [].
import { DICT, CHARS } from "../data/index.js";

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
  const hit = (await loadShard(shard(word)))[word];
  return hit ? hit.map(([py, en]) => ({ py, en })) : [];
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
