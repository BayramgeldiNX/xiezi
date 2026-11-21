// 书架 reader (#/pdf/<id>[/<page>]): one page at a time, fitted to the screen. Each page is an image from the
// device's page cache (src/pdf/store.js), which fills from the owner's Firestore. Swipe or tap the sides to turn,
// pinch or double-tap to zoom. The page number lives in the address (replaceState, so Back leaves the book).
import { $, store, esc } from "../lib/util.js";
import * as screen from "../lib/screen.js";
import { pdfById, printedLabel, clampPage } from "../pdf/pages.js";
import { getPage, prefetch } from "../pdf/store.js";
import { onSync } from "../sync/sync.js";
import { openAccount } from "./account.js";
import { PLACE_KEY, pdfHash, savedPage, withPage, fitSize, clampZoom, clampPan, zoomAt, swipeResult, tapZone } from "../pdf/view-math.js";

let S = null;          // the open book, or null
let bound = false;     // the stage's touch and mouse handlers are added once
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.2, .8, .2, 1)";

export const pdfOpenId = () => S?.id ?? null;

function note(html) {
  $("#pdfStage").innerHTML = `<p class="pdfr-note"><span>${html}</span></p>`;
  showChrome(true);
}

// Nothing can be shown for this account (signed out, or not the owner): one quiet line, no reader.
function fatal(err) {
  const { id, cur } = S;
  endBook();
  if (err.code !== "signed-out") return note(esc(err.message));
  note(`<a href="#" data-signin>Sign in</a> to read your books.`);
  $("#pdfStage").querySelector("[data-signin]").addEventListener("click", (e) => { e.preventDefault(); openAccount(); });
  const off = onSync((s) => { if (s.email) { off(); openPdfView(id, cur); } });
  screen.onLeave(off);
}

function endBook() {
  if (!S) return;
  S.dead = true;
  clearTimeout(S.zoomTimer);
  for (const e of S.entries.values()) if (e.url) URL.revokeObjectURL(e.url);
  S = null;
}

export function openPdfView(id, wantPage) {
  endBook();
  const st = $("#pdfStage");
  st.innerHTML = "";
  $("#pdfBar").classList.remove("off");
  document.documentElement.classList.add("pdf-on");
  $("#pdfNo").textContent = "";
  screen.onLeave(() => {
    document.documentElement.classList.remove("pdf-on");
    clearTimeout(chromeTimer);
    endBook();
    st.innerHTML = "";
  });
  const pdf = pdfById(id);
  $("#pdfTitle").textContent = pdf ? pdf.title : "";
  if (!pdf) return note("This book isn't on the shelf.");
  const total = pdf.pages;
  const start = wantPage ? clampPage(pdf, wantPage) : savedPage(store.get(PLACE_KEY, {}), pdf);
  S = { id, pdf, total, cur: start, z: 1, x: 0, y: 0, dx: 0, sizes: new Map(), entries: new Map(), box: null, anim: null, dead: false, track: null };
  st.innerHTML = `<div class="pdfr-track"></div>`;
  S.track = st.firstChild;
  measure();
  if (!bound) { bound = true; bindInput(st); }
  screen.onKey(onKey);
  screen.onResize(() => { if (!S) return; measure(); layout(); });
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
    fill(sheet, S.entries.get(n));
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

/* ---------- drawing: current page first, then its neighbours; the next two are only saved ---------- */
// What a sheet holds: the page image, or one quiet line when the page could not be had.
function fill(sheet, e) {
  if (e?.url) {
    const img = new Image();
    img.src = e.url; img.alt = ""; img.draggable = false;
    sheet.replaceChildren(img);
  } else if (e?.err) sheet.innerHTML = `<p class="pdfr-note"><span>${esc(e.err)}</span></p>`;
  else sheet.replaceChildren();
}

function fetchPage(n) {
  const mine = S;
  if (n < 1 || n > mine.total) return Promise.resolve();
  let e = mine.entries.get(n);
  if (e && !e.err) return e.p;
  mine.entries.set(n, e = {});
  e.p = getPage(mine.pdf, n).then((r) => {
    if (S !== mine || mine.entries.get(n) !== e) return;   // left, or the page is out of reach by now
    e.url = URL.createObjectURL(r.blob);
    const known = mine.sizes.has(n);
    mine.sizes.set(n, { w: r.w, h: r.h });
    show(n, e, !known);
  }, (err) => {
    if (S !== mine || mine.entries.get(n) !== e) return;
    if ((err.code === "signed-out" || err.code === "not-owner") && n === mine.cur) return fatal(err);
    e.err = err.message; e.code = err.code;
    show(n, e, false);
  });
  return e.p;
}
function show(n, e, resize) {
  const sheet = S.track.querySelector(`.pdfr-sheet[data-n="${n}"]`);
  if (sheet) fill(sheet, e);
  if (resize) sizeSheets();   // the page's shape was a guess until now
}

function pump() {
  if (!S) return;
  const mine = S, cur = S.cur;
  for (const [n, e] of mine.entries) {
    if (Math.abs(n - cur) > 1) { if (e.url) URL.revokeObjectURL(e.url); mine.entries.delete(n); }
  }
  fetchPage(cur).then(() => {
    if (S !== mine || mine.cur !== cur) return;
    return Promise.all([fetchPage(cur + 1), fetchPage(cur - 1)]);
  }).then(() => {
    if (S === mine && mine.cur === cur && !mine.entries.get(cur)?.err) prefetch(mine.pdf, [cur + 2, cur + 3]);
  });
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
    S.anim = null; S.cur = target; S.dx = 0; S.z = 1; S.x = 0; S.y = 0;
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
        if (S.z < 1.05) setView({ z: 1, x: 0, y: 0 }, true);
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
