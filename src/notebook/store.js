// The Notebook: words saved from daily life, kept on this device (localStorage) with hooks for cloud sync.
// One entry per word (the word is its id). Changes are field-level patches: every patch is applied here at
// once and also kept in `pending` until the cloud confirms it, so Claude's fill and an edit made on a
// device never erase each other. The practice schedule is not here: it lives in the progress store under "nb:<word>".
import { store } from "../lib/util.js";
import { isDue } from "../progress/model.js";
import * as progress from "../progress/store.js";

const KEY = "xz-notebook-v1";

// An entry: { w, py, en, sentence: {cn, py, en} | null, wordTrick, charTricks: {char: text},
//             status: "new" (waiting for Claude) | "filled", at, deleted }
const blank = () => ({ w: "", py: "", en: "", sentence: null, wordTrick: "", charTricks: {}, status: "new", at: 0, deleted: false });
const full = (remote, patch) => ({ ...blank(), ...remote, ...patch });

function load() {
  const p = store.get(KEY, null) || {};
  return {
    entries: p.entries || {}, // { word: entry } as shown (cloud copy with `pending` on top)
    pending: p.pending || {}, // { word: patch } not yet confirmed by the cloud
  };
}

const N = load();
const subs = new Set();
let syncer = null;
let saveTimer = 0;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(KEY, N), 50);
}
function changed() {
  persist();
  subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}
globalThis.addEventListener?.("pagehide", () => { clearTimeout(saveTimer); store.set(KEY, N); });

export const nbKey = (w) => "nb:" + w;

export function onNotebook(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export const getWord = (w) => N.entries[w] || null;

// Saved words, newest first (deleted ones stay stored as tombstones but are never listed).
export const list = () => Object.values(N.entries).filter((e) => !e.deleted).sort((a, b) => b.at - a.at);

// Apply a patch here and remember it for the cloud.
export function update(w, patch) {
  const cur = N.entries[w];
  if (!cur) return null;
  N.entries[w] = { ...cur, ...patch };
  N.pending[w] = { ...N.pending[w], ...patch };
  changed();
  syncer?.push(w, N.pending[w]);
  return N.entries[w];
}

export const remove = (w) => update(w, { deleted: true });

// Save a word (works offline). Saving a deleted word brings it back; an existing word is left as it is.
export function addWord(w, fields = {}) {
  const cur = N.entries[w];
  if (cur) return cur.deleted ? update(w, { deleted: false, at: Date.now() }) : cur;
  const patch = { w, status: "new", at: Date.now(), deleted: false, ...fields };
  N.entries[w] = full(null, patch);
  N.pending[w] = patch;
  changed();
  syncer?.push(w, patch);
  return N.entries[w];
}

// Words to review now: never practised, or practised and due.
export function dueWords(now = Date.now()) {
  return list().filter((e) => {
    const stat = progress.get(nbKey(e.w));
    return !stat?.n || isDue(stat, now);
  });
}

/* ---------- sync hooks (used by src/sync) ---------- */
export function setSyncer(s) { syncer = s; }
export const pendingAll = () => Object.entries(N.pending);

// Called once the cloud confirmed `sent`. A patch changed meanwhile stays pending.
export function confirm(w, sent) {
  if (N.pending[w] && JSON.stringify(N.pending[w]) === JSON.stringify(sent)) { delete N.pending[w]; persist(); }
}

// A cloud document: it becomes the entry, with our unconfirmed patch on top.
export function applyRemote(w, doc) {
  if (!w) return;
  N.entries[w] = full({ ...doc, w }, N.pending[w]);
}
export function applyRemoved(w) {
  if (!N.pending[w]) delete N.entries[w];
}
export const remoteDone = changed;

// Signing out: forget what only the cloud holds (it comes back on the next sign-in).
export function clearRemote() {
  for (const w of Object.keys(N.entries)) if (!N.pending[w]) delete N.entries[w];
  changed();
}

/* ---------- backup ---------- */
export const exportEntries = () => list();

// Merge backup entries: new words are added; for known words only empty fields are filled.
export function importEntries(entries) {
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || typeof e.w !== "string" || !e.w) continue;
    const cur = N.entries[e.w];
    if (!cur) {
      const { deleted, ...rest } = e;
      addWord(e.w, rest);
      continue;
    }
    const patch = {};
    for (const k of ["py", "en", "wordTrick"]) if (!cur[k] && e[k]) patch[k] = e[k];
    if (!cur.sentence && e.sentence) patch.sentence = e.sentence;
    const tricks = Object.fromEntries(Object.entries(e.charTricks || {}).filter(([c]) => !cur.charTricks?.[c]));
    if (Object.keys(tricks).length) patch.charTricks = { ...cur.charTricks, ...tricks };
    if (e.status === "filled" && cur.status !== "filled") patch.status = "filled";
    if (cur.deleted) Object.assign(patch, { deleted: false, at: Date.now() });
    if (Object.keys(patch).length) update(e.w, patch);
  }
}
