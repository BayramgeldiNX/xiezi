// Firebase login and owner lookup shared by the scripts that write to the real project
// (upload-private.mjs, notebook.mjs). Uses the Firebase CLI login on this computer. Prints no secrets.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

export const PROJECT = JSON.parse(fs.readFileSync(new URL("../.firebaserc", import.meta.url))).projects.default;
export const API = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
// The owner's uid is kept here (never the email), because `firebase auth:export` is slow.
const UID_CACHE = new URL("../.cache/owner-uid", import.meta.url);

export function cachedOwnerUid() {
  try { return fs.readFileSync(UID_CACHE, "utf8").trim() || null; } catch { return null; }
}

// The owner: the only account, or the one named with --email. Falls back to the cached uid unless an email is named.
export function ownerUid({ email, refresh = false } = {}) {
  const cached = cachedOwnerUid();
  if (cached && !email && !refresh) return cached;
  const tmp = path.join(os.tmpdir(), "xz-users.json");
  try { execSync(`firebase auth:export "${tmp}" --format=json --project ${PROJECT}`, { stdio: "ignore" }); } catch {}
  if (!fs.existsSync(tmp)) throw new Error("Couldn't export accounts. Run `firebase login` and check the VPN.");
  const users = JSON.parse(fs.readFileSync(tmp, "utf8")).users || [];
  fs.unlinkSync(tmp);
  const owners = email ? users.filter((u) => u.email === email) : users;
  if (owners.length !== 1) throw new Error(`Found ${users.length} accounts; name the owner with --email.`);
  const uid = owners[0].localId;
  fs.mkdirSync(new URL("./", UID_CACHE), { recursive: true });
  fs.writeFileSync(UID_CACHE, uid + "\n");
  return uid;
}

// An access token for the Firestore REST API, from the Firebase CLI login.
export async function accessToken() {
  const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  const require = createRequire(path.join(npmRoot, "firebase-tools", "package.json"));
  const { configstore } = require("./lib/configstore.js");
  const auth = require("./lib/auth.js");
  const { access_token } = await auth.getAccessToken(configstore.get("tokens").refresh_token, []);
  return access_token;
}
