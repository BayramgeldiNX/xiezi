// Book PDFs live on this device only: IndexedDB `xz-pdf`, one object store keyed by pdf id.
// Value: { blob, name, size, savedAt }. Every call rejects with a plain Error the view can show.
const DB = "xz-pdf", STORE = "files";
let persisted = false;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser cannot keep files on the device."));
    let req;
    try { req = indexedDB.open(DB, 1); } catch { return reject(new Error("Storage is not available here (private mode?).")); }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("Storage is not available here (private mode?)."));
    req.onblocked = () => reject(new Error("Storage is busy. Close other tabs of this app and try again."));
  });
}

// Run one request on the store; the db closes when it is done.
async function run(mode, make, failMsg) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      let out;
      const tx = db.transaction(STORE, mode);
      tx.oncomplete = () => resolve(out);
      const fail = () => {
        const e = tx.error || null;
        reject(new Error(e?.name === "QuotaExceededError" ? "Not enough space on this device." : failMsg));
      };
      tx.onerror = fail; tx.onabort = fail;
      const r = make(tx.objectStore(STORE));
      r.onsuccess = () => { out = r.result; };
    });
  } catch (e) {
    throw e instanceof Error ? e : new Error(failMsg);
  } finally { db.close(); }
}

export async function savePdf(id, file) {
  if (!persisted) { persisted = true; try { navigator.storage?.persist?.(); } catch {} }
  const rec = { blob: file, name: file.name || id + ".pdf", size: file.size, savedAt: Date.now() };
  await run("readwrite", (s) => s.put(rec, id), "The file could not be saved on this device.");
  changed(id, true);
  return rec;
}
export async function getPdf(id) {
  return (await run("readonly", (s) => s.get(id), "The file could not be read from this device.")) || null;
}
// The ids that are on this device.
export async function hasPdfs() {
  return new Set(await run("readonly", (s) => s.getAllKeys(), "Could not check the files on this device."));
}
export async function removePdf(id) {
  await run("readwrite", (s) => s.delete(id), "The file could not be removed.");
  changed(id, false);
}

// The ids on this device, kept in memory after the first look (null until then). `onPdfsChange` hears Shelf saves and removals.
let known = null;
const listeners = new Set();
function changed(id, on) {
  if (known) { if (on) known.add(id); else known.delete(id); }
  for (const f of listeners) f(known);
}
export const onPdfsChange = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const knownPdfs = () => known;
export async function pdfSet() {
  try { known = await hasPdfs(); } catch { known = known || new Set(); }
  return known;
}
