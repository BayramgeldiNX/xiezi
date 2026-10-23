// End-to-end sync test against the LOCAL Firebase emulators (demo project, nothing real).
// Two separate headless Edge browsers = two devices with separate storage.
// Usage (3 terminals): npm run emulators · npm run dev:emulator · npm run test:sync
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const BASE = "http://127.0.0.1:5174/xiezi/";
const EMAIL = "tester@xiezi.test";                       // emulator-only test account
const PASS = crypto.randomBytes(9).toString("base64url");  // throw-away, never leaves this PC
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); };

async function device(name, port) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `xz-${name}-`));
  const proc = spawn(edge, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0]);
  });
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Runtime.enable");
  await send("Network.enable");
  const js = async (code) => (await send("Runtime.evaluate", { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true }))?.result?.value;
  return {
    name, js, errors, send,
    open: async (hash = "") => { await send("Page.navigate", { url: BASE + hash }); await sleep(2500); },
    status: () => js(`return document.querySelector('#accountChip').dataset.status`),
    waitStatus: async (want, ms = 15000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if ((await js(`return document.querySelector('#accountChip').dataset.status`)) === want) return true; await sleep(300); }
      return false;
    },
    get: (key) => js(`const s = await import('/xiezi/src/progress/store.js'); return s.get(${JSON.stringify(key)});`),
    record: (key, ok) => js(`const s = await import('/xiezi/src/progress/store.js'); s.record(${JSON.stringify(key)}, { ok: ${ok}, miss: ${ok ? 0 : 1} }); return true;`),
    signIn: (create) => js(`
      document.querySelector('#accountChip').click(); await new Promise(r => setTimeout(r, 400));
      const f = document.querySelector('#authForm');
      f.email.value = ${JSON.stringify(EMAIL)}; f.password.value = ${JSON.stringify(PASS)};
      f.querySelector('[data-act=${create ? "up" : "in"}]').click();
      await new Promise(r => setTimeout(r, 2500));
      return document.querySelector('#accountBody .err')?.textContent || 'ok';`),
    close: () => { ws.close(); proc.kill(); },
  };
}

const A = await device("phone", 9341);
const B = await device("tablet", 9342);
try {
  // 1. Device A creates the account.
  await A.open();
  check("A starts signed out", (await A.status()) === "signed-out", await A.status());
  const created = await A.signIn(true);
  check("A creates account", created === "ok", created);
  check("A shows Synced", await A.waitStatus("synced"));

  // 2. A practices: a normal word result, and keys with "/" and "#" (reading results).
  await A.record("w:你", true);
  await A.record("w:你", true);
  await A.record("rq:kouyu-rumen/1/r1#0", true);
  await A.record("o:老师，您好！", false);
  await sleep(1500);
  check("A: no errors after saving", A.errors.length === 0, A.errors.join(" | "));
  check("A still Synced after saving", (await A.status()) === "synced", await A.status());

  // 3. Device B signs in and receives A's results.
  await B.open();
  const signed = await B.signIn(false);
  check("B signs in with the same account", signed === "ok", signed);
  check("B shows Synced", await B.waitStatus("synced"));
  await sleep(2000);
  const bw = await B.get("w:你");
  check("B sees A's writing of 你 (2 perfect)", bw?.n === 2 && bw?.ok === 2, JSON.stringify(bw));
  check("B sees A's reading-question result", (await B.get("rq:kouyu-rumen/1/r1#0"))?.n === 1);
  check("B sees A's sentence result", (await B.get("o:老师，您好！"))?.n === 1);

  // 4. B practices; A gets it live (no reload).
  await B.record("w:你", false);
  await sleep(3000);
  const aw = await A.get("w:你");
  check("A sees B's new result live, totals add up (3 tries, 2 perfect)", aw?.n === 3 && aw?.ok === 2 && aw?.lastOk === false, JSON.stringify(aw));

  // 5. Both offline at the same time, both practice, reconnect: nothing lost.
  const offline = { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 };
  const online = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
  await A.send("Network.emulateNetworkConditions", offline);
  await B.send("Network.emulateNetworkConditions", offline);
  await A.record("d:你好", true);
  await B.record("d:你好", false);
  await A.record("f:谢谢", true);
  await sleep(1500);
  check("A keeps working offline (result saved on device)", (await A.get("d:你好"))?.n === 1);
  await A.send("Network.emulateNetworkConditions", online);
  await B.send("Network.emulateNetworkConditions", online);
  let ad = null, bd = null;
  for (let i = 0; i < 40 && !(ad?.n === 2 && bd?.n === 2); i++) { await sleep(500); ad = await A.get("d:你好"); bd = await B.get("d:你好"); }
  check("After reconnecting, A has both devices' offline results", ad?.n === 2, JSON.stringify(ad));
  check("After reconnecting, B has both devices' offline results", bd?.n === 2, JSON.stringify(bd));
  check("B got A's offline flashcard", (await B.get("f:谢谢"))?.n === 1);

  // 6. Security: without signing in, the database can't be read.
  const uid = await A.js(`const r = indexedDB; return 'skip';`);
  const anon = await fetch("http://127.0.0.1:8080/v1/projects/demo-xiezi/databases/(default)/documents/users");
  check("Not signed in: reading users' data is refused", anon.status === 403, `HTTP ${anon.status}`);

  // 7. Sign out on B: other devices' results disappear there, B's own stay.
  await B.js(`document.querySelector('#accountChip').click(); await new Promise(r => setTimeout(r, 300)); document.querySelector('#signOut').click(); await new Promise(r => setTimeout(r, 1500)); return true;`);
  check("B signed out", (await B.status()) === "signed-out", await B.status());
  const bAfter = await B.get("w:你");
  check("B keeps only its own result after sign-out (1 try)", bAfter?.n === 1, JSON.stringify(bAfter));

  // 8. Reload A: still signed in (remembered), data intact.
  await A.open();
  check("A stays signed in after closing and reopening", await A.waitStatus("synced"));
  check("A data intact after reopen", (await A.get("w:你"))?.n === 3);

  // 9. Private book content: only the owner's account can read it.
  const FS = "http://127.0.0.1:8080/v1/projects/demo-xiezi/databases/(default)/documents";
  const admin = { Authorization: "Bearer owner", "Content-Type": "application/json" }; // emulator-only bypass
  const seed = (doc, fields) => fetch(`${FS}/${doc}`, { method: "PATCH", headers: admin, body: JSON.stringify({ fields }) });
  const texts = [{ title: "测试 · Test", lines: [["A", "你好！", "Nǐ hǎo!", "Hello!"]] }];
  await seed("books/hsk1/private/8", { texts: { stringValue: JSON.stringify(texts) }, notes: { stringValue: JSON.stringify([{ cn: "测试", en: "test note", examples: ["你好！"] }]) } });
  await seed("books/hsk1/audio/8", { a: { mapValue: { fields: {} } } });
  const content = () => A.js(`const c = await import('/xiezi/src/sync/content.js'); const r = await c.lessonContent('hsk1', 8); return r.status + ':' + r.texts.length + ':' + r.notes.length;`);
  check("Signed in but not the owner: book texts refused", (await content()) === "none:0:0", await content());
  const login = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }),
  })).json();
  await seed(`owners/${login.localId}`, { owner: { booleanValue: true } });
  check("Owner: book texts and grammar load", (await content()) === "ok:1:1", await content());
  await A.open("#/lesson/hsk1/8/read");
  const listed = await A.js(`document.querySelector('[data-mode=texts]').click(); await new Promise(r => setTimeout(r, 1500)); return document.querySelector('#tab-read').textContent;`);
  check("Owner: Read tab lists the book's text first", /测试[\s\S]*from the book/.test(listed || ""), (listed || "").slice(0, 80));
  const anonBook = await fetch(`${FS}/books/hsk1/private/8`);
  check("Not signed in: book texts refused", anonBook.status === 403, `HTTP ${anonBook.status}`);

  check("No JS errors on either device", A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(" | "));
} finally {
  A.close(); B.close();
  console.log(results.join("\n"));
}
