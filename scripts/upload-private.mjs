// Uploads the private book content (data-src/private/<book>.json and its recordings, which are not
// in the repository) to Firestore, where only the owner's account can read it (see firestore.rules):
//   owners/{uid}                      marks the owner's account
//   books/{book}/private/{n}          { texts, notes } of lesson n, as JSON text
//   books/{book}/audio/{n}            { a: { <recording name>: mp3 bytes } }
// Uses the Firebase CLI login on this computer. Prints no secrets.
//   npm run upload:private [-- --email you@example.com]   (the email is only needed with several accounts)
import crypto from "node:crypto";
import fs from "node:fs";
import { ownerUid, accessToken, API } from "./lib-firebase.mjs";

const PRIVATE = new URL("../data-src/private/", import.meta.url);

// The owner: the only account, or the one named with --email.
const want = process.argv[process.argv.indexOf("--email") + 1];
const owner = ownerUid({ email: process.argv.includes("--email") ? want : undefined, refresh: true });
const token = await accessToken();
const api = API;
async function put(doc, fields) {
  const r = await fetch(`${api}/${doc}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`${doc}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}
const str = (s) => ({ stringValue: s });

await put(`owners/${owner}`, { owner: { booleanValue: true } });

const clean = (t) => t.replace(/[AB]: /g, "").trim();
const name = (t) => crypto.createHash("sha1").update(t, "utf8").digest("hex").slice(0, 12);
const MAX_AUDIO_BYTES = 1_030_000;
let docs = 0, kb = 0, missing = 0;
for (const f of fs.readdirSync(PRIVATE).filter((f) => f.endsWith(".json"))) {
  const book = JSON.parse(fs.readFileSync(new URL(f, PRIVATE), "utf8"));
  for (const [n, lesson] of Object.entries(book.lessons)) {
    await put(`books/${book.book}/private/${n}`, {
      texts: str(JSON.stringify(lesson.texts || [])),
      notes: str(JSON.stringify(lesson.notes || [])),
    });
    const said = [...(lesson.texts || []).flatMap((t) => t.lines.map((l) => l[1])), ...(lesson.notes || []).flatMap((x) => x.examples || [])].map(clean);
    const a = {};
    let size = 0;
    for (const t of new Set(said)) {
      const file = new URL(`audio/${name(t)}.mp3`, PRIVATE);
      if (!fs.existsSync(file)) { missing++; continue; }
      const bytes = fs.readFileSync(file);
      // A Firestore document holds 1 MiB. Lines past that have no recording, so the app uses the device's voice.
      if (size + bytes.length > MAX_AUDIO_BYTES) { console.warn(`${book.book} ${n}: no room for the recording of "${t}"`); continue; }
      size += bytes.length;
      kb += bytes.length / 1024;
      a[name(t)] = { bytesValue: bytes.toString("base64") };
    }
    await put(`books/${book.book}/audio/${n}`, { a: { mapValue: { fields: a } } });
    docs += 2;
  }
  console.log(`${book.book}: ${Object.keys(book.lessons).length} lessons uploaded`);
}
console.log(`${docs} documents, ${Math.round(kb)} KB of recordings${missing ? `, ${missing} lines without a recording (run npm run gen:private-audio)` : ""}`);
