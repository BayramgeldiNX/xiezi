// Full debug pass: open every page and every practice mode at several screen sizes in headless Edge,
// tap through the first steps, and report JS errors, console errors, sideways overflow and tiny tap targets.
// node scripts/tools/debug.mjs <url> <outdir>
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const [, , base, outDir] = process.argv;
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
const STEPS = [
  ["home", ""],
  ["books", "#/books"],
  ["book", "#/book/kouyu-rumen"],
  ["lesson-write", "#/lesson/kouyu-rumen/1/write", `document.querySelector('[data-m=step]').click(); ${W} document.querySelector('[data-a=next]').click(); ${W} document.querySelector('[data-m=quiz]').click(); ${W}`],
  ["lesson-dict", "#/lesson/kouyu-rumen/1/dict", `document.querySelector('#dictStart').click(); ${W} document.querySelector('#dictHint').click(); document.querySelector('#dictShow').click(); ${W}`],
  ["lesson-cards", "#/lesson/kouyu-rumen/1/cards", `document.querySelector('#fcFlip').click(); ${W} document.querySelector('#fcAgainOne').click(); ${W}`],
  ["lesson-tones", "#/lesson/kouyu-rumen/1/tones", `document.querySelector('[data-src=classic]').click(); ${W} document.querySelector('.tone-opt').click(); ${W}`],
  ["lesson-review", "#/lesson/kouyu-rumen/1/review"],
];
const SKILL_MODES = {
  writing: ["dict", "pinyin", "meaning", "chars"],
  listening: ["pick-word", "pick-meaning", "sentence", "tones"],
  speaking: ["say-word", "say-sentence"],
  reading: ["texts", "text-quiz", "order", "read-pinyin"],
  vocab: ["cards", "match", "quiz-meaning", "quiz-word", "list"],
};
const MODE_STEP = `
  const b = document.querySelector('#skillBody');
  b.querySelector('#dictStart, [data-src=lesson]')?.click(); ${W}
  b.querySelector('.choice')?.click(); ${W}
  b.querySelector('#qNext')?.click(); ${W}
  const t = b.querySelectorAll('.tile'); if (t.length) { t[0].click(); t[1].click(); ${W} }
  b.querySelector('.rd-item')?.click(); ${W}
  b.querySelector('.tok')?.click(); ${W}
  b.querySelector('#oPool .chip')?.click(); ${W}
  b.querySelector('[data-c]')?.click(); ${W}
  b.querySelector('#fcFlip')?.click(); ${W}`;
for (const [sk, modes] of Object.entries(SKILL_MODES)) {
  STEPS.push([`skill-${sk}`, `#/skill/${sk}`]);
  for (const m of modes) STEPS.push([`${sk}-${m}`, `#/skill/${sk}`, `document.querySelector('[data-mode="${m}"]').click(); ${W} ${MODE_STEP}`]);
}
STEPS.push(["settings", "", `document.querySelector('#accountChip').click(); ${W}`]);

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
    if (["home", "lesson-write", "reading-texts", "vocab-match", "settings", "speaking-say-word"].includes(name)) {
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
