// Uploads the private book content (data-src/private/<book>.json and its recordings, which are not
// in the repository) to Firestore, where only the owner's account can read it (see firestore.rules):
//   owners/{uid}                      marks the owner's account
//   books/{book}/private/{n}          { texts, notes } of lesson n, as JSON text
//   books/{book}/audio/{n}            { a: { <recording name>: mp3 bytes } }
// Uses the Firebase CLI login on this computer. Prints no secrets.
//   npm run upload:private [-- --email you@example.com]   (the email is only needed with several accounts)
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const PROJECT = JSON.parse(fs.readFileSync(new URL("../.firebaserc", import.meta.url))).projects.default;
const PRIVATE = new URL("../data-src/private/", import.meta.url);
const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const require = createRequire(path.join(npmRoot, "firebase-tools", "package.json"));
const { configstore } = require("./lib/configstore.js");
const auth = require("./lib/auth.js");

// The owner: the only account, or the one named with --email.
const tmp = path.join(os.tmpdir(), "xz-users.json");
try { execSync(`firebase auth:export "${tmp}" --format=json --project ${PROJECT}`, { stdio: "ignore" }); } catch {}
if (!fs.existsSync(tmp)) throw new Error("Couldn't export accounts. Run `firebase login` and check the VPN.");
const users = JSON.parse(fs.readFileSync(tmp, "utf8")).users || [];
fs.unlinkSync(tmp);
const want = process.argv[process.argv.indexOf("--email") + 1];
const owners = process.argv.includes("--email") ? users.filter((u) => u.email === want) : users;
if (owners.length !== 1) throw new Error(`Found ${users.length} accounts; name the owner with --email.`);
const owner = owners[0].localId;

const { access_token: token } = await auth.getAccessToken(configstore.get("tokens").refresh_token, []);
const api = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
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
    for (const t of new Set(said)) {
      const file = new URL(`audio/${name(t)}.mp3`, PRIVATE);
      if (!fs.existsSync(file)) { missing++; continue; }
      const bytes = fs.readFileSync(file);
      kb += bytes.length / 1024;
      a[name(t)] = { bytesValue: bytes.toString("base64") };
    }
    await put(`books/${book.book}/audio/${n}`, { a: { mapValue: { fields: a } } });
    docs += 2;
  }
  console.log(`${book.book}: ${Object.keys(book.lessons).length} lessons uploaded`);
}
console.log(`${docs} documents, ${Math.round(kb)} KB of recordings${missing ? `, ${missing} lines without a recording (run npm run gen:private-audio)` : ""}`);
