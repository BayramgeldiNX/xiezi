// Tests: the score report (成绩单), and the book certificate (结业证书) for a passed final. One card, shown full page in the
// host the result was in; printed on one page, or saved as a picture drawn on a canvas. No name, no email.
//   reportHtml({ book, test, result })              pure: the card as an HTML string
//   openReport(host, { book, test, result, back })  shows the card with Print / Save as picture / Back
//   openBestReport(host, bookId, testId, back)      the same for the saved best result (the book page uses it)
// result: { total, parts: [five scores], at, secs }
import { esc } from "../lib/util.js";
import { BOOKS } from "../data/index.js";
import { testOf, PARTS } from "../exam/plan.js";
import { resultOf } from "../exam/store.js";
import { sealOf } from "../exam/grade.js";

export const clock = (s) => {
  s = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// A saved result may come from another device through sync: every number is coerced and kept in its range.
const num = (x, max) => Math.min(max, Math.max(0, Math.round(Number(x) || 0)));
const dates = (at) => {
  const d = new Date(at);
  return isNaN(d) ? { zh: "—", en: "—" } : { zh: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`, en: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
};

// Everything the card says, as plain data (the HTML and the picture both read it).
export function reportData({ book, test, result }) {
  const total = num(result?.total, 500), dt = dates(result?.at), pass = total >= 300;
  const cert = test.kind === "final" && pass;
  return {
    cert, pass,
    title: cert ? "结业证书" : "成绩单", en: cert ? "Certificate" : "Score report",
    app: "写字本",
    cert1: cert ? `has completed ${book.title}` : null,
    book: book.title, test: `${test.cn} ${test.en}`,
    dateZh: dt.zh, dateEn: dt.en,
    time: clock(result?.secs),
    rows: PARTS.map((p, i) => ({ cn: p.cn, en: p.en, score: num(result?.parts?.[i], 100) })),
    total, seal: sealOf(total / 5, total === 500),
  };
}

export function reportHtml(ctx) {
  const r = reportData(ctx);
  return `<article class="xr-card" id="xrCard">
    <div class="xr-app">${r.app}</div>
    <h2 class="xr-ct">${r.title} <span>· ${r.en}</span></h2>
    ${r.cert1 ? `<p class="xr-cert">${esc(r.cert1)}</p>` : ""}
    <p class="xr-cb">${esc(r.book)}</p><p class="xr-cs">${esc(r.test)}</p>
    <p class="xr-cd">${esc(r.dateZh)} · ${esc(r.dateEn)} · Time taken ${r.time}</p>
    <table class="xr-ctab"><tbody>${r.rows.map((x) => `<tr><td>${esc(x.cn)} <span>${esc(x.en)}</span></td><td class="num">${x.score} / 100</td></tr>`).join("")}
      <tr class="xr-ctot"><td>Total</td><td class="num">${r.total} / 500</td></tr></tbody></table>
    <p class="xr-cpass">Pass line 300</p>
    <div class="xr-cseal">${r.seal ? `<div class="xr-seal land">${esc(r.seal)}</div>` : `<p class="xr-none land">未通过</p>`}</div>
  </article>`;
}

export function openReport(host, { book, test, result, back }) {
  host.innerHTML = `<div class="xr-rpage">${reportHtml({ book, test, result })}
    <div class="controls xr-nobtn"><button class="btn primary" type="button" id="xrPrint">Print</button><button class="btn" type="button" id="xrPic">Save as picture</button><button class="btn ghost" type="button" id="xrBack">Back</button></div></div>`;
  const $ = (s) => host.querySelector(s);
  $("#xrPrint").onclick = () => printCard($("#xrCard"));
  $("#xrPic").onclick = () => savePicture(reportData({ book, test, result }), `xiezi-${book.id}-${test.id}.png`);
  $("#xrBack").onclick = () => (back ? back() : (location.hash = "#/book/" + book.id));
  scrollTo?.(0, 0);
}

export function openBestReport(host, bookId, testId, back) {
  const book = BOOKS.find((b) => b.id === bookId), test = book && testOf(book, testId), best = resultOf(bookId, testId)?.best;
  if (!test || !best) {
    host.innerHTML = `<div class="panel"><p>No result saved yet.</p><button class="btn" type="button" id="xrBack">Back</button></div>`;
    host.querySelector("#xrBack").onclick = () => (back ? back() : history.back());
    return;
  }
  openReport(host, { book, test, result: best, back });
}

// Print only the card: a copy of it goes to the page's top, everything else is hidden by CSS under `xr-printing`.
// The class and the copy go away after printing, so other printouts (the practice sheet) are never touched.
function printCard(card) {
  const root = document.documentElement, copy = Object.assign(document.createElement("div"), { id: "xrPrintRoot", innerHTML: card.outerHTML });
  let t = 0;
  const off = () => { clearTimeout(t); root.classList.remove("xr-printing"); copy.remove(); removeEventListener("afterprint", off); };
  document.body.append(copy);
  root.classList.add("xr-printing");
  addEventListener("afterprint", off);
  t = setTimeout(off, 60000);
  window.print();
}

/* ---------- Save as picture: the card drawn by hand on a canvas, 1200 x 1600 ---------- */
// Fixed colours, whatever the theme: white paper, near-black ink, cinnabar seal (like the print).
async function savePicture(r, name) {
  await document.fonts?.ready;
  const W = 1200, H = 1600, cv = Object.assign(document.createElement("canvas"), { width: W, height: H }), c = cv.getContext("2d");
  const ink = "#1b1814", muted = "#6a6255", red = "#b3312a", line = "#cfc8b8";
  const disp = getComputedStyle(document.documentElement).getPropertyValue("--display").trim() || "serif", body = getComputedStyle(document.body).fontFamily || "sans-serif";
  let y = 0;
  // One line of text; too wide shrinks to 60% of its size, then wraps. Returns the height it used.
  const text = (t, x, size, { font = body, color = ink, align = "center", weight = 400, maxW = 920 } = {}) => {
    let sz = size;
    const set = () => { c.font = `${weight} ${sz}px ${font}`; };
    set();
    while (c.measureText(t).width > maxW && sz > size * 0.6) { sz -= 2; set(); }
    const rows = [];
    let cur = "";
    for (const ch of t) { if (cur && c.measureText(cur + ch).width > maxW) { rows.push(cur); cur = ch; } else cur += ch; }
    rows.push(cur);
    c.fillStyle = color; c.textAlign = align;
    rows.forEach((row, i) => c.fillText(row, x, y + i * sz * 1.2));
    return (rows.length - 1) * sz * 1.2;
  };
  const put = (t, size, gap, o) => { y += text(t, o?.x ?? W / 2, size, o) + gap; };
  c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
  c.strokeStyle = ink; c.lineWidth = 3; c.strokeRect(50, 50, W - 100, H - 100);
  c.lineWidth = 1; c.strokeRect(66, 66, W - 132, H - 132);
  y = 150; put(r.app, 40, 140, { font: disp, color: muted });
  put(r.title, 120, 60, { font: disp, weight: 700 });
  put(r.en, 40, 90, { color: muted });
  if (r.cert1) put(r.cert1, 36, 50);
  put(r.book, 44, 50, { weight: 700 });
  put(r.test, 36, 50, { font: disp });
  put(`${r.dateZh} · ${r.dateEn}`, 30, 44, { color: muted });
  put(`Time taken ${r.time}`, 30, 70, { color: muted });
  const row = (a, b, bold) => {
    text(a, 220, 38, { align: "left", weight: bold ? 700 : 400, maxW: 540 }); text(b, 980, 38, { align: "right", weight: bold ? 700 : 400, maxW: 220 });
    c.strokeStyle = bold ? ink : line; c.lineWidth = bold ? 3 : 1; c.beginPath(); c.moveTo(200, y + 22); c.lineTo(1000, y + 22); c.stroke(); y += 76;
  };
  r.rows.forEach((x) => row(`${x.cn}  ${x.en}`, `${x.score} / 100`));
  row("Total", `${r.total} / 500`, true);
  put("Pass line 300", 30, 0, { color: muted });
  if (r.seal) {
    c.save(); c.translate(W / 2, y + 170); c.rotate(-0.05);
    c.strokeStyle = red; c.lineWidth = 10; c.strokeRect(-110, -110, 220, 220);
    y = 38; text(r.seal, 0, 90, { font: disp, color: red, weight: 700, maxW: 190 });
    c.restore();
  } else { y += 110; text("未通过", W / 2, 56, { font: disp, color: muted }); }
  const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
  if (!blob) return;
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob), a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
