// End-to-end sync test against the LOCAL Firebase emulators (demo project, nothing real).
// Two separate headless Edge browsers = two devices with separate storage.
// Usage (3 terminals): npm run emulators · npm run dev:emulator · npm run test:sync
import { spawn, execFileSync } from "node:child_process";
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

  // 11. Starting the app uploads only what changed, so reopening rewrites nothing.
  const itemTime = async (key) => (await (await fetch(`${FS}/users/${login.localId}/items/${encodeURIComponent(key)}`, { headers: admin })).json()).updateTime;
  const before = await itemTime("w:你");
  await A.open();
  await A.waitStatus("synced");
  await sleep(1500);
  check("Reopening A rewrites nothing in the cloud", !!before && (await itemTime("w:你")) === before, before);
  await A.record("w:好", true);
  await sleep(1500);
  check("A's new result still reaches the cloud", !!(await itemTime("w:好")));
  check("A's older result stays untouched by it", (await itemTime("w:你")) === before);

  // 12. Continue: the newest place reaches the other device, and its Home card updates live.
  await B.open();
  const signedBack = await B.signIn(false);
  check("B signs in again", signedBack === "ok", signedBack);
  await B.waitStatus("synced");
  await A.js(`const s = await import('/xiezi/src/progress/store.js'); s.place.set({ lid: 'hsk2/3', word: 1, tab: 'listen' }); return true;`);
  await sleep(4000);
  check("B receives A's place", (await B.js(`return JSON.parse(localStorage.getItem('hz-state') || '{}').lid`)) === "hsk2/3");
  check("B's Continue card shows it without a reload", /左边那个红色的是我的/.test((await B.js(`return document.querySelector('#resume').textContent`)) || "") && /Listen/.test((await B.js(`return document.querySelector('#resume').textContent`)) || ""));
  const placeTime = await A.js(`return JSON.parse(localStorage.getItem('hz-state')).at`);
  await B.js(`const s = await import('/xiezi/src/progress/store.js'); return s.applyRemotePlace({ lid: 'hsk1/1', word: 0, tab: 'write', at: ${placeTime} - 1000 });`);
  check("An older place never replaces a newer one", (await B.js(`return JSON.parse(localStorage.getItem('hz-state')).lid`)) === "hsk2/3");

  // 13. Notebook: words sync field by field; Claude's fill (scripts/notebook.mjs) never overwrites an edit.
  const nbWord = (d, w) => d.js(`const n = await import('/xiezi/src/notebook/store.js'); return n.getWord(${JSON.stringify(w)});`);
  const nbDo = (d, code) => d.js(`const n = await import('/xiezi/src/notebook/store.js'); ${code}; return true;`);
  const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(400); } return null; };
  const homeStats = (d) => d.js(`return document.querySelector('#reviewMeta').textContent + ' | ' + document.querySelector('#hubMeta').textContent`);
  const homeA = await homeStats(A), homeB = await homeStats(B);

  await nbDo(A, `n.addWord('外卖')`);
  const bGot = await waitFor(async () => (await nbWord(B, "外卖"))?.w === "外卖");
  check("Notebook: A saves a word, B gets it", !!bGot);

  // B edits the meaning before Claude fills the word in.
  await nbDo(B, `n.update('外卖', { en: 'takeout (B)' })`);
  await waitFor(async () => (await nbWord(A, "外卖"))?.en === "takeout (B)");
  const file = path.join(os.tmpdir(), `xz-nb-${crypto.randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(file, JSON.stringify([{
    w: "外卖", py: "wài mài", en: "takeout (Claude)", wordTrick: "Outside + sell.",
    sentence: { cn: "今天我点了外卖。", py: "Jīntiān wǒ diǎn le wàimài.", en: "I ordered takeout today." }, charTricks: { 卖: "sell" },
  }]));
  const out = execFileSync(process.execPath, ["scripts/notebook.mjs", "save", file, "--emulator", "--uid", login.localId], { encoding: "utf8" });
  check("Notebook: save --emulator fills the word", /Saved 1 word/.test(out), out.trim());
  const filled = (d) => waitFor(async () => { const e = await nbWord(d, "外卖"); return e?.status === "filled" ? e : null; });
  const ea = await filled(A), eb = await filled(B);
  check("Notebook: A shows the fill", ea?.py === "wài mài" && ea?.sentence?.cn === "今天我点了外卖。" && ea?.charTricks?.卖 === "sell", JSON.stringify(ea));
  check("Notebook: B shows the fill", eb?.py === "wài mài" && eb?.sentence?.cn === "今天我点了外卖。" && eb?.wordTrick === "Outside + sell.", JSON.stringify(eb));
  check("Notebook: an edit made before the fill is not overwritten (A and B)", ea?.en === "takeout (B)" && eb?.en === "takeout (B)", `${ea?.en} / ${eb?.en}`);

  // A deleted word stays deleted on both devices, and save skips it.
  await nbDo(A, `n.addWord('奶茶')`);
  await waitFor(async () => (await nbWord(B, "奶茶"))?.w === "奶茶");
  await nbDo(B, `n.remove('奶茶')`);
  const gone = await waitFor(async () => (await nbWord(A, "奶茶"))?.deleted === true);
  check("Notebook: a word deleted on B is deleted on A", !!gone);
  fs.writeFileSync(file, JSON.stringify([{ w: "奶茶", py: "nǎi chá", en: "milk tea", wordTrick: "x" }]));
  const out2 = execFileSync(process.execPath, ["scripts/notebook.mjs", "save", file, "--emulator", "--uid", login.localId], { encoding: "utf8" });
  await sleep(1500);
  const ta = await nbWord(A, "奶茶"), tb = await nbWord(B, "奶茶");
  check("Notebook: save skips a deleted word", /Saved 0 words/.test(out2) && /1 deleted/.test(out2), out2.trim());
  check("Notebook: the deleted word stays deleted and empty on both", ta?.deleted === true && tb?.deleted === true && !ta.py && !tb.py, JSON.stringify([ta?.py, tb?.py]));
  const countOut = execFileSync(process.execPath, ["scripts/notebook.mjs", "count", "--emulator", "--uid", login.localId], { encoding: "utf8" }).trim();
  check("Notebook: count ignores filled and deleted words", countOut === "0", countOut);
  fs.unlinkSync(file);

  // Review results (nb:) sync like any other, and book counts on Home don't move.
  await A.record("nb:外卖", true);
  const nbStat = await waitFor(async () => { const r = await B.get("nb:外卖"); return r?.n === 1 ? r : null; });
  check("Notebook: nb: results reach B", !!nbStat);
  await sleep(1000);
  check("Notebook: Home's book counts do not change (A)", (await homeStats(A)) === homeA, `${homeA} -> ${await homeStats(A)}`);
  check("Notebook: Home's book counts do not change (B)", (await homeStats(B)) === homeB, `${homeB} -> ${await homeStats(B)}`);

  // 14. Test results: a result reaches the other device; the better one wins on both, and n counts every hand-in.
  const exDo = (d, code) => d.js(`const e = await import('/xiezi/src/exam/store.js'); ${code}`);
  const exRes = (d) => exDo(d, `return e.resultOf('hsk1', 's1');`);
  const res = (total, at) => `{ total: ${total}, parts: [${total / 5}, ${total / 5}, ${total / 5}, ${total / 5}, ${total / 5}], at: ${at}, secs: 600 }`;
  await exDo(A, `e.saveResult('hsk1', 's1', ${res(300, 1000)}); return true;`);
  const bTest = await waitFor(async () => (await exRes(B))?.best?.total === 300);
  check("Tests: A saves a result, B sees it", !!bTest);
  await exDo(B, `e.saveResult('hsk1', 's1', ${res(400, 2000)}); return true;`);
  const aTest = await waitFor(async () => (await exRes(A))?.best?.total === 400);
  const ra = await exRes(A), rb = await exRes(B);
  check("Tests: B's better result becomes A's best, n is 2 on both", !!aTest && ra?.n === 2 && rb?.n === 2 && ra?.last?.total === 400, JSON.stringify([ra, rb]));

  // B signs out, saves a worse result, signs in again: A's/B's better best stays the best on both devices.
  await B.js(`document.querySelector('#accountChip').click(); await new Promise(r => setTimeout(r, 300)); document.querySelector('#signOut').click(); await new Promise(r => setTimeout(r, 1500)); return true;`);
  await exDo(B, `e.saveResult('hsk1', 's1', ${res(100, 3000)}); return true;`);
  check("Tests: signed out, B still shows its own worse result only", (await exRes(B))?.best?.total === 100);
  check("Tests: B signs in again", (await B.signIn(false)) === "ok");
  await B.waitStatus("synced");
  const okBoth = await waitFor(async () => { const a = await exRes(A), b = await exRes(B); return a?.last?.total === 100 && b?.best?.total === 400 ? [a, b] : null; });
  // Entries are per device: A made 1 attempt, B made 2 (one before signing out, one after), so n is 3 on both.
  check("Tests: the better best is still the best on both, the worse one is the last, n is the sum of the devices",
    !!okBoth && okBoth[0].best.total === 400 && okBoth[1].last.total === 100 && okBoth[0].n === 3 && okBoth[1].n === 3, JSON.stringify(okBoth));

  check("No JS errors on either device", A.errors.length === 0 && B.errors.length === 0, [...A.errors, ...B.errors].join(" | "));
} finally {
  A.close(); B.close();
  console.log(results.join("\n"));
}
