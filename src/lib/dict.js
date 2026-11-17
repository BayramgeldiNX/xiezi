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
// tier 0-3 is how many CC-CEDICT words use it (2 and 3 count as common, see scripts/gen-dict.mjs).
let charsFile = null, families = null;
const loadChars = () => (charsFile ||= fetch(`${import.meta.env.BASE_URL}dict/chars.json`).then((r) => (r.ok ? r.json() : {}))
  .catch(() => { charsFile = null; return {}; }));

export async function charParts(c) {
  try {
    const all = await loadChars(), e = all[c];
    if (!e) return null;
    const [py, en, radical, dec, type, sound, hint, tier] = e;
    const brief = (x) => ({ c: x, py: all[x]?.[0] || "", en: RADICALS[x] || all[x]?.[1] || "", tier: all[x]?.[7] ?? 0 });
    const parts = [...new Set([...dec].filter((x) => !/[⿰-⿿]/u.test(x)))];
    return { c, py, en, dec, type, hint, sound, tier: tier ?? 0, radical: radical ? brief(radical) : null, parts: parts.length > 1 ? parts.map(brief) : [] };
  } catch { return null; }
}

// Characters whose sound part is c (奂: 换 唤 焕 涣 痪), common ones first.
export async function soundFamily(c) {
  try {
    const all = await loadChars();
    if (!families) {
      families = new Map();
      for (const [k, e] of Object.entries(all)) if (e[5] && e[5] !== k && e[0]) (families.get(e[5]) || families.set(e[5], []).get(e[5])).push(k);
    }
    return (families.get(c) || []).sort((a, b) => (all[b][7] ?? 0) - (all[a][7] ?? 0))
      .map((k) => ({ c: k, py: all[k][0], en: all[k][1], tier: all[k][7] ?? 0 }));
  } catch { return []; }
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

const MINOR = /^(surname |variant of|old variant|archaic|erhua variant|abbr\. for|see |also written)/i;
const minor = (sense) => MINOR.test(sense);

// Up to 3 CC-CEDICT meanings of a character, for its own reading when it has several (行 xíng).
// "surname X" and "variant of X" only when nothing else is left.
export async function charSenses(c, py = "") {
  const list = await cedict(c);
  if (!list.length) return [];
  const plain = (p) => p.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hit = list.find((e) => py && plain(e.py) === plain(py)) || list[0];
  // Plain readable senses: no "[yong4]" readings, "網|网" shows the simplified form, long notes are cut.
  const tidy = (x) => { const t = x.replace(/\s*\[[^\]]*\]/g, "").replace(/[^\s,;()]+\|([^\s,;()]+)/g, "$1"); return t.length > 80 ? `${t.slice(0, 77)}…` : t; };
  const all = hit.en.split("; ").filter(Boolean).filter((x) => !/^measure word/.test(x)).map(tidy);
  const good = all.filter((x) => !minor(x));
  return (good.length ? good : all).slice(0, 3);
}

// Words starting with c (or in its file, containing c), everyday ones first: a character's "words with".
// Without a word-frequency list, "everyday" = made of common characters.
export async function wordsWithChar(c, n = 5) {
  try {
    const all = await loadChars(), file = await loadShard(shard(c));
    return Object.entries(file).filter(([w, v]) => typeof v !== "string" && w.includes(c) && w !== c && [...w].length <= 4 && !minor(v[0][1].split("; ")[0]))
      .map(([w, v]) => ({ w, py: v[0][0], en: v[0][1], score: [...w].reduce((t, x) => t + (all[x]?.[7] ?? 0), 0) / [...w].length - [...w].length * 0.1 }))
      .sort((a, b) => b.score - a.score).slice(0, n).map(({ score, ...x }) => x);
  } catch { return []; }
}

// Whole-dictionary search for a Chinese query: the word itself, then words that start with it.
export async function searchDict(q, skip = () => false, max = 20) {
  try {
    const query = q.trim();
    if (!query) return [];
    const all = await loadChars(), file = await loadShard(shard(query));
    const out = [];
    const add = (w, v) => { if (typeof v !== "string" && v && !skip(w) && !out.some((x) => x.w === w)) out.push({ w, py: v[0][0], en: v[0][1] }); };
    let exact = file[query];
    if (typeof exact === "string") exact = (await loadShard(shard(exact)))[exact];
    add(typeof file[query] === "string" ? file[query] : query, exact);
    const more = Object.entries(file).filter(([w, v]) => w !== query && w.startsWith(query) && typeof v !== "string" && !minor(v[0][1].split("; ")[0]))
      .map(([w, v]) => ({ w, v, score: [...w].reduce((t, x) => t + (all[x]?.[7] ?? 0), 0) / [...w].length - [...w].length * 0.1 }))
      .sort((a, b) => b.score - a.score);
    for (const { w, v } of more) if (out.length < max) add(w, v);
    return out;
  } catch { return []; }
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
