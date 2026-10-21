// One-time Firebase setup after the project exists (created in the Firebase console).
//
//   npm run setup:firebase -- <project-id>
//
// Creates the web app, writes src/sync/firebase-config.js, creates the Firestore
// database (Hong Kong region) and uploads the security rules.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT } from "./lib.mjs";

const id = process.argv[2];
if (!id) {
  console.error("Usage: npm run setup:firebase -- <project-id>");
  process.exit(1);
}
const fb = (args, opts = {}) => execSync(`firebase ${args} --project ${id}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
const step = (msg) => console.log(`\n▶ ${msg}`);

fs.writeFileSync(path.join(ROOT, ".firebaserc"), JSON.stringify({ projects: { default: id } }, null, 2) + "\n");

step("Web app");
let apps = JSON.parse(fb("apps:list WEB --json")).result || [];
if (!apps.length) {
  fb('apps:create WEB "Xiezi web"');
  apps = JSON.parse(fb("apps:list WEB --json")).result || [];
}
const appId = apps[0].appId;
console.log("  app:", appId);

step("Config → src/sync/firebase-config.js");
const sdk = JSON.parse(fb(`apps:sdkconfig WEB ${appId} --json`)).result;
const cfg = sdk.sdkConfig || sdk;
const keep = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
const config = Object.fromEntries(keep.filter((k) => cfg[k]).map((k) => [k, cfg[k]]));
fs.writeFileSync(path.join(ROOT, "src/sync/firebase-config.js"),
  `// Firebase web config (public by design: access is protected by firestore.rules).\n` +
  `// null = sync not set up yet; the app then works on this device only.\n` +
  `export default ${JSON.stringify(config, null, 2)};\n`);

step("Firestore database (asia-east2, Hong Kong)");
try {
  fb('firestore:databases:create "(default)" --location asia-east2');
  console.log("  created");
} catch (e) {
  const msg = String(e.stderr || e.message);
  if (/already exists/i.test(msg)) console.log("  already exists");
  else { console.error(msg); process.exit(1); }
}

step("Security rules");
fb("deploy --only firestore:rules", { stdio: "inherit" });

console.log(`\n✓ Firebase ready for project ${id}.`);
console.log("  Remember: Authentication → Sign-in method → Email/Password must be enabled in the console.");
