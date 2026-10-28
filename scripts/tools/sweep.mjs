// Open every lesson tab and practice mode of a book in headless Edge; report JS errors and empty screens.
// node scripts/tools/sweep.mjs <url> <book> <lessons>
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const BASE = process.argv[2] || "http://localhost:5173/xiezi/";
const BOOK = process.argv[3] || "hsk1", N = +(process.argv[4] || 15);
const edgePath = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const proc = spawn(edgePath, ["--headless=new", "--disable-gpu", "--remote-debugging-port=9352", `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), "xz-sw-"))}`, "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch("http://127.0.0.1:9352/json")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0, where = ""; const pending = new Map(), problems = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") problems.push(`[${where}] ${m.params.exceptionDetails.exception?.description?.split("\n")[0]}`);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push(`[${where}] console: ${m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 150)}`);
});
const send = (method, params = {}) => new Promise((r) => {
  const my = ++id;
  pending.set(my, r);
  ws.send(JSON.stringify({ id: my, method, params }));
  setTimeout(() => { if (pending.has(my)) { pending.delete(my); problems.push(`[${where}] timed out: ${method}`); r(null); } }, 15000);
});
const js = async (code) => (await send("Runtime.evaluate", { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true }))?.result?.value;
await send("Runtime.enable");
await send("Page.navigate", { url: BASE });
await sleep(1500);
await js(`localStorage.setItem('xz-settings', JSON.stringify({ ...(JSON.parse(localStorage.getItem('xz-settings') || '{}')), autoplay: true })); return 1`);
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
let modes = 0;
for (let n = 1; n <= N; n++) {
  console.log(`${BOOK} lesson ${n}… (${problems.length} problems so far)`);
  for (const tab of ["write", "listen", "speak", "read", "words"]) {
    where = `${BOOK} L${n} ${tab}`;
    await send("Page.navigate", { url: `${BASE}#/lesson/${BOOK}/${n}/${tab}` });
    await sleep(tab === "write" ? 1800 : 900);
    const list = await js(`return [...document.querySelectorAll('#tab-${tab} [data-mode]')].map(b => b.dataset.mode)`) || [];
    if (tab === "write") {
      const ok = await js(`return !!document.querySelector('#writeStudy svg, #writeStudy canvas')`);
      if (!ok) problems.push(`[${where}] no stroke drawing`);
      continue;
    }
    for (const m of list) {
      where = `${BOOK} L${n} ${tab}/${m}`;
      const r = await js(`
        const b = document.querySelector('#tab-${tab} [data-mode="${m}"]'); if (!b) return 'no button';
        b.click(); await new Promise(r => setTimeout(r, ${m === "texts" || m === "grammar" ? 1500 : 500}));
        const host = document.querySelector('#tab-${tab}');
        const t = host.innerText.trim();
        const c = host.querySelector('.choice, .tile, .rd-item, .card, .match, button.tok, .gr-note, .wl, li, button:not([data-back])');
        if (c && '${m}' !== 'list') c.click();
        await new Promise(r => setTimeout(r, 300));
        const back = host.querySelector('[data-back]'); if (back) back.click();
        await new Promise(r => setTimeout(r, 200));
        if (location.hash.indexOf('${tab}') < 0) history.back();
        return /Not enough|undefined|NaN|\\[object/.test(t) ? 'BAD: ' + t.slice(0, 120) : t.length < 10 ? 'EMPTY' : 'ok';`);
      modes++;
      if (r !== "ok") problems.push(`[${where}] ${r}`);
      await send("Page.navigate", { url: `${BASE}#/` });
      await sleep(300);
      await send("Page.navigate", { url: `${BASE}#/lesson/${BOOK}/${n}/${tab}` });
      await sleep(600);
    }
  }
}
where = "review";
await send("Page.navigate", { url: `${BASE}#/book/${BOOK}/review` });
await sleep(1500);
const rv = await js(`return document.body.innerText.includes('Grammar')`);
if (!rv) problems.push("[review] no Grammar card");
ws.close(); proc.kill();
console.log(`${modes} modes opened`);
console.log(problems.length ? problems.join("\n") : "No problems found.");
