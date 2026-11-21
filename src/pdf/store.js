// Book page images kept on this device: IndexedDB `xz-pages`, one object store keyed "<id>-<NNN>".
// Value: { blob (WebP), w, h, v }. A page comes from here first, else from the owner's Firestore (sync.js)
// and is then saved. Every call rejects with an Error whose message is one short line and whose `code` is
// "signed-out" | "not-owner" | "none" | "offline" | "error" | "storage".
import { pageKey, isStale } from "./pages.js";
import { bookPage } from "../sync/sync.js";

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

const inflight = new Map();
// One page: { blob, w, h, v }. From the device, else downloaded and saved.
export function getPage(pdf, n) {
  const key = pageKey(pdf.id, n);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const rec = await cached(pdf, n);
    if (rec && !isStale(rec, pdf)) return rec;
    const r = await bookPage(pdf.book, pdf.id, n);
    if (r.status !== "ok") {
      if (rec && (r.status === "offline" || r.status === "error")) return rec;   // an older image beats none
      throw fail(r.status);
    }
    const out = { blob: r.blob, w: r.w, h: r.h, v: r.v };
    if (!persisted) { persisted = true; try { navigator.storage?.persist?.(); } catch {} }
    try { await run("readwrite", (s) => s.put(out, key)); } catch (e) { if (e.code !== "storage") throw e; }   // still show it
    return out;
  })();
  inflight.set(key, p);
  const done = () => inflight.delete(key);
  p.then(done, done);
  return p;
}

// Warm the cache for pages the reader will likely show next. Quiet: failures are ignored.
export async function prefetch(pdf, pages) {
  for (const n of pages) {
    if (n < 1 || n > pdf.pages) continue;
    try { await getPage(pdf, n); } catch (e) { if (e.code !== "none") return; }
  }
}

// The keys of this book's pages that are saved here and up to date.
async function freshKeys(pdf) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const keys = new Set();
    const tx = db.transaction(STORE, "readonly");
    tx.oncomplete = () => { db.close(); resolve(keys); };
    tx.onerror = tx.onabort = () => { db.close(); reject(fail("storage")); };
    const c = tx.objectStore(STORE).openCursor(range(pdf));
    c.onsuccess = () => { const cur = c.result; if (cur) { if (!isStale(cur.value, pdf)) keys.add(cur.key); cur.continue(); } };
  });
}

// How many of the book's pages are saved here (up to date).
export async function savedCount(pdf) {
  try { return (await freshKeys(pdf)).size; } catch { return 0; }
}

// Download every page that is not saved yet, a few at a time. onProgress(done, total) after each one.
export async function keepOffline(pdf, onProgress = () => {}, parallel = 3) {
  const have = await freshKeys(pdf).catch(() => new Set());
  const queue = [];
  for (let n = 1; n <= pdf.pages; n++) if (!have.has(pageKey(pdf.id, n))) queue.push(n);
  let finished = pdf.pages - queue.length, error = null;
  onProgress(finished, pdf.pages);
  async function worker() {
    while (queue.length && !error) {
      try { await getPage(pdf, queue.shift()); } catch (e) { error = e; return; }
      onProgress(++finished, pdf.pages);
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));
  if (error) throw error;
}

export async function removeOffline(pdf) {
  await run("readwrite", (s) => s.delete(range(pdf)));
}
