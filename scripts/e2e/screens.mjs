// Full debug pass: open every page and every practice mode at several screen sizes in headless Edge,
// tap through the first steps, and report JS errors, console errors, sideways overflow and tiny tap targets.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Usage: npm run dev (in another terminal), then npm run test:screens [-- <url> <screenshot folder>]
const [, , base = "http://localhost:5173/xiezi/", outDir = fs.mkdtempSync(path.join(os.tmpdir(), "xz-shots-"))] = process.argv;
const SIZES = [
  { name: "iphone16", w: 393, h: 852, dpr: 3, mobile: true },
  { name: "mipad-landscape", w: 1280, h: 800, dpr: 1.5, mobile: false },
  { name: "mipad-portrait", w: 800, h: 1280, dpr: 1.5, mobile: false },
  { name: "windows", w: 1440, h: 900, dpr: 1, mobile: false },
];
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "xz-dbg-"));
const proc = spawn(edge, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=9334", `--user-data-dir=${profile}`, "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch("http://127.0.0.1:9334/json")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const problems = [];
let where = "";
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") problems.push(`[${where}] JS error: ${m.params.exceptionDetails.exception?.description?.split("\n")[0] || m.params.exceptionDetails.text}`);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push(`[${where}] console.error: ${m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200)}`);
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !/favicon/.test(m.params.entry.url || "")) problems.push(`[${where}] log: ${m.params.entry.text.slice(0, 200)} ${m.params.entry.url || ""}`);
});
const send = (method, params = {}) => new Promise((r) => {
  const my = ++id;
  pending.set(my, r);
  ws.send(JSON.stringify({ id: my, method, params }));
  setTimeout(() => { if (pending.has(my)) { pending.delete(my); problems.push(`[${where}] step timed out: ${method}`); r(null); } }, 12000);
});
const run = async (js) => {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${js} })()`, awaitPromise: true, returnByValue: true });
  if (r?.exceptionDetails) problems.push(`[${where}] step failed: ${r.exceptionDetails.exception?.description?.split("\n")[0]}`);
  return r?.result?.value;
};
await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");

// Layout checks run on every screen.
const CHECK = `
  const out = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    const wide = [...document.querySelectorAll('body *')].filter(el => el.offsetParent && el.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map(el => el.tagName + '.' + [...el.classList].join('.') + ' ' + (el.textContent||'').trim().slice(0,20));
    out.push('sideways overflow: ' + wide.join(' | '));
  }
  const small = [...document.querySelectorAll('button, a, label.btn')].filter(b => b.offsetParent && !b.closest('[hidden]') && !b.classList.contains('tok')).filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 28 || r.width < 28); }).slice(0, 3).map(b => (b.textContent||b.getAttribute('aria-label')||'').trim().slice(0,15) + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height));
  if (small.length) out.push('small tap targets: ' + small.join(' | '));
  const cut = [...document.querySelectorAll('.btn, .tab, .mode, .chip, .choice')].filter(b => b.offsetParent && b.scrollWidth > b.clientWidth + 2).slice(0, 3).map(b => b.textContent.trim().slice(0, 20));
  if (cut.length) out.push('text cut off in: ' + cut.join(' | '));
  return out;`;

const W = "await new Promise(r => setTimeout(r, 450));";
const B = "#/lesson/kouyu-rumen/1";
// First steps inside any exercise, whichever it is.
const MODE_STEP = (host) => `
  const b = document.querySelector('${host}');
  b.querySelector('#dictStart, [data-src=lesson]')?.click(); ${W}
  b.querySelector('.choice')?.click(); ${W}
  b.querySelector('#qNext')?.click(); ${W}
  const t = b.querySelectorAll('.tile'); if (t.length) { t[0].click(); t[1].click(); ${W} }
  b.querySelector('.rd-item')?.click(); ${W}
  b.querySelector('.tok')?.click(); ${W}
  b.querySelector('#oPool .chip')?.click(); ${W}
  b.querySelector('#fcFlip')?.click(); ${W}`;
// Practice results from 2 days ago, so the book Review has items due.
const SEED = `
  const store = await import('/xiezi/src/progress/store.js'), old = Date.now() - 2 * 864e5, mine = {};
  for (const w of ['你好', '谢谢', '老师', '再见']) for (const pre of ['q:', 'l:', 'd:', 's:']) mine[pre + w] = { n: 1, ok: 1, miss: 0, last: old, lastOk: true, streak: 1 };
  mine['o:老师，您好！'] = { n: 1, ok: 0, miss: 1, last: old, lastOk: false, streak: 0 };
  store.importBackup({ app: 'xiezi', device: 'dev-screens-seed', mine });
  document.querySelector('[data-btab=lessons]').click(); ${W}
  document.querySelector('[data-btab=review]').click(); ${W}`;// Click through a whole review session until the summary appears.
const FINISH_REVIEW = `
  (document.querySelector('#rvMixed') || document.querySelector('#rvAhead')).click(); ${W}
  const b = document.querySelector('#bookReview');
  for (let i = 0; i < 80 && !b.querySelector('#rvDone'); i++) {
    // Build the sentence: tap the words in the right order (the test knows the sentence).
    const need = ['老师', '您', '好'][b.querySelectorAll('#oAnswer .chip').length];
    const chip = [...b.querySelectorAll('#oPool .chip')].find((x) => x.textContent === need);
    const el = chip || b.querySelector('.choice:not(:disabled), #qNext:not([hidden]), #dictShow:not([hidden]), #dictNext:not([hidden]), #sSkip:not([hidden]), #sNext:not([hidden]), #oNext:not([hidden])');
    if (!el) break;
    el.click(); ${W}
  }
  if (!b.querySelector('#rvDone')) throw new Error('review session did not reach its summary: ' + b.innerText.slice(0, 120));`;
const STEPS = [
  ["home", ""],
  ["books", "#/books"],
  ["book", "#/book/kouyu-rumen"],
  ["review-empty", "#/book/kouyu-rumen/review"],
  ["lesson-write", `${B}/write`, `document.querySelector('[data-m=step]').click(); ${W} document.querySelector('[data-a=next]').click(); ${W} document.querySelector('[data-m=quiz]').click(); ${W}`],
];
for (const m of ["dict", "pinyin", "meaning"]) STEPS.push([`write-${m}`, `${B}/write`, `document.querySelector('[data-wmode="${m}"]').click(); ${W} ${MODE_STEP("#writePractice")}`]);
const TAB_MODES = {
  listen: ["pick-word", "pick-meaning", "sentence", "tones"],
  speak: ["say-word", "say-sentence"],
  read: ["texts", "text-quiz", "order", "read-pinyin"],
  words: ["cards", "match", "quiz-meaning", "quiz-word", "list"],
};
for (const [tab, modes] of Object.entries(TAB_MODES)) {
  STEPS.push([`tab-${tab}`, `${B}/${tab}`]);
  for (const m of modes) STEPS.push([`${tab}-${m}`, `${B}/${tab}`, `document.querySelector('#tab-${tab} [data-mode="${m}"]').click(); ${W} ${MODE_STEP(`#tab-${tab}`)}`]);
}
STEPS.push(["review-seeded", "#/book/kouyu-rumen/review", SEED]);
STEPS.push(["review-session", "#/book/kouyu-rumen/review", SEED + FINISH_REVIEW]);
STEPS.push(["settings", "", `document.querySelector('#accountChip').click(); ${W}`]);
const SHOTS = ["home", "book", "review-seeded", "review-session", "lesson-write", "tab-listen", "read-texts", "words-match", "settings"];
for (const s of SIZES) {
  await send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: s.dpr, mobile: s.mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: s.mobile });
  for (const [name, hash, act] of STEPS) {
    where = `${s.name} ${name}`;
    await send("Page.navigate", { url: base + "#/" });   // leave the page so the next one starts fresh
    await sleep(250);
    await send("Page.navigate", { url: base + hash });
    await sleep(name === "home" ? 2500 : 900);
    if (act) await run(act);
    const found = await run(CHECK);
    for (const f of found || []) problems.push(`[${where}] ${f}`);
    if (SHOTS.includes(name)) {
      const shot = await send("Page.captureScreenshot", { format: "png" });
      if (shot?.data) fs.writeFileSync(path.join(outDir, `${s.name}-${name}.png`), Buffer.from(shot.data, "base64"));
    }
    if (process.env.VERBOSE) console.log("done:", where, problems.length);
    if (problems.some((p) => p.includes("timed out"))) { console.log(problems.join("\n")); proc.kill(); process.exit(1); }
  }
}
const uniq = [...new Set(problems)];
console.log(uniq.length ? uniq.join("\n") : "No problems found.");
ws.close();
proc.kill();
