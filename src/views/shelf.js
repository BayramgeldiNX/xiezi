// 书架 Shelf (#/shelf): the owner's textbooks, on every device. The pages come from the owner's account. A book
// you open is saved on this device in the background (src/pdf/store.js), so it works at once and offline.
// Rows open #/pdf/<id>; touching a row already starts on its saved page. Manage shows what is saved and removes
// a saved copy. Anyone else sees one quiet line.
import { $, esc, store } from "../lib/util.js";
import { icon } from "../lib/icons.js";
import { BOOKS } from "../data/index.js";
import { pdfsForBook } from "../pdf/pages.js";
import { savedCount, removeOffline, openHint, onSaving, savingStatus } from "../pdf/store.js";
import { ownerCached, ownerStatus, onSync, warmBooks } from "../sync/sync.js";
import { PLACE_KEY, savedPage } from "../pdf/view-math.js";
import { openAccount } from "./account.js";

let manage = false;
let state = "owner";    // "owner" | "signed-out" | "not-owner"
let saved = {};         // id -> pages saved on this device
let errors = {};        // id -> a short message
let used = "";          // "123 MB used by this app", when the browser can tell
let token = 0;
let off = null;
let offSave = null;

const mb = (n) => `${n >= 1e8 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1)} MB`;
const body = () => $("#shelfBody");

function row(p) {
  const text = `<b>${esc(p.title)}</b><small>${esc(p.en)} · ${p.pages} pages</small>`;
  if (!manage) {
    return `<div class="pdf-row" data-id="${p.id}"><a class="pdf-main" href="#/pdf/${p.id}">${text}</a><div class="pdf-side"><span class="chev" aria-hidden="true">${icon("next")}</span></div></div>`;
  }
  const n = saved[p.id] || 0, run = savingStatus(p.id);
  const rm = `<button class="btn link" type="button" data-act="remove">Remove saved copy</button>`;
  let side;
  if (run) side = `<span class="row-n" role="status">Saving ${run.done} / ${run.total}</span>${rm}`;
  else if (n >= p.pages) side = `<span class="row-n">Saved on this device</span>${rm}`;
  else side = `${n ? `<span class="row-n">${n} / ${p.pages} saved</span>${rm}` : ""}`;
  return `<div class="pdf-row managing" data-id="${p.id}"><div class="pdf-main">${text}${errors[p.id] ? `<small class="shelf-err" role="alert">${esc(errors[p.id])}</small>` : ""}</div><div class="pdf-side">${side}</div></div>`;
}

function render() {
  const el = body();
  if (!el) return;
  const list = el.querySelector("#shelfList");
  if (state === "signed-out") {
    list.innerHTML = `<p class="muted shelf-note"><a href="#" data-signin>Sign in</a> to read your books.</p>`;
    return;
  }
  if (state === "not-owner") { list.innerHTML = `<p class="muted shelf-note">Your books aren't on this account.</p>`; return; }
  const groups = BOOKS.map((b) => ({ b, list: pdfsForBook(b.id) })).filter((g) => g.list.length);
  list.innerHTML = `
    <div class="shelf-bar"><span></span>
      <button class="btn link" type="button" id="shelfManage" aria-pressed="${manage}">${manage ? "Done" : "Manage"}</button></div>
    ${groups.map((g) => `<section class="shelf-group"><h3>${esc(g.b.title)}<span class="muted">${esc(g.b.part || "")}</span></h3><div class="lesson-list">${g.list.map(row).join("")}</div></section>`).join("")}
    <p class="muted shelf-note">A book you open is saved on this device, so it opens at once and works offline.${used ? ` <span>${esc(used)}</span>` : ""}</p>`;
}

async function refresh() {
  const my = ++token;
  const all = BOOKS.flatMap((b) => pdfsForBook(b.id));
  const counts = {};
  for (const p of all) counts[p.id] = await savedCount(p);
  try {
    const est = await navigator.storage?.estimate?.();
    if (my === token) used = est?.usage > 1e5 ? `${mb(est.usage)} used by this app.` : "";
  } catch { used = ""; }
  if (my !== token) return;
  saved = counts;
  render();
}

function onClick(e) {
  if (e.target.closest("[data-signin]")) { e.preventDefault(); openAccount(); return; }
  if (e.target.closest("#shelfManage")) { manage = !manage; render(); return; }
  const btn = e.target.closest("[data-act]");
  const id = btn?.closest("[data-id]")?.dataset.id;
  const p = id && BOOKS.flatMap((b) => pdfsForBook(b.id)).find((x) => x.id === id);
  if (!btn || !p) return;
  delete errors[id];
  if (btn.dataset.act === "remove") {
    removeOffline(p).catch((er) => { errors[id] = er.message; }).then(refresh);
  }
}

// What this account may see: the device's last answer at once, then the real one.
async function check() {
  state = ownerCached() ? "owner" : state === "owner" ? "not-owner" : state;
  const s = await ownerStatus();
  if (s === "owner" || s === "signed-out" || s === "not-owner") state = s;
  else state = ownerCached() ? "owner" : "signed-out";   // offline or an error: trust the device
  render();
}

export function openShelf() {
  const el = body();
  if (!el.firstChild) {
    el.innerHTML = `<div id="shelfList" class="inner"></div>`;
    el.addEventListener("click", onClick);
  }
  manage = false; errors = {};
  warmBooks();
  if (!el.dataset.hint) {
    el.dataset.hint = "1";
    // A finger on a row: the book's saved page and previews start downloading before the reader opens.
    el.addEventListener("pointerdown", (e) => {
      const id = e.target.closest?.(".pdf-row:not(.managing)")?.dataset.id;
      const p = id && BOOKS.flatMap((b) => pdfsForBook(b.id)).find((x) => x.id === id);
      if (!p) return;
      warmBooks();
      openHint(p, savedPage(store.get(PLACE_KEY, {}), p));
    });
  }
  offSave?.();
  let last = 0, timer = 0;
  offSave = onSaving((id) => {   // the background save moves; the numbers in Manage follow
    if (!manage) { if (!savingStatus(id)) refresh(); return; }
    const done = !savingStatus(id);
    clearTimeout(timer);
    const go = () => { last = Date.now(); if (done) refresh(); else render(); };
    if (done || Date.now() - last > 400) go(); else timer = setTimeout(go, 400);
  });
  state = ownerCached() ? "owner" : "signed-out";
  render();
  refresh();
  check();
  off?.();
  let email;
  off = onSync((s) => {   // signing in or out while the Shelf is open
    const was = email; email = s.email || null;
    if (was !== undefined && was !== email && !el.closest("[hidden]")) check();
  });
}
