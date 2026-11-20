// 书架 reader (#/pdf/<id>[/<page>]): one page at a time, fitted to the screen. The file comes from
// IndexedDB (src/pdf/store.js) and is drawn with pdf.js, loaded only here. Swipe or tap the sides to turn,
// pinch or double-tap to zoom. The page number lives in the address (replaceState, so Back leaves the book).
import { $, store } from "../lib/util.js";
import * as screen from "../lib/screen.js";
import { pdfById, printedLabel, clampPage } from "../pdf/pages.js";
import { getPdf } from "../pdf/store.js";
import { PLACE_KEY, pdfHash, savedPage, withPage, fitSize, renderScale, clampZoom, clampPan, zoomAt, swipeResult, tapZone } from "../pdf/view-math.js";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

let S = null;          // the open book, or null
let openGen = 0;       // a newer open (or leaving) ends an older one that is still loading
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.2, .8, .2, 1)";
const MISSING = `This book's PDF is not on this device yet. <a href="#/shelf">Shelf</a>`;

export const pdfOpenId = () => S?.id ?? null;

let libPromise = null;
function loadLib() {
  libPromise ||= import("pdfjs-dist/legacy/build/pdf.min.mjs").then((m) => { m.GlobalWorkerOptions.workerSrc = workerUrl; return m; });
  return libPromise;
}

function note(html) {
  $("#pdfStage").innerHTML = `<p class="pdfr-note">${html}</p>`;
  showChrome(true);
}

export async function openPdfView(id, wantPage) {
  const gen = ++openGen;
  const dead = () => gen !== openGen;
  S = null;
  const st = $("#pdfStage");
  st.innerHTML = "";
  $("#pdfBar").classList.remove("off");
  document.documentElement.classList.add("pdf-on");
  $("#pdfNo").textContent = "";
  let doc = null;
  screen.onLeave(() => {
    openGen++;
    document.documentElement.classList.remove("pdf-on");
    clearTimeout(chromeTimer);
    if (S) {
      S.dead = true;
      try { S.running?.task?.cancel(); } catch {}
      clearTimeout(S.settleTimer); clearTimeout(S.zoomTimer);
      for (const e of S.entries.values()) drop(e);
    }
    try { (S?.doc || doc)?.destroy(); } catch {}
    S = null;
    st.innerHTML = "";
  });
  const pdf = pdfById(id);
  $("#pdfTitle").textContent = pdf ? pdf.title : "";
  if (!pdf) return note(MISSING);
  let rec = null;
  try { rec = await getPdf(id); } catch {}
  if (dead()) return;
  if (!rec) return note(MISSING);
  st.innerHTML = `<p class="pdfr-note" role="status">Opening…</p>`;
  try {
    const lib = await loadLib();
    const data = await rec.blob.arrayBuffer();
    doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
  } catch (e) {
    console.error(e);
    if (dead()) return;
    return note(`This PDF could not be opened. <a href="#/shelf">Shelf</a>`);
  }
  if (dead()) { try { doc.destroy(); } catch {} return; }
  const total = Math.min(pdf.pages, doc.numPages) || doc.numPages;
  const start = wantPage ? clampPage(pdf, wantPage) : savedPage(store.get(PLACE_KEY, {}), pdf);
  S = { id, pdf, doc, total, cur: Math.min(start, total), z: 1, zs: 1, x: 0, y: 0, dx: 0, sizes: new Map(), entries: new Map(), running: null, box: null, anim: null, dead: false, track: null };
  st.innerHTML = `<div class="pdfr-track"></div>`;
  S.track = st.firstChild;
  measure();
  bindInput(st);
  screen.onKey(onKey);
  screen.onResize(() => { if (!S) return; measure(); layout(); pump(); });
  layout();
  commit();
  showChrome();
  pump();
}

/* ---------- the address, the saved place, the label ---------- */
function commit() {
  const { id, cur, total, pdf } = S;
  try { history.replaceState(history.state, "", pdfHash(id, cur)); } catch {}
  store.set(PLACE_KEY, withPage(store.get(PLACE_KEY, {}), id, cur));
  const p = printedLabel(pdf, cur);
  $("#pdfNo").innerHTML = p != null ? `p. ${p} <small>${cur} / ${total}</small>` : `${cur} / ${total}`;
}

// Called by the router when the address changes inside the open book (a link from a lesson).
export function pdfGoto(page) {
  if (!S) return;
  const n = page ? clampPage(S.pdf, Math.min(page, S.total)) : S.cur;
  if (n !== S.cur) slideTo(n, 0, 0);
  else commit();
}

/* ---------- geometry ---------- */
function measure() {
  const st = $("#pdfStage"), cs = getComputedStyle(st);
  const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
  S.box = { W: st.clientWidth, H: st.clientHeight, l: pl, t: pt, w: Math.max(1, st.clientWidth - pl - pr), h: Math.max(1, st.clientHeight - pt - pb) };
}
const sizeOf = (n) => S.sizes.get(n) || S.sizes.get(S.cur) || S.sizes.values().next().value || { w: 1, h: 1.414 };
const fitOf = (n) => { const s = sizeOf(n); return fitSize(s.w, s.h, S.box.w, S.box.h); };
const dpr = () => Math.min(window.devicePixelRatio || 1, 3);
const curSheet = () => S.track.querySelector(".pdfr-slot.cur .pdfr-sheet");
const centre = () => ({ x: S.box.l + S.box.w / 2, y: S.box.t + S.box.h / 2 });

function layout() {
  const { track, cur, total } = S;
  track.replaceChildren();
  for (const k of [-1, 0, 1]) {
    const n = cur + k;
    if (n < 1 || n > total) continue;
    const slot = document.createElement("div");
    slot.className = "pdfr-slot" + (k === 0 ? " cur" : "");
    slot.style.transform = k ? `translateX(${k * 100}%)` : "";
    const sheet = document.createElement("div");
    sheet.className = "pdfr-sheet"; sheet.dataset.n = n;
    const e = S.entries.get(n);
    if (e?.canvas) sheet.append(e.canvas);
    slot.append(sheet); track.append(slot);
  }
  sizeSheets();
}
function sizeSheets() {
  for (const sheet of S.track.querySelectorAll(".pdfr-sheet")) {
    const f = fitOf(+sheet.dataset.n), b = S.box;
    sheet.style.width = `${f.w}px`; sheet.style.height = `${f.h}px`;
    sheet.style.left = `${b.l + (b.w - f.w) / 2}px`; sheet.style.top = `${b.t + (b.h - f.h) / 2}px`;
  }
  applyView();
}
function applyView() {
  const s = curSheet();
  if (s) s.style.transform = S.z === 1 && !S.x && !S.y ? "" : `translate(${S.x}px, ${S.y}px) scale(${S.z})`;
}
function pan(tx, ty) {
  const f = fitOf(S.cur), b = S.box, p = clampPan(tx, ty, f.w, f.h, b.w, b.h, S.z);
  S.x = p.x; S.y = p.y;
}

/* ---------- drawing: current page first, then its neighbours; one render at a time ---------- */
function drop(e) { if (e.canvas) { e.canvas.width = 0; e.canvas.height = 0; e.canvas = null; } }
function wanted() {
  const out = [{ n: S.cur, z: S.zs }];
  for (const k of [1, -1]) if (S.cur + k >= 1 && S.cur + k <= S.total) out.push({ n: S.cur + k, z: 1 });
  for (const j of out) { const f = fitOf(j.n); j.scale = renderScale(f.w, f.h, dpr(), j.z); j.fw = f.w; }
  return out;
}
const fresh = (j) => { const e = S.entries.get(j.n); return e?.canvas && e.scale >= j.scale * 0.97 && Math.abs(e.fw - j.fw) < 1.5; };
const same = (r, j) => r.n === j.n && Math.abs(r.scale - j.scale) < j.scale * 0.03 && Math.abs(r.fw - j.fw) < 1.5;

async function pump() {
  if (!S || S.dead) return;
  const jobs = wanted();
  if (S.running) {
    // Stale (someone flipped or zoomed): cancel it; its finally block starts the next one.
    if (!jobs.some((j) => same(S.running, j))) { try { S.running.task?.cancel(); } catch {} S.running.stale = true; }
    return;
  }
  const job = jobs.find((j) => !fresh(j));
  if (!job) {
    for (const [n, e] of S.entries) if (Math.abs(n - S.cur) > 1) { drop(e); S.entries.delete(n); }
    return;
  }
  const run = S.running = { n: job.n, scale: job.scale, fw: job.fw, task: null, stale: false };
  const mine = S;
  try {
    const page = await mine.doc.getPage(job.n);
    if (mine.dead || run.stale) return;
    const v1 = page.getViewport({ scale: 1 });
    const known = mine.sizes.has(job.n);
    mine.sizes.set(job.n, { w: v1.width, h: v1.height });
    const f = fitSize(v1.width, v1.height, mine.box.w, mine.box.h);
    const sc = renderScale(f.w, f.h, dpr(), job.z);
    const vp = page.getViewport({ scale: (f.w * sc) / v1.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(vp.width)); canvas.height = Math.max(1, Math.round(vp.height));
    run.task = page.render({ canvas, viewport: vp });
    await run.task.promise;
    if (mine.dead) { canvas.width = 0; return; }
    let e = mine.entries.get(job.n);
    if (!e) mine.entries.set(job.n, e = {});
    drop(e);
    e.canvas = canvas; e.scale = sc; e.fw = f.w;
    const sheet = mine.track.querySelector(`.pdfr-sheet[data-n="${job.n}"]`);
    if (sheet) sheet.replaceChildren(canvas);
    if (!known) sizeSheets();       // the page's shape was a guess until now
    page.cleanup();
  } catch (err) {
    if (err?.name !== "RenderingCancelledException" && !mine.dead) console.error(err);
  } finally {
    if (mine.running === run) mine.running = null;
    if (!mine.dead) pump();
  }
}

/* ---------- turning ---------- */
function finishAnim() {
  if (!S?.anim) return;
  const { a, done } = S.anim;
  S.anim = null; a.onfinish = null; a.cancel(); done();
}
function slideTo(target, dx0 = 0, ms = 220) {
  finishAnim();
  if (target === S.cur) { snapBack(dx0); return; }
  const dir = target > S.cur ? 1 : -1;
  const done = () => {
    S.anim = null; S.cur = target; S.dx = 0; S.z = 1; S.zs = 1; S.x = 0; S.y = 0;
    S.track.style.transform = "";
    layout(); commit(); pump();
  };
  if (reduced() || !ms) { done(); return; }
  const to = -dir * S.box.W;
  const a = S.track.animate([{ transform: `translateX(${dx0}px)` }, { transform: `translateX(${to}px)` }], { duration: ms, easing: EASE, fill: "forwards" });
  S.anim = { a, done };
  a.onfinish = () => { if (S?.anim?.a === a) { S.anim = null; done(); a.cancel(); } };
}
function snapBack(dx0) {
  S.dx = 0;
  S.track.style.transform = "";
  if (!dx0 || reduced()) return;
  const a = S.track.animate([{ transform: `translateX(${dx0}px)` }, { transform: "translateX(0)" }], { duration: 180, easing: EASE });
  a.onfinish = () => a.cancel();
}
function turn(d) { const n = S.cur + d; if (n >= 1 && n <= S.total) slideTo(n, 0, 200); else showChrome(); }

/* ---------- zoom ---------- */
function settleSoon() {
  clearTimeout(S.settleTimer);
  S.settleTimer = setTimeout(() => { if (S) { S.zs = S.z; pump(); } }, 220);
}
function setView(v, ease) {
  const sheet = curSheet();
  const z = clampZoom(v.z);
  S.z = z <= 1.02 ? 1 : z;
  if (S.z === 1) { S.x = 0; S.y = 0; } else pan(v.x, v.y);
  if (ease && sheet && !reduced()) {
    sheet.style.transition = `transform 200ms ${EASE}`;
    clearTimeout(S.zoomTimer);
    S.zoomTimer = setTimeout(() => { sheet.style.transition = ""; }, 230);
  }
  applyView();
  settleSoon();
}
const view = () => ({ z: S.z, x: S.x, y: S.y });
function toggleZoom(px, py) {
  if (S.z > 1.05) setView({ z: 1, x: 0, y: 0 }, true);
  else setView(zoomAt(view(), 2, px, py), true);
}

/* ---------- touch, mouse and wheel ---------- */
function bindInput(st) {
  const ptrs = new Map();
  let g = null, last = null;
  const rel = (e) => { const r = st.getBoundingClientRect(), c = centre(); return { x: e.clientX - r.left - c.x, y: e.clientY - r.top - c.y, rx: e.clientX - r.left }; };
  const mid = (a, b) => { const r = st.getBoundingClientRect(), c = centre(); return { x: (a.x + b.x) / 2 - r.left - c.x, y: (a.y + b.y) / 2 - r.top - c.y }; };

  st.addEventListener("pointerdown", (e) => {
    if (!S || e.button > 0) return;
    finishAnim();
    try { st.setPointerCapture(e.pointerId); } catch {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      g = { mode: S.z > 1 ? "pan" : "swipe", x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, sx: S.x, sy: S.y };
    } else if (ptrs.size === 2) {
      if (S.dx) { S.dx = 0; S.track.style.transform = ""; }
      const [a, b] = [...ptrs.values()];
      g = { mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: S.z, x0: S.x, y0: S.y, m0: mid(a, b) };
    }
  });

  st.addEventListener("pointermove", (e) => {
    if (!S) return;
    if (e.pointerType === "mouse" && !ptrs.size) { showChrome(); return; }
    const p = ptrs.get(e.pointerId);
    if (!p || !g) return;
    p.x = e.clientX; p.y = e.clientY;
    if (g.mode === "pinch") {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()], m = mid(a, b);
      const z = clampZoom(g.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0));
      const v = zoomAt({ z: g.z0, x: g.x0, y: g.y0 }, z, g.m0.x, g.m0.y);
      S.z = z; pan(v.x + (m.x - g.m0.x), v.y + (m.y - g.m0.y));
      applyView(); g.moved = true;
      return;
    }
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.moved && Math.hypot(dx, dy) < 8) return;
    if (g.mode === "swipe") {
      if (!g.moved && Math.abs(dy) > Math.abs(dx) * 1.5) { g.mode = "none"; return; }   // a vertical drag is not a turn
      g.moved = true;
      const edge = (dx > 0 && S.cur === 1) || (dx < 0 && S.cur === S.total);
      S.dx = edge ? dx * 0.25 : dx;
      S.track.style.transform = `translateX(${S.dx}px)`;
    } else if (g.mode === "pan") {
      g.moved = true;
      pan(g.sx + dx, g.sy + dy); applyView();
    }
  });

  const up = (e) => {
    if (!S) return;
    if (!ptrs.delete(e.pointerId) || !g) return;
    if (g.mode === "pinch") {
      if (ptrs.size < 2) {
        if (S.z < 1.05) setView({ z: 1, x: 0, y: 0 }, true); else settleSoon();
        g = ptrs.size ? { mode: "none" } : null;
      }
      return;
    }
    if (ptrs.size) return;
    const was = g;
    g = null;
    if (e.type === "pointercancel") { snapBack(S.dx); return; }
    if (was.mode === "swipe" && was.moved) {
      const r = swipeResult(S.dx, performance.now() - was.t0, S.box.W);
      const n = S.cur + r;
      if (r && n >= 1 && n <= S.total) slideTo(n, S.dx, 200); else snapBack(S.dx);
      return;
    }
    if (was.moved || was.mode === "none") return;
    tap(rel(e));
  };
  st.addEventListener("pointerup", up);
  st.addEventListener("pointercancel", up);

  function tap(p) {
    const now = performance.now();
    if (last && now - last.t < 320 && Math.hypot(p.x - last.x, p.y - last.y) < 40) {
      last.undo?.(); last = null;
      toggleZoom(p.x, p.y);
      return;
    }
    let undo = null;
    if (S.z === 1) {
      const zone = tapZone(p.rx, S.box.W);
      if (zone === "mid") {
        const was = chromeOn();
        if (was) hideChrome(); else showChrome();
        undo = () => (was ? showChrome() : hideChrome());
      } else {
        const from = S.cur, n = from + (zone === "next" ? 1 : -1);
        if (n >= 1 && n <= S.total) { slideTo(n, 0, 160); undo = () => slideTo(from, 0, 0); }
      }
    } else showChrome();
    last = { t: now, x: p.x, y: p.y, undo };
  }

  st.addEventListener("wheel", (e) => {
    if (!S) return;
    if (e.ctrlKey) {
      e.preventDefault();
      const p = rel(e);
      setView(zoomAt(view(), S.z * Math.exp(-e.deltaY * 0.01), p.x, p.y), false);
    } else if (S.z > 1) {
      e.preventDefault();
      pan(S.x - e.deltaX, S.y - e.deltaY); applyView();
    }
  }, { passive: false });
}

/* ---------- keys (PC) ---------- */
function onKey(e) {
  if (!S || e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key;
  if (k === "ArrowRight" || k === "PageDown" || (k === " " && !e.shiftKey)) { turn(1); return true; }
  if (k === "ArrowLeft" || k === "PageUp" || (k === " " && e.shiftKey)) { turn(-1); return true; }
  if (k === "Home") { if (S.cur !== 1) slideTo(1, 0, 0); return true; }
  if (k === "End") { if (S.cur !== S.total) slideTo(S.total, 0, 0); return true; }
  if (k === "+" || k === "=") { setView(zoomAt(view(), S.z * 1.25, 0, 0), true); return true; }
  if (k === "-" || k === "_") { setView(zoomAt(view(), S.z / 1.25, 0, 0), true); return true; }
  if (k === "0") { setView({ z: 1, x: 0, y: 0 }, true); return true; }
  if ((k === "ArrowUp" || k === "ArrowDown") && S.z > 1) { pan(S.x, S.y + (k === "ArrowUp" ? 80 : -80)); applyView(); return true; }
  return false;
}

/* ---------- the top bar: shown on open, fades after a moment ---------- */
let chromeTimer = 0;
const chromeOn = () => !$("#pdfBar").classList.contains("off");
function hideChrome() { clearTimeout(chromeTimer); $("#pdfBar").classList.add("off"); }
// showChrome() shows the bar and starts the fade; showChrome(true) keeps it up (a note is on screen).
function showChrome(keep) {
  const bar = $("#pdfBar");
  clearTimeout(chromeTimer);
  bar.classList.remove("off");
  if (keep === true) return;
  chromeTimer = setTimeout(() => {
    if (bar.matches(":hover, :focus-within")) return showChrome();
    bar.classList.add("off");
  }, 2500);
}
