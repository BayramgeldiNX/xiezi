// Summary of what each device has synced to Firebase: device codes, results per device, last activity.
// Uses the Firebase CLI login on this computer (run `firebase login` first). Prints no secrets.
//   npm run sync:report
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const PROJECT = JSON.parse(fs.readFileSync(new URL("../.firebaserc", import.meta.url))).projects.default;
const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const require = createRequire(path.join(npmRoot, "firebase-tools", "package.json"));
const { configstore } = require("./lib/configstore.js");
const auth = require("./lib/auth.js");

const tmp = path.join(os.tmpdir(), "xz-users.json");
// The Firebase CLI sometimes crashes on exit under Node 24 on Windows after finishing; the file is what matters.
try { execSync(`firebase auth:export "${tmp}" --format=json --project ${PROJECT}`, { stdio: "ignore" }); } catch {}
if (!fs.existsSync(tmp)) throw new Error("Couldn't export accounts. Run `firebase login` and check the VPN.");
const users = JSON.parse(fs.readFileSync(tmp, "utf8")).users || [];
fs.unlinkSync(tmp);

const { access_token: token } = await auth.getAccessToken(configstore.get("tokens").refresh_token, []);
const api = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const list = async (p) => {
  const docs = [];
  let page = "";
  do {
    const r = await (await fetch(`${api}/${p}?pageSize=300${page ? `&pageToken=${page}` : ""}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    docs.push(...(r.documents || []));
    page = r.nextPageToken;
  } while (page);
  return docs;
};
const num = (v) => +(v?.integerValue ?? v?.doubleValue ?? 0);

for (const u of users) {
  console.log(`Account ${u.email} · created ${new Date(+u.createdAt).toLocaleString()} · last sign-in ${new Date(+u.lastSignedInAt).toLocaleString()}`);
  const items = await list(`users/${u.localId}/items`);
  const sessions = await list(`users/${u.localId}/sessions`);
  const devices = {};
  for (const d of items) {
    for (const [dev, v] of Object.entries(d.fields?.d?.mapValue?.fields || {})) {
      const s = v.mapValue.fields;
      const x = (devices[dev] ||= { items: 0, tries: 0, last: 0 });
      x.items++;
      x.tries += num(s.n);
      x.last = Math.max(x.last, num(s.last));
    }
  }
  console.log(`  ${items.length} practiced items, ${sessions.length} finished sessions`);
  const devs = Object.entries(devices);
  if (!devs.length) console.log("  No device has synced any practice yet.");
  for (const [dev, x] of devs) console.log(`  device ${dev}: ${x.items} items, ${x.tries} tries, last practice ${new Date(x.last).toLocaleString()}`);
}
