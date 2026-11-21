// Sweep the Radicals section in headless Edge (no installs): the list, every radical's page, every lesson step of
// every radical (the check is answered to the end), and each practice mode. Reports JS errors, console errors, empty
// screens, questions with fewer than 4 options and options with duplicate text.
// node scripts/tools/radical-sweep.mjs [url] [onlyRadical]      url default http://localhost:5173/xiezi/
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const BASE = process.argv[2] || "http://localhost:5173/xiezi/";
const ONLY = process.argv[3];
const core = JSON.parse(fs.readFileSync(new URL("../../src/data/radicals-core.json", import.meta.url), "utf8"));
const radicals = core.stages.flatMap((s) => s.radicals.map((r) => r.r)).filter((r) => !ONLY || r === ONLY);
const edgePath = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const PORT = 9353;
const proc = spawn(edgePath, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), "xz-rs-"))}`, "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break; } catch { await sleep(250); } }
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
  setTimeout(() => { if (pending.has(my)) { pending.delete(my); problems.push(`[${where}] timed out: ${method}`); r(null); } }, 60000);
});
const js = async (code) => (await send("Runtime.evaluate", { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true }))?.result?.value;
await send("Runtime.enable");
await send("Page.navigate", { url: BASE });
await sleep(1500);
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });

const go = async (hash, wait = 700) => { await send("Page.navigate", { url: `${BASE}${hash}` }); await sleep(wait); };
const text = () => js(`return (document.querySelector('#radicalsBody')?.innerText || '').trim()`);
const bad = (t) => !t || t.length < 10 ? "EMPTY" : /undefined|NaN|\[object|\bnull\b/.test(t) ? "BAD: " + t.slice(0, 120) : "";

// Plays a quiz to its end inside the page: checks the options of every question, clicks the first choice, then Next.
// Handles flashcards too (Flip, Got it). Returns { questions, notes, done, end }.
const PLAY = `
  const out = { questions: 0, notes: [] };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 120; i++) {
    await wait(120);
    const choices = [...document.querySelectorAll('#radicalsBody .choice')];
    if (choices.length) {
      out.questions++;
      const texts = choices.map((c) => c.innerText.trim());
      if (choices.length < 4) out.notes.push('only ' + choices.length + ' options in question ' + out.questions + ': ' + texts.join(' | '));
      if (new Set(texts).size < texts.length) out.notes.push('duplicate options in question ' + out.questions + ': ' + texts.join(' | '));
      choices[0].click();
      await wait(150);
      const nx = document.querySelector('#qNext');
      if (!nx || nx.hidden) { out.notes.push('no Next after answer ' + out.questions); break; }
      nx.click();
      continue;
    }
    const flip = document.querySelector('#rcFlip'), got = document.querySelector('#rcGot');
    if (flip) { out.questions++; flip.click(); continue; }
    if (got) { got.click(); continue; }
    if (document.querySelector('.rad-fin, .score')) { out.done = true; break; }
    // Practice ends by going back to the page it started from (the list or the radical's page).
    if (i > 2 && document.querySelector('#radStart, #radContinue, .rad-stage')) { out.done = true; out.left = true; break; }
    if (/Nothing due|No radicals|No guess|Not enough/.test(document.querySelector('#radicalsBody')?.innerText || '')) { out.done = true; out.empty = true; break; }
  }
  if (!out.done) out.notes.push('did not finish');
  out.end = (document.querySelector('#radicalsBody')?.innerText || '').trim().slice(0, 80).replace(/\\s+/g, ' ');
  return out;`;
const play = async () => {
  const r = await js(PLAY);
  if (!r) { problems.push(`[${where}] play returned nothing`); return null; }
  for (const n of r.notes) problems.push(`[${where}] ${n}`);
  if (r.end && bad(r.end)) problems.push(`[${where}] end screen ${bad(r.end)}`);
  return r;
};

let screens = 0, quizzes = 0, questions = 0;
where = "list"; await go("#/radicals", 1200);
let t = await text(); screens++; if (bad(t)) problems.push(`[${where}] ${bad(t)}`);
for (const mode of ["cards", "find", "guess", "due"]) {
  where = `radicals/${mode}`; await go(`#/radicals/${mode}`, 900);
  t = await text(); screens++; if (bad(t)) problems.push(`[${where}] ${bad(t)}`);
  const r = await play(); quizzes++; questions += r?.questions || 0;
}
for (const r of radicals) {
  const enc = encodeURIComponent(r);
  where = `radical ${r}`; await go(`#/radical/${enc}`, 900);
  t = await text(); screens++; if (bad(t)) problems.push(`[${where}] ${bad(t)}`);
  // lesson steps: the dots say how many there are
  where = `radical ${r} lesson 1`; await go(`#/radical/${enc}/learn/1`, 700);
  const steps = (await js(`return +((document.querySelector('.rad-dots')?.getAttribute('aria-label') || '').split(' of ')[1]) || 0`)) || 0;
  if (!steps) problems.push(`[${where}] no step dots`);
  for (let n = 1; n <= steps; n++) {
    where = `radical ${r} lesson step ${n}/${steps}`;
    if (n > 1) await go(`#/radical/${enc}/learn/${n}`, 700);
    t = await text(); screens++;
    if (bad(t)) problems.push(`[${where}] ${bad(t)}`);
    if (n === steps) {
      await sleep(300);
      const res = await play(); quizzes++; questions += res?.questions || 0;
      if (res && res.questions < 3) problems.push(`[${where}] check had only ${res.questions} questions`);
    }
  }
  for (const mode of ["cards", "find", "guess"]) {
    where = `radical ${r} ${mode}`; await go(`#/radical/${enc}/${mode}`, 700);
    const res = await play(); quizzes++; questions += res?.questions || 0;
  }
}
console.log(`radical-sweep: ${radicals.length} radicals, ${screens} screens, ${quizzes} quizzes, ${questions} questions`);
console.log(problems.length ? `${problems.length} problem(s):\n` + problems.join("\n") : "clean");
ws.close(); proc.kill();
process.exit(problems.length ? 1 : 0);
