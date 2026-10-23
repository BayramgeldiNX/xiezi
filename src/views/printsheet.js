// 字帖 Printable practice sheet for a lesson: per character a model, its stroke order step by step,
// rows to trace and empty rows to write from memory, in 田字格 squares. Print or save as PDF.
import { $, $$, esc, store } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { icon } from "../lib/icons.js";
import { CHARS, STROKE_DATA, lessonChars } from "../data/index.js";

const PER_ROW = 10;
const opts = () => ({ trace: 2, empty: 2, ...store.get("xz-print", {}) });

// One 田字格 square; `strokes` = how many strokes to draw, `shade` = "ink" | "trace" | "next".
function cell(c, strokes = 0, shade = "ink") {
  const d = STROKE_DATA[c];
  const paths = d && strokes ? d.strokes.map((s, i) => {
    if (i >= strokes) return "";
    const cls = shade === "trace" ? "ps-trace" : shade === "steps" && i === strokes - 1 ? "ps-new" : "ps-ink";
    return `<path class="${cls}" d="${s}"/>`;
  }).join("") : "";
  return `<svg class="ps-cell" viewBox="0 0 1024 1024" aria-hidden="true">
    <rect x="8" y="8" width="1008" height="1008" class="ps-box"/>
    <path d="M512 8V1016M8 512H1016M8 8L1016 1016M1016 8L8 1016" class="ps-guide"/>
    <g transform="translate(61,61) scale(0.88) translate(0,900) scale(1,-1)">${paths}</g></svg>`;
}

const row = (cells) => `<div class="ps-row">${cells.join("")}</div>`;
const fill = (cells) => { while (cells.length % PER_ROW) cells.push(cell("")); return cells; };

function block(c, o) {
  const n = STROKE_DATA[c].strokes.length, info = CHARS[c] || {};
  // Model + every stroke step (wrapping onto more rows if needed).
  const steps = [cell(c, n), ...Array.from({ length: n }, (_, i) => cell(c, i + 1, "steps"))];
  const stepRows = [];
  for (let i = 0; i < steps.length; i += PER_ROW) stepRows.push(row(fill(steps.slice(i, i + PER_ROW))));
  const trace = Array.from({ length: o.trace }, () => row(Array.from({ length: PER_ROW }, () => cell(c, n, "trace"))));
  const empty = Array.from({ length: o.empty }, () => row(fill([cell(c, n, "trace")].concat(Array.from({ length: PER_ROW - 1 }, () => cell(""))))));
  return `<section class="ps-char">
    <div class="ps-head"><b>${c}</b><span class="py">${tonePy(info.py || "")}</span><span>${esc(info.en || "")}</span><span class="ps-n">${n} strokes</span></div>
    ${stepRows.join("")}${trace.join("")}${empty.join("")}
  </section>`;
}

export function openPrint(lesson) {
  const all = lessonChars(lesson);
  let picked = new Set(store.get(`xz-print-pick-${lesson.id}`, all));
  const o = opts();
  const render = () => {
    const list = all.filter((c) => picked.has(c));
    $("#printBody").innerHTML = `
      <div class="panel no-print">
        <span class="lbl">字帖 · Practice sheet</span>
        <p>Tap characters to include or leave out. Each one gets its stroke order, rows to trace, and empty squares to write from memory.</p>
        <div class="ps-pick">${all.map((c) => `<button type="button" data-pc="${c}" aria-pressed="${picked.has(c)}">${c}</button>`).join("")}</div>
        <div class="controls">
          <button class="btn" type="button" data-all="1">All</button><button class="btn" type="button" data-all="0">None</button>
          <div class="seg" role="group" aria-label="Trace rows">${[1, 2, 3].map((n) => `<button type="button" data-o="trace" data-v="${n}" aria-pressed="${o.trace === n}">${n} trace row${n > 1 ? "s" : ""}</button>`).join("")}</div>
          <div class="seg" role="group" aria-label="Empty rows">${[1, 2, 3].map((n) => `<button type="button" data-o="empty" data-v="${n}" aria-pressed="${o.empty === n}">${n} empty row${n > 1 ? "s" : ""}</button>`).join("")}</div>
        </div>
        <button class="btn primary big" type="button" id="psPrint" ${list.length ? "" : "disabled"}>${icon("check")} Print / Save as PDF</button>
        <p class="note">iPhone: Share → Print, then pinch the preview outward to save a PDF. Mi Pad and Windows: choose a printer, or "Save as PDF".</p>
      </div>
      <div class="ps-paper">
        <header class="ps-title"><b>${esc(lesson.cn)} · ${esc(lesson.title)}</b><span>写字本 · 姓名 Name: ______________ · 日期 Date: __________</span></header>
        ${list.map((c) => block(c, o)).join("") || `<p class="muted">No characters chosen.</p>`}
      </div>`;
    $$("[data-pc]").forEach((b) => b.addEventListener("click", () => {
      picked.has(b.dataset.pc) ? picked.delete(b.dataset.pc) : picked.add(b.dataset.pc);
      store.set(`xz-print-pick-${lesson.id}`, [...picked]);
      render();
    }));
    $$("[data-all]").forEach((b) => b.addEventListener("click", () => {
      picked = new Set(b.dataset.all === "1" ? all : []);
      store.set(`xz-print-pick-${lesson.id}`, [...picked]);
      render();
    }));
    $$("[data-o]").forEach((b) => b.addEventListener("click", () => {
      o[b.dataset.o] = +b.dataset.v;
      store.set("xz-print", o);
      render();
    }));
    $("#psPrint").addEventListener("click", () => window.print());
  };
  $("#printTitle").textContent = lesson.title;
  render();
}
