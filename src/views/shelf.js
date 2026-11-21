// 书架 Shelf (#/shelf): the owner's textbooks, on every device. The pages come from the owner's account and
// each page you open is kept on this device (src/pdf/store.js). Rows open #/pdf/<id>. Manage keeps a whole
// book offline. Anyone else sees one quiet line.
import { $, esc } from "../lib/util.js";
import { icon } from "../lib/icons.js";
import { BOOKS } from "../data/index.js";
import { pdfsForBook } from "../pdf/pages.js";
import { savedCount, keepOffline, removeOffline } from "../pdf/store.js";
import { ownerCached, ownerStatus, onSync } from "../sync/sync.js";
import { openAccount } from "./account.js";

let manage = false;
let state = "owner";    // "owner" | "signed-out" | "not-owner"
let saved = {};         // id -> pages saved on this device
let busy = {};          // id -> pages saved so far, while "Keep offline" runs
let errors = {};        // id -> a short message
let used = "";          // "123 MB used by this app", when the browser can tell
let token = 0;
let off = null;

const mb = (n) => `${n >= 1e8 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1)} MB`;
const body = () => $("#shelfBody");

function row(p) {
  const text = `<b>${esc(p.title)}</b><small>${esc(p.en)} · ${p.pages} pages</small>`;
  if (!manage) {
    return `<div class="pdf-row" data-id="${p.id}"><a class="pdf-main" href="#/pdf/${p.id}">${text}</a><div class="pdf-side"><span class="chev" aria-hidden="true">${icon("next")}</span></div></div>`;
  }
  const n = saved[p.id] || 0, run = busy[p.id];
  let side;
  if (run != null) side = `<span class="row-n" role="status">Saving ${run} / ${p.pages}</span>`;
  else if (n >= p.pages) side = `<span class="row-n">Saved</span><button class="btn link" type="button" data-act="remove">Remove offline copy</button>`;
  else side = `${n ? `<span class="row-n">${n} / ${p.pages} saved</span>` : ""}<button class="btn" type="button" data-act="keep">Keep offline</button>${n ? `<button class="btn link" type="button" data-act="remove">Remove</button>` : ""}`;
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
    <p class="muted shelf-note">Pages you open are kept on this device.${used ? ` <span>${esc(used)}</span>` : ""}</p>`;
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
  if (btn.dataset.act === "keep") {
    busy[id] = saved[id] || 0; render();
    keepOffline(p, (done) => { busy[id] = done; if (manage) render(); })
      .catch((er) => { errors[id] = er.message; })
      .then(() => { delete busy[id]; return refresh(); });
  } else if (btn.dataset.act === "remove") {
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
  manage = false; busy = {}; errors = {};
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
