// Book page images kept on this device: IndexedDB `xz-pages`, one object store.
//   "<id>-<NNN>"  a page: { blob (WebP), w, h, v }
//   "<id>-t<k>"   a chunk of 40 previews (about 300 px): { imgs: [Blob], w: [], h: [], from, v }; w and h are the FULL page sizes
// A page comes from here first, else from the owner's Firestore (sync.js) and is then saved. All downloads go through
// one queue (queue.js): the page on screen first, then its preview chunk, its neighbours, and last the quiet save of
// the whole open book. Every call rejects with an Error whose message is one short line and whose `code` is
// "signed-out" | "not-owner" | "none" | "offline" | "error" | "storage".
import { pageKey, isStale } from "./pages.js";
import { bookPage, bookThumbs } from "../sync/sync.js";
import { createQueue, pagePrio, thumbPrio, chunkOf, chunkCount, BG } from "./queue.js";

const DB = "xz-pages", STORE = "pages";
let persisted = false;

const MSG = {
  "signed-out": "Sign in to read your books.",
  "not-owner": "Your books aren't on this account.",
  none: "This page isn't available.",
  offline: "This page isn't saved on this device yet.",
  error: "This page could not be loaded.",
  storage: "This device could not keep the page.",
};
const fail = (code) => Object.assign(new Error(MSG[code] || MSG.error), { code });

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(fail("storage"));
    let req;
    try { req = indexedDB.open(DB, 1); } catch { return reject(fail("storage")); }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(fail("storage"));
    req.onblocked = () => reject(fail("storage"));
  });
}

// Run one transaction; `make(store)` returns the request whose result is wanted (or null).
async function run(mode, make) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      let out;
      const tx = db.transaction(STORE, mode);
      tx.oncomplete = () => resolve(out);
      tx.onerror = tx.onabort = () => reject(fail("storage"));
      const r = make(tx.objectStore(STORE));
      if (r) r.onsuccess = () => { out = r.result; };
    });
  } finally { db.close(); }
}

const range = (pdf) => IDBKeyRange.bound(`${pdf.id}-`, `${pdf.id}-￿`);
const isChunkKey = (key) => /-t\d+$/.test(key);

// The old PDF-file store: the owner's hand-added files are not used any more. Dropped once.
export function dropOldPdfs() {
  try {
    if (localStorage.getItem("xz-pdf-dropped")) return;
    localStorage.setItem("xz-pdf-dropped", "1");
    indexedDB.deleteDatabase("xz-pdf");
  } catch {}
}

async function cached(pdf, n) {
  try { return (await run("readonly", (s) => s.get(pageKey(pdf.id, n)))) || null; } catch { return null; }
}

/* ---------- the queue: what the reader is on decides what is fetched first ---------- */
let focus = { id: null, cur: null };
const queue = createQueue({
  prioOf: (m) => (m.id !== focus.id ? BG + 3000 : m.kind === "thumb" ? thumbPrio(m.k, focus.cur, m.per) : pagePrio(m.n, focus.cur)),
});
// The reader is on page `cur` of `pdf`: waiting downloads take their order again.
export function setFocus(pdf, cur) {
  focus = { id: pdf.id, cur };
  queue.reprioritise();
}

const epochs = new Map();   // id -> bumps when a book's saved copy is removed, so a download that lands later is not kept
const epoch = (id) => epochs.get(id) || 0;
const persistOnce = () => { if (!persisted) { persisted = true; try { navigator.storage?.persist?.(); } catch {} } };
const thumbKey = (pdf, k) => `${pdf.id}-t${k}`;
const thumbsFresh = (rec, pdf) => !!rec && rec.v >= (pdf.img?.thumbs?.v ?? 1);

const inflight = new Map();
// One page: { blob, w, h, v }. From the device, else downloaded and saved.
export function getPage(pdf, n) {
  const key = pageKey(pdf.id, n);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const rec = await cached(pdf, n);
    if (rec && !isStale(rec, pdf)) return rec;
    const ep = epoch(pdf.id);
    const r = await queue.add(key, { kind: "page", id: pdf.id, n }, () => bookPage(pdf.book, pdf.id, n));
    if (r.status !== "ok") {
      if (rec && (r.status === "offline" || r.status === "error")) return rec;   // an older image beats none
      throw fail(r.status);
    }
    const out = { blob: r.blob, w: r.w, h: r.h, v: r.v };
    if (ep === epoch(pdf.id)) {
      persistOnce();
      try { await run("readwrite", (s) => s.put(out, key)); markSaved(pdf, n); } catch (e) { if (e.code !== "storage") throw e; }   // still show it
    }
    return out;
  })();
  inflight.set(key, p);
  const done = () => inflight.delete(key);
  p.then(done, done);
  return p;
}

const chunks = new Map();   // key -> Promise of [{ blob, w, h }] (one per page of the chunk), kept for the session
const unpack = (rec) => rec.imgs.map((blob, i) => ({ blob, w: rec.w[i], h: rec.h[i] }));
// One chunk of previews, k = 0, 1, ...: an array with one { blob, w, h } per page (w and h: the full page's size).
export function getThumbs(pdf, k) {
  const per = pdf.img?.thumbs?.per;
  if (!per) return Promise.reject(fail("none"));
  const key = thumbKey(pdf, k);
  if (chunks.has(key)) return chunks.get(key);
  const p = (async () => {
    let rec = null;
    try { rec = (await run("readonly", (s) => s.get(key))) || null; } catch {}
    if (thumbsFresh(rec, pdf)) return unpack(rec);
    const ep = epoch(pdf.id);
    const r = await queue.add(key, { kind: "thumb", id: pdf.id, k, per }, () => bookThumbs(pdf.book, pdf.id, k));
    if (r.status !== "ok") {
      if (rec && (r.status === "offline" || r.status === "error")) return unpack(rec);
      throw fail(r.status);
    }
    const out = { imgs: r.imgs, w: r.w, h: r.h, from: r.from, v: r.v };
    if (ep === epoch(pdf.id)) {
      persistOnce();
      try { await run("readwrite", (s) => s.put(out, key)); } catch (e) { if (e.code !== "storage") throw e; }
    }
    return unpack(out);
  })();
  chunks.set(key, p);
  p.catch(() => { if (chunks.get(key) === p) chunks.delete(key); });
  return p;
}
// The preview of one page: { blob, w, h }.
export const getThumb = (pdf, n) => {
  const { k, i } = chunkOf(n, pdf.img?.thumbs?.per || 40);
  return getThumbs(pdf, k).then((a) => a[i] || Promise.reject(fail("none")));
};

// Warm the cache for pages the reader will likely show next. Quiet: failures are ignored.
export function prefetch(pdf, pages) {
  return Promise.all(pages.filter((n) => n >= 1 && n <= pdf.pages).map((n) => getPage(pdf, n).catch(() => {})));
}
// A row on the Shelf was touched: start on that book's saved page and its previews before the reader opens.
export function openHint(pdf, page) {
  setFocus(pdf, page);
  getPage(pdf, page).catch(() => {});
  if (pdf.img?.thumbs) getThumb(pdf, page).catch(() => {});
}

// The keys of this book's pages and preview chunks that are saved here and up to date.
async function freshKeys(pdf) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const keys = new Set();
    const tx = db.transaction(STORE, "readonly");
    tx.oncomplete = () => { db.close(); resolve(keys); };
    tx.onerror = tx.onabort = () => { db.close(); reject(fail("storage")); };
    const c = tx.objectStore(STORE).openCursor(range(pdf));
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return;
      if (isChunkKey(cur.key) ? thumbsFresh(cur.value, pdf) : !isStale(cur.value, pdf)) keys.add(cur.key);
      cur.continue();
    };
  });
}

// How many of the book's pages are saved here (up to date).
export async function savedCount(pdf) {
  try { return [...(await freshKeys(pdf))].filter((k) => !isChunkKey(k)).length; } catch { return 0; }
}

/* ---------- saving the whole open book, quietly ---------- */
// Once the page on screen and its neighbours are in, the rest of the book (previews first, then pages, nearest the
// reader first) is fetched two at a time, behind anything the reader asks for. It pauses while the app is hidden, waits
// out a lost connection, stops when signed out, and keeps going after the reader is closed.
const saves = new Map();        // id -> { done, total, missing: Set<page>, chunks: Set<k>, stopped }
const saveSubs = new Set();
const tellSave = (id) => saveSubs.forEach((f) => { try { f(id); } catch (e) { console.error(e); } });
// Hears progress of the background save: f(id). Ask savingStatus(id) for the numbers.
export const onSaving = (f) => { saveSubs.add(f); return () => saveSubs.delete(f); };
// { done, total } while a book is being saved, else null.
export const savingStatus = (id) => { const s = saves.get(id); return s ? { done: s.done, total: s.total } : null; };

// A page the reader (not the saver) just kept: it no longer waits in the saver's list.
function markSaved(pdf, n) {
  const s = saves.get(pdf.id);
  if (s && s.missing.delete(n)) { s.done++; tellSave(pdf.id); }
}
const visible = () => new Promise((res) => {
  if (typeof document === "undefined" || document.visibilityState !== "hidden") return res();
  const f = () => { if (document.visibilityState !== "hidden") { document.removeEventListener("visibilitychange", f); res(); } };
  document.addEventListener("visibilitychange", f);
});
const online = () => new Promise((res) => {
  const f = () => { removeEventListener("online", f); clearTimeout(t); res(); };
  const t = setTimeout(f, 20000);
  addEventListener("online", f);
});
// The page (or chunk) of the set nearest `cur`, a little ahead of behind.
const nearest = (set, cur) => {
  let best = null, bd = Infinity;
  for (const n of set) { const d = Math.abs(n - cur) * 2 + (n < cur ? 1 : 0); if (d < bd) { bd = d; best = n; } }
  return best;
};

export async function saveBook(pdf) {
  if (saves.has(pdf.id)) return;
  const s = { done: 0, total: pdf.pages, missing: new Set(), chunks: new Set(), stopped: false };
  saves.set(pdf.id, s);
  const per = pdf.img?.thumbs?.per || 40;
  try {
    const have = await freshKeys(pdf).catch(() => new Set());
    for (let n = 1; n <= pdf.pages; n++) if (!have.has(pageKey(pdf.id, n))) s.missing.add(n);
    if (pdf.img?.thumbs?.per) for (let k = 0; k < chunkCount(pdf.pages, per); k++) if (!have.has(thumbKey(pdf, k))) s.chunks.add(k);
    s.done = pdf.pages - s.missing.size;
    tellSave(pdf.id);
    async function worker() {
      while (!s.stopped) {
        await visible();
        if (s.stopped) return;
        const cur = focus.id === pdf.id && focus.cur ? focus.cur : 1;
        const k = nearest(s.chunks, chunkOf(cur, per).k);
        const n = k == null ? nearest(s.missing, cur) : null;
        if (k == null && n == null) return;
        const set = k != null ? s.chunks : s.missing, item = k ?? n;
        set.delete(item);
        try {
          if (k != null) await getThumbs(pdf, k);
          else { await getPage(pdf, n); s.done++; tellSave(pdf.id); }
        } catch (e) {
          if (e.code === "signed-out" || e.code === "not-owner" || e.code === "storage") { s.stopped = true; return; }
          if (e.code === "offline") { set.add(item); await online(); }   // try again when the connection is back
        }
      }
    }
    await Promise.all([worker(), worker()]);
  } finally {
    if (saves.get(pdf.id) === s) saves.delete(pdf.id);
    tellSave(pdf.id);
  }
}

export async function removeOffline(pdf) {
  const s = saves.get(pdf.id);
  if (s) { s.stopped = true; saves.delete(pdf.id); }
  epochs.set(pdf.id, epoch(pdf.id) + 1);
  for (const key of [...chunks.keys()]) if (key.startsWith(`${pdf.id}-t`)) chunks.delete(key);
  await run("readwrite", (st) => st.delete(range(pdf)));
  tellSave(pdf.id);
}
