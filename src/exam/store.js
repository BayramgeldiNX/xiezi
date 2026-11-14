// Test results, kept on this device (localStorage) with hooks for cloud sync.
// Like progress items, results are kept per device: `mine` is what was saved on THIS device, `others` is what the
// cloud holds for the other devices, so a device can only ever replace its own entry. What the app shows is the
// merge of all of them (`resultOf`): best = highest total, last = newest, n = the number of distinct attempts.
// A record is { best, last, tries }, tries being the timestamps (`at`) of the attempts: counting a set of
// timestamps cannot count an attempt twice, however often a record is merged.
// A result is { total (0-500), parts: [listen, vocab, grammar, read, write], at, secs }.
import { store } from "../lib/util.js";
import { deviceId } from "../progress/store.js";

const KEY = "xz-tests-v1";
const MAXTRIES = 500;

function load() {
  const p = store.get(KEY, null);
  const o = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  return { mine: o(p?.mine), others: o(p?.others), unsent: o(p?.unsent) }; // unsent: { key: uid | null }
}
const R = load();
const subs = new Set();
let syncer = null;
let cur = null; // the uid signed in now
let saveTimer = 0;

function save() { store.set(KEY, R); }
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 50);
}
function changed() {
  persist();
  subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}
globalThis.addEventListener?.("pagehide", () => { clearTimeout(saveTimer); save(); });

export const testKey = (book, test) => `${book}/${test}`;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function onResults(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/* ---------- merging ---------- */
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : -Infinity); // a bad number counts as missing
const text = (r) => { try { return JSON.stringify(r) ?? ""; } catch { return ""; } };
// Last tie-break, so the result never depends on the order of the arguments.
const cmp = (a, b) => { const x = text(a), y = text(b); return x < y ? -1 : x > y ? 1 : 0; };

const pickBest = (a, b) => {
  if (!a || !b) return a || b || null;
  const ta = num(a.total), tb = num(b.total);
  if (ta !== tb) return ta > tb ? a : b;
  const aa = num(a.at), ab = num(b.at);
  if (aa !== ab) return aa < ab ? a : b;
  return cmp(a, b) <= 0 ? a : b;
};
const pickLast = (a, b) => {
  if (!a || !b) return a || b || null;
  const aa = num(a.at), ab = num(b.at);
  if (aa !== ab) return aa > ab ? a : b;
  return cmp(a, b) <= 0 ? a : b;
};

// The attempts of a record. An old record without a list counts the timestamps of its best and last result.
const triesOf = (r) => {
  const src = Array.isArray(r?.tries) ? r.tries : [r?.best?.at, r?.last?.at];
  return src.filter((x) => typeof x === "number" && Number.isFinite(x));
};
const union = (...lists) => [...new Set(lists.flat())].sort((x, y) => x - y).slice(-MAXTRIES); // the newest 500

// Pure: combine two records of the same test (either may be null). Commutative, associative, idempotent.
export function merge(a, b) {
  const one = a || b;
  if (!one) return null;
  if (!a || !b) return { best: one.best ?? null, last: one.last ?? one.best ?? null, tries: union(triesOf(one)) };
  return { best: pickBest(a.best, b.best), last: pickLast(a.last, b.last), tries: union(triesOf(a), triesOf(b)) };
}

const valid = (r) => !!r && typeof r === "object" && !!r.best && typeof r.best === "object" && Number.isFinite(r.best.total);
const clean = (r) => ({ best: r.best, last: r.last && typeof r.last === "object" ? r.last : r.best, tries: union(triesOf(r)) });
const mineOf = (key) => (valid(R.mine[key]) ? clean(R.mine[key]) : null);

function same(a, b) {
  if (!a || !b) return a === b;
  const ta = triesOf(a), tb = triesOf(b);
  return a.best?.total === b.best?.total && a.best?.at === b.best?.at && a.last?.at === b.last?.at
    && ta.length === tb.length && ta.every((x, i) => x === tb[i]);
}

// What the app sees: this device and all the others together.
function full(key) {
  const recs = [R.mine[key], ...Object.values(R.others[key] || {})].filter(valid).map(clean);
  return recs.length ? recs.reduce(merge) : null;
}
const view = (key) => { const f = full(key); return f && { best: f.best, last: f.last, n: f.tries.length }; };

export const resultOf = (book, test) => view(testKey(book, test));
export function allResults() {
  const out = {};
  for (const k of new Set([...Object.keys(R.mine), ...Object.keys(R.others)])) { const v = view(k); if (v) out[k] = v; }
  return out;
}

// Keep a handed-in result. isBest is true only when an older best existed and was beaten.
export function saveResult(book, test, result) {
  const key = testKey(book, test);
  const before = view(key);
  const beat = !!before?.best && result.total > before.best.total;
  const mine = merge(mineOf(key), { best: result, last: result, tries: [result.at] });
  mine.last = result; // the one just handed in is the last, whatever its clock says
  R.mine[key] = mine;
  if (!has(R.unsent, key)) R.unsent[key] = cur;
  changed();
  syncer?.push(key, mine);
  return { isBest: beat, record: view(key) };
}

/* ---------- sync hooks (used by src/sync) ---------- */
// Sign-in (s given, with the uid) or sign-out (null). On sign-in, what was saved signed out joins this account and
// what waits for another account is dropped.
export function setSyncer(s, uid = null) {
  syncer = s;
  cur = s ? uid : null;
  if (!s) return;
  for (const k of Object.keys(R.unsent)) {
    const tag = R.unsent[k];
    if (tag === null || tag === undefined || tag === uid) R.unsent[k] = uid;
    else { delete R.unsent[k]; delete R.mine[k]; }
  }
  changed();
}
// Records of this device waiting for the cloud (never anything that came from it).
export const unsentAll = () => Object.keys(R.unsent).filter((k) => R.mine[k]).map((k) => [k, R.mine[k]]);

// Called once the cloud confirmed `sent`; a record changed meanwhile stays unsent.
export function markUploaded(key, sent) {
  if (has(R.unsent, key) && same(R.mine[key], sent)) { delete R.unsent[key]; persist(); }
}

// A cloud document { k, d: { [deviceId]: record } }: the other devices' entries are replaced by it; this device's own
// entry (our own echo too, pending or not) is merged into ours, which cannot change what we already hold.
// Returns true when we hold more than the cloud has for this device (the caller sends it).
// pending: the document still carries a write of ours the server has not confirmed; such an echo proves nothing,
// so the record stays unsent until the confirmation (markUploaded) or a confirmed copy arrives.
export function applyRemote(key, doc, pending = false) {
  if (!key || !doc || typeof doc.d !== "object" || !doc.d) return false;
  const me = deviceId();
  const others = {};
  for (const [dev, rec] of Object.entries(doc.d)) {
    if (dev === me || !valid(rec)) continue;
    others[dev] = clean(rec);
  }
  if (Object.keys(others).length) R.others[key] = others; else delete R.others[key];
  if (!valid(doc.d[me])) return false;
  const c = clean(doc.d[me]);
  const merged = merge(mineOf(key), c);
  if (!same(merged, R.mine[key])) R.mine[key] = merged;
  if (same(merged, c)) { if (!pending) delete R.unsent[key]; return false; } // the cloud has all of it
  if (!has(R.unsent, key)) R.unsent[key] = cur;
  return true;
}
export const remoteDone = changed;

// Signing out: forget what only the cloud holds (it comes back on the next sign-in); results not yet uploaded stay.
export function clearRemote() {
  R.others = {};
  for (const k of Object.keys(R.mine)) if (!has(R.unsent, k)) delete R.mine[k];
  changed();
}

/* ---------- backup ---------- */
export function exportResults() {
  const out = {};
  for (const k of new Set([...Object.keys(R.mine), ...Object.keys(R.others)])) { const f = full(k); if (f) out[k] = f; }
  return out;
}

// Merge backup results into this device's: a union of attempts, so nothing is counted twice; they are sent to the cloud.
export function importResults(data) {
  if (!data || typeof data !== "object") return;
  for (const [k, rec] of Object.entries(data)) {
    if (!valid(rec)) continue;
    const merged = merge(mineOf(k), clean(rec));
    if (same(merged, R.mine[k])) continue;
    R.mine[k] = merged;
    if (!has(R.unsent, k)) R.unsent[k] = cur;
    syncer?.push(k, merged);
  }
  changed();
}
