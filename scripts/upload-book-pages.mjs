// Uploads the book page images (made by scripts/tools/render-book-pages.py, not in the repository) to
// owner-only Firestore, where only the owner's account can read them (see firestore.rules):
//   books/{book}/pages/{id}-{NNN}   { img: WebP bytes, w, h, n, id, v, bytes }
// Safe to run again: only missing pages, or pages whose stored v or bytes differ from the manifest, are written.
// Uses the Firebase CLI login on this computer. Prints no secrets.
//   npm run upload:pages [-- kouyu hsk1-tb ...] [--dry] [--dir <pages folder>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { accessToken, API, PROJECT } from "./lib-firebase.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const di = args.indexOf("--dir");
const DIR = di >= 0 ? args[di + 1] : path.join(os.homedir(), "Documents", "Books", "app", "pages");
const want = args.filter((a, i) => !a.startsWith("--") && (di < 0 || i !== di + 1));
const meta = JSON.parse(fs.readFileSync(new URL("../src/data/book-pdfs.json", import.meta.url), "utf8")).pdfs;
const pdfs = want.length ? meta.filter((p) => want.includes(p.id)) : meta;
if (want.length && pdfs.length !== want.length) throw new Error("Unknown id in: " + want.join(" "));

const token = await accessToken();
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(url, init) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
      if (r.ok) return r.json();
      if (i >= 5 || (r.status < 500 && r.status !== 429)) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
    } catch (e) {
      if (i >= 5 || /^\d{3} /.test(e.message)) throw e;
    }
    await sleep(1000 * 2 ** i);
  }
}

// The stored pages of a book: name -> { v, bytes }, read without the image bytes.
async function stored(book) {
  const have = new Map();
  let pageToken = "";
  do {
    const q = `pageSize=300&mask.fieldPaths=v&mask.fieldPaths=bytes${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const j = await call(`${API}/books/${book}/pages?${q}`);
    for (const d of j.documents || []) {
      const f = d.fields || {};
      have.set(d.name.split("/").pop(), { v: +(f.v?.integerValue ?? 0), bytes: +(f.bytes?.integerValue ?? -1) });
    }
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return have;
}

const int = (n) => ({ integerValue: String(n) });
let all = 0, allBytes = 0;
for (const p of pdfs) {
  const dir = path.join(DIR, p.id);
  const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const v = p.img?.v ?? 1;
  if (man.length !== p.pages) throw new Error(`${p.id}: manifest has ${man.length} pages, expected ${p.pages}`);
  const have = await stored(p.book);
  const todo = man.filter((m) => {
    const h = have.get(`${p.id}-${String(m.n).padStart(3, "0")}`);
    return !h || h.v !== v || h.bytes !== m.bytes;
  });
  console.log(`${p.id} -> books/${p.book}/pages: ${have.size} stored, ${todo.length} to write`);
  if (dry) { all += todo.length; allBytes += todo.reduce((s, m) => s + m.bytes, 0); continue; }
  let batch = [], size = 0, done = 0;
  const flush = async () => {
    if (!batch.length) return;
    await call(`https://firestore.googleapis.com/v1/${DOCS}:commit`, { method: "POST", body: JSON.stringify({ writes: batch }) });
    done += batch.length;
    console.log(`  ${p.id}: ${done}/${todo.length}`);
    batch = []; size = 0;
  };
  for (const m of todo) {
    const id = `${p.id}-${String(m.n).padStart(3, "0")}`;
    const img = fs.readFileSync(path.join(dir, `${String(m.n).padStart(3, "0")}.webp`));
    if (img.length !== m.bytes) throw new Error(`${id}: file differs from manifest; render again`);
    const b64 = img.toString("base64");
    if (batch.length && (size + b64.length > 6_000_000 || batch.length >= 100)) await flush();
    batch.push({
      update: {
        name: `${DOCS}/books/${p.book}/pages/${id}`,
        fields: { img: { bytesValue: b64 }, w: int(m.w), h: int(m.h), n: int(m.n), id: { stringValue: p.id }, v: int(v), bytes: int(m.bytes) },
      },
    });
    size += b64.length;
    all++; allBytes += m.bytes;
  }
  await flush();
}
console.log(`${dry ? "would write" : "wrote"} ${all} pages, ${(allBytes / 1e6).toFixed(1)} MB`);
