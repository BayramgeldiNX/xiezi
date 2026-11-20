// 书架 Shelf (#/shelf): the owner's textbook PDFs. The files never leave the device; each one is
// picked once and kept in IndexedDB (src/pdf/store.js). Rows open #/pdf/<id>.
import { $, esc } from "../lib/util.js";
import { icon } from "../lib/icons.js";
import { BOOKS } from "../data/index.js";
import { pdfsForBook } from "../pdf/pages.js";
import { savePdf, hasPdfs, removePdf } from "../pdf/store.js";

let have = new Set();   // ids on this device
let manage = false;
let busy = null;        // id being saved
let ask = null;         // { id, kind: "size" | "remove", file? } an inline confirm on one row
let error = "";
let used = "";          // "123 MB used by this app", when the browser can tell
let pickFor = null;     // the row the file picker was opened for
let input = null;
let token = 0;

const mb = (n) => `${n >= 1e8 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1)} MB`;
const body = () => $("#shelfBody");

function row(p) {
  const on = have.has(p.id), isBusy = busy === p.id, a = ask?.id === p.id ? ask : null;
  const text = `<b>${esc(p.title)}</b><small>${esc(p.en)} · ${p.pages} pages</small>`;
  let side = "";
  if (isBusy) side = `<span class="row-n" role="status">Saving…</span>`;
  else if (a?.kind === "size") side = `<span class="pdf-ask">This file is a different size from the expected one. Use it anyway?</span><span class="pdf-acts"><button class="btn" type="button" data-act="use">Use</button><button class="btn link" type="button" data-act="cancel">Cancel</button></span>`;
  else if (a?.kind === "remove") side = `<span class="pdf-ask">Remove from this device?</span><span class="pdf-acts"><button class="btn" type="button" data-act="remove-yes">Remove</button><button class="btn link" type="button" data-act="cancel">Cancel</button></span>`;
  else if (!on) side = `<button class="btn ghost" type="button" data-act="add">Add PDF</button>`;
  else if (manage) side = `<span class="pdf-acts"><button class="btn link" type="button" data-act="add">Replace</button><button class="btn link" type="button" data-act="remove">Remove</button></span>`;
  else side = `<span class="row-n">On device</span><span class="chev" aria-hidden="true">${icon("next")}</span>`;
  const main = on && !manage && !isBusy && !a
    ? `<a class="pdf-main" href="#/pdf/${p.id}">${text}</a>`
    : `<div class="pdf-main">${text}</div>`;
  return `<div class="pdf-row${a ? " asking" : on && manage ? " managing" : ""}" data-id="${p.id}">${main}<div class="pdf-side">${side}</div></div>`;
}

function render() {
  const el = body();
  if (!el) return;
  const groups = BOOKS.map((b) => ({ b, list: pdfsForBook(b.id) })).filter((g) => g.list.length);
  el.querySelector("#shelfList").innerHTML = `
    <div class="shelf-bar"><span class="muted">${have.size} of ${groups.reduce((n, g) => n + g.list.length, 0)} on this device</span>
      <button class="btn link" type="button" id="shelfManage" aria-pressed="${manage}">${manage ? "Done" : "Manage"}</button></div>
    ${groups.map((g) => `<section class="shelf-group"><h3>${esc(g.b.title)}<span class="muted">${esc(g.b.part || "")}</span></h3><div class="lesson-list">${g.list.map(row).join("")}</div></section>`).join("")}
    ${error ? `<p class="shelf-err" role="alert">${esc(error)}</p>` : ""}
    <p class="muted shelf-note">PDFs stay on this device only. Add them once on each device.${used ? ` <span>${esc(used)}</span>` : ""}</p>`;
}

async function refresh() {
  const my = ++token;
  try { const s = await hasPdfs(); if (my === token) { have = s; error = ""; } }
  catch (e) { if (my === token) error = e.message; }
  try {
    const est = await navigator.storage?.estimate?.();
    if (my === token) used = est?.usage > 1e5 ? `${mb(est.usage)} used by this app.` : "";
  } catch { used = ""; }
  render();
}

async function store(id, file) {
  busy = id; ask = null; error = ""; render();
  try { await savePdf(id, file); have.add(id); }
  catch (e) { error = e.message; }
  busy = null;
  await refresh();
}

function picked(file) {
  const id = pickFor;
  pickFor = null;
  if (!id || !file) return;
  const pdf = BOOKS.flatMap((b) => pdfsForBook(b.id)).find((x) => x.id === id);
  if (pdf && file.size !== pdf.bytes) { ask = { id, kind: "size", file }; error = ""; render(); }
  else store(id, file);
}

function onClick(e) {
  if (e.target.closest("#shelfManage")) { manage = !manage; ask = null; render(); return; }
  const btn = e.target.closest("[data-act]");
  const id = btn?.closest("[data-id]")?.dataset.id;
  if (!btn || !id) return;
  const act = btn.dataset.act;
  if (act === "add") { pickFor = id; input.value = ""; input.click(); }
  else if (act === "use") { const f = ask?.file; if (f) store(id, f); }
  else if (act === "cancel") { ask = null; render(); }
  else if (act === "remove") { ask = { id, kind: "remove" }; render(); }
  else if (act === "remove-yes") {
    ask = null;
    removePdf(id).then(() => { have.delete(id); error = ""; }, (er) => { error = er.message; }).then(refresh);
  }
}

export function openShelf() {
  const el = body();
  if (!el.firstChild) {
    el.innerHTML = `<div id="shelfList" class="inner"></div>`;
    el.addEventListener("click", onClick);
    input = document.createElement("input");
    input.type = "file"; input.accept = "application/pdf,.pdf"; input.hidden = true;
    input.addEventListener("change", () => picked(input.files?.[0]));
    el.append(input);
  }
  manage = false; ask = null; error = "";
  render();
  refresh();
}
