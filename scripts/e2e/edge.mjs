// Edge cases: offline, broken links, fast tapping, rotation mid-exercise, Paper theme, keyboard,
// and saved data from older versions. Usage: npm run test:edge [-- <url> <screenshot folder>]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const [, , base = "https://bayramgeldinx.github.io/xiezi/", outDir = fs.mkdtempSync(path.join(os.tmpdir(), "xz-edge-shots-"))] = process.argv;
const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "xz-edge-"));
const proc = spawn(edge, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=9335", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch("http://127.0.0.1:9335/json")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0, where = "";
const pending = new Map(), errors = [], results = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") errors.push(`[${where}] ${m.params.exceptionDetails.exception?.description?.split("\n")[0]}`);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(`[${where}] console.error: ${m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 160)}`);
});
const send = (method, params = {}) => new Promise((r) => {
  const my = ++id;
  pending.set(my, r);
  ws.send(JSON.stringify({ id: my, method, params }));
  setTimeout(() => { if (pending.has(my)) { pending.delete(my); r({ timeout: true }); } }, 60000);
});
const js = async (code) => {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true });
  if (r?.exceptionDetails) return { error: r.exceptionDetails.exception?.description?.split("\n")[0] };
  return r?.result?.value;
};
const check = (name, ok, info = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${info ? `  (${info})` : ""}`);
const size = (w, h, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
// Always arrive from Home, like a person would (re-opening the same address changes nothing).
const go = async (hash, wait = 1200) => { await send("Page.navigate", { url: base + "#/" }); await sleep(200); await send("Page.navigate", { url: base + hash }); await sleep(wait); };
const page = () => js(`return ['home','typingView','booksView','bookView','lessonView'].find(id => !document.getElementById(id).hidden)`);
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); if (s?.data) fs.writeFileSync(path.join(outDir, name + ".png"), Buffer.from(s.data, "base64")); };
const W = "await new Promise(r => setTimeout(r, 400));";
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");

try {
  /* 1. Broken and odd links always land somewhere sensible */
  where = "links";
  await size(393, 852, true);
  await go("", 3000);
  for (const [hash, want] of [["#/lesson/nope/9/write", "home"], ["#/book/nope", "home"], ["#/zzz", "home"],
    ["#/lesson/kouyu-rumen/1/zzz", "lessonView"], ["#/lesson/kouyu-rumen/1/tones", "lessonView"], ["#/book/kouyu-rumen/zzz", "bookView"]]) {
    await go(hash);
    const p = await page();
    check(`link ${hash} → ${want}`, p === want, p);
  }
  const tab = await js(`return document.querySelector('.tab[aria-selected=true]')?.dataset.tab`);
  check("old tab name 'tones' opens the Listen tab", (await go("#/lesson/kouyu-rumen/1/tones"), await js(`return document.querySelector('.tab[aria-selected=true]')?.dataset.tab`)) === "listen");

  /* 2. Saved place from an older version still works for Continue */
  where = "old data";
  await js(`localStorage.setItem('hz-state', JSON.stringify({ lesson: 0, word: 2, tab: 'cards' })); return 1;`);
  await go("#/");
  await go("", 1500);
  const cont = await js(`return document.querySelector('#resume')?.innerText.replace(/\\s+/g,' ')`);
  check("Continue works with old saved data (cards → Words)", /第一课/.test(cont || "") && /Words/.test(cont || ""), cont);
  await js(`document.querySelector('#resume').click(); ${W} return 1;`);
  check("Continue opens the Words tab", (await js(`return document.querySelector('.tab[aria-selected=true]')?.dataset.tab`)) === "words");

  /* 3. Fast tapping: tabs, modes, back, 60 random taps */
  where = "fast taps";
  await go("#/lesson/kouyu-rumen/1/write");
  const before = errors.length;
  await js(`
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    for (let i = 0; i < 60; i++) {
      const choices = [...document.querySelectorAll('.tab, [data-mode], [data-wmode], [data-back], .choice, #dictShow, #fcFlip, .tile, .rd-item, .tok, #oPool .chip, [data-m]')].filter(b => b.offsetParent && !b.disabled);
      if (choices.length) pick(choices).click();
      await new Promise(r => setTimeout(r, 40 + Math.random() * 80));
    }
    return 1;`);
  await sleep(800);
  check("60 fast random taps in a lesson: no errors", errors.length === before, errors.slice(before).join(" | "));

  /* 4. Rotation in the middle of a writing exercise */
  where = "rotation";
  await size(1280, 800);
  await go("#/lesson/kouyu-rumen/1/write", 1500);
  await js(`document.querySelector('[data-wmode=dict]').click(); ${W} document.querySelector('#dictStart').click(); ${W} return 1;`);
  await size(800, 1280);
  await sleep(1200);
  const fit = await js(`const b = document.querySelector('#writePractice .dict-boxes .box'), s = b?.querySelector('svg:not(.grid)'); return b && s ? [Math.round(b.getBoundingClientRect().width), Math.round(s.getBoundingClientRect().width)] : null;`);
  check("after rotating, the writing box is redrawn at its new size", fit && Math.abs(fit[0] - fit[1]) <= 2, JSON.stringify(fit));
  check("the exercise is still on screen after rotating", !!(await js(`return !!document.querySelector('#writePractice .dict-boxes') && !document.querySelector('#writePractice').hidden`)));
  await go("#/lesson/kouyu-rumen/1/write", 1500);
  await size(1280, 800);
  await sleep(1200);
  const fit2 = await js(`const b = document.querySelector('#chars .box'), s = b?.querySelector('.hw svg'); return b && s ? [Math.round(b.getBoundingClientRect().width), Math.round(s.getBoundingClientRect().width)] : null;`);
  check("after rotating, the stroke-order box is redrawn", fit2 && fit2[0] > 0 && Math.abs(fit2[0] - fit2[1]) <= 2, JSON.stringify(fit2));

  /* 5. Keyboard (Windows) */
  where = "keyboard";
  await size(1440, 900);
  await go("#/lesson/kouyu-rumen/1/write", 1500);
  const key = (k) => send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k === " " ? "Space" : k.length === 1 ? "Key" + k.toUpperCase() : k, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37, Escape: 27, " ": 32, "]": 221, "[": 219 }[k] || k.toUpperCase().charCodeAt(0) });
  await key("ArrowRight"); await sleep(300); await key("ArrowRight"); await sleep(300);
  check("→ steps through strokes", /Stroke 2 of/.test(await js(`return document.querySelector('.char .status').textContent`) || ""));
  await key("]"); await sleep(500);
  check("] goes to the next word", (await js(`return document.querySelector('#words [aria-pressed=true]')?.textContent`))?.startsWith("您"));
  await key("Escape"); await sleep(700);
  check("Esc goes back to the book", (await page()) === "bookView");
  await key("Escape"); await sleep(700);
  check("Esc again goes to Books", (await page()) === "booksView");

  /* 6. Paper theme: every main page readable, nothing white */
  where = "paper";
  await size(393, 852, true);
  await js(`localStorage.setItem('xz-theme', JSON.stringify('paper')); return 1;`);
  for (const [name, hash] of [["home", ""], ["book", "#/book/kouyu-rumen"], ["review", "#/book/kouyu-rumen/review"], ["write", "#/lesson/kouyu-rumen/1/write"], ["read", "#/lesson/kouyu-rumen/1/read"], ["typing", "#/typing"]]) {
    await go("#/"); await go(hash, 1500);
    const bg = await js(`return getComputedStyle(document.body).backgroundColor`);
    const white = await js(`return [...document.querySelectorAll('body *')].filter(e => e.offsetParent && getComputedStyle(e).backgroundColor === 'rgb(255, 255, 255)').length`);
    check(`paper theme ${name}: warm background, no pure white`, bg === "rgb(235, 228, 214)" && white === 0, `${bg}, white elements: ${white}`);
    await shot(`paper-${name}`);
  }
  await js(`localStorage.removeItem('xz-theme'); return 1;`);

  /* 7. Offline: works with no internet after the first visit */
  where = "offline";
  await go("", 6000); // let the offline copy finish saving
  const ready = await js(`const r = await navigator.serviceWorker.getRegistration(); return !!r?.active;`);
  check("offline copy installed", ready);
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await go("", 3000);
  check("offline: home opens", (await page()) === "home");
  await go("#/lesson/kouyu-rumen/1/write", 2000);
  check("offline: lesson opens with the writing grid", !!(await js(`return document.querySelector('#chars .hw svg')`)));
  const anyAudio = await js(`const res = await caches.keys().then(k => caches.open(k[0])).then(c => c.keys()); const a = res.find(r => r.url.includes('/audio/')); if (!a) return 'none cached'; const r = await fetch(a.url); return r.ok ? 'ok' : 'status ' + r.status;`);
  check("offline: recordings play from the saved copy", anyAudio === "ok", anyAudio);
  await go("#/typing", 1500);
  check("offline: typing works", (await page()) === "typingView");
  const chip = await js(`return document.querySelector('#accountChip').dataset.status`);
  check("offline: sync shows offline or signed-out (no crash)", ["offline", "signed-out", "starting", "error"].includes(chip), chip);
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
} finally {
  console.log(results.join("\n"));
  console.log(errors.length ? `\nJS errors:\n${[...new Set(errors)].join("\n")}` : "\nNo JS errors.");
  console.log(`Screenshots: ${outDir}`);
  ws.close();
  proc.kill();
}
