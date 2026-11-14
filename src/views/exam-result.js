// Tests: what the learner sees after handing in. The score counts up, the seal stamps down, then the parts, the weak
// lessons and the mistakes. The paper is marked and saved once (`commit`); drawing it again changes nothing.
// showResult({ book, test, paper, answers, secs, timeUp, host, again }) is the seam the test screen calls.
import { esc } from "../lib/util.js";
import { grade, isRight } from "../exam/grade.js";
import { isAnswered } from "../exam/run.js";
import * as screen from "../lib/screen.js";
import { saveResult, resultOf } from "../exam/store.js";
import { PARTS } from "../exam/plan.js";
import * as progress from "../progress/store.js";
import { sfx } from "../lib/sfx.js";
import { openReport, clock } from "./exam-report.js";

export { clock };

const KIND = { hear: "听词", sentence: "听句子", dialog: "对话", meaning: "词义", pick: "选词", fill: "选词填空", blank: "语法", judge: "判断", reply: "回答", text: "短文", order: "连词成句", hand: "写汉字" };

// What goes to the progress store: every answered question with its own key. Unanswered ones are left out.
export function recordsOf(paper, answers = {}) {
  return paper.parts.flatMap((p) => p.questions)
    .filter((q) => isAnswered(q, answers[q.n]))
    .map((q) => ({ key: q.key, ok: isRight(q, answers[q.n]) }));
}

// Mark, save and record one handed-in paper, once: asked again for the same paper object it returns the first answer.
// `io` is the store (swapped in tests).
const DONE = new WeakMap();
const REAL = { prior: (b, t) => resultOf(b, t)?.best || null, save: saveResult, record: progress.record, session: progress.addSession };
export function commit({ book, test, paper, answers, secs }, io = REAL) {
  if (DONE.has(paper)) return { ...DONE.get(paper), again: true };
  const g = grade(paper, answers), prev = io.prior(book.id, test.id);
  const result = { total: g.total, parts: g.parts.map((p) => p.score), at: Date.now(), secs };
  const { isBest } = io.save(book.id, test.id, result) || {};
  const out = { g, isBest: !!isBest, prev, result };
  DONE.set(paper, out); // set at once: nothing below may ever lead to a second save
  for (const r of recordsOf(paper, answers)) {
    try { io.record(r.key, { ok: r.ok, miss: r.ok ? 0 : 1 }, { quiet: true }); } catch (e) { console.error(e); }
  }
  try { io.session({ type: "test", lesson: 0, title: `${test.cn} ${test.en}`, book: book.id, score: g.parts.reduce((s, p) => s + p.right, 0), total: g.parts.reduce((s, p) => s + p.total, 0), missed: [] }); } catch (e) { console.error(e); }
  return out;
}

/* ---------- Mistakes ---------- */
// A dialogue's lines show who speaks (the 男： tag marks the man, the other lines the woman); a word or a sentence has no speaker.
const heard = (q) => (q.audio || []).map((l) => (q.kind === "dialog" ? (l.startsWith("男：") ? "男 " + l.slice(2) : "女 " + l) : l));
const lines = (q) => [...(q.context || []), ...heard(q), ...(q.text ? [q.text] : [])];
const asked = (q) => q.shape === "write"
  ? `<p class="xr-zh">${esc(q.py || "")}</p><p>${esc(q.en || "")}</p>`
  : q.shape === "order" ? `<p>${esc(q.en || "")}</p>`
  : lines(q).map((l) => `<p>${esc(l)}</p>`).join("");
const mine = (q, a) => q.shape === "choice" ? (Number.isInteger(a) ? esc(q.options[a]) : null)
  : q.shape === "order" ? (isAnswered(q, a) ? esc(a.join("") + (q.tail || "")) : null)
  : "not written correctly";
const rightOf = (q) => q.shape === "choice" ? esc(q.options[q.answer]) : q.shape === "order" ? esc(q.answer.join("") + (q.tail || "")) : `${esc(q.word)} <span class="muted">${esc(q.py || "")} ${esc(q.en || "")}</span>`;

export function mistakesHtml(paper, answers, g) {
  const miss = new Set(g.missed);
  return paper.parts.map((p, pi) => {
    const qs = p.questions.filter((q) => miss.has(q.n));
    if (!qs.length) return "";
    return `<section class="xr-mpart"><h3>${esc(p.cn || PARTS[pi]?.cn)} <span class="muted">${esc(p.en || PARTS[pi]?.en)}</span></h3><ol class="xr-miss">${qs.map((q) => {
      const a = answers[q.n], m = mine(q, a);
      return `<li><div class="xr-mh"><b>${q.n}</b><span>${esc(KIND[q.kind] || q.kind || "")}</span></div><div class="xr-ask">${asked(q)}</div>
        <p class="xr-row"><span class="xr-lab">Your answer</span><span>${m ?? '<i class="muted">no answer</i>'}</span></p>
        <p class="xr-row ok"><span class="xr-lab">Right answer</span><span>${rightOf(q)}</span></p></li>`;
    }).join("")}</ol></section>`;
  }).join("");
}

// Practice only: the check for one retried question. Nothing in this section saves or records anything.
export const retryOk = (q, picked) => (q.shape === "choice" ? picked === q.answer : Array.isArray(picked) && picked.join("") === q.answer.join(""));

/* ---------- Retry missed (practice only: nothing is saved or recorded) ---------- */
function retry(host, items, back) {
  let i = 0, right = 0;
  const bar = (next) => `<div class="controls"><button class="btn primary" type="button" id="xrNext" hidden>${next}</button><button class="btn ghost" type="button" id="xrQuit">Back to the result</button></div>`;
  const step = () => {
    if (i >= items.length) {
      host.innerHTML = `<div class="panel xr-page"><span class="lbl">Retry missed</span><h2 class="xr-h">${right} / ${items.length} right this time</h2><p class="muted">Just practice: your score and the saved result are unchanged.</p>${bar("")}</div>`;
      host.querySelector("#xrQuit").onclick = back;
      return;
    }
    const q = items[i], last = i === items.length - 1;
    host.innerHTML = `<div class="panel xr-page"><span class="lbl">Retry missed · ${i + 1} / ${items.length}</span><div class="xr-ask">${asked(q)}</div>
      <div class="xr-line" id="xrLine" hidden></div><div class="xr-opts" id="xrOpts"></div><div class="xr-fb" id="xrFb" aria-live="polite"></div>${bar(last ? "Finish" : "Next")}</div>`;
    const $ = (s) => host.querySelector(s), opts = $("#xrOpts"), fb = $("#xrFb"), next = $("#xrNext");
    $("#xrQuit").onclick = back;
    next.onclick = () => { i++; step(); };
    const done = (ok, text) => { if (ok) right++; fb.textContent = ok ? "Right" : text; fb.className = "xr-fb " + (ok ? "ok" : "no"); next.hidden = false; next.focus(); };
    const btn = (text) => Object.assign(document.createElement("button"), { type: "button", className: "btn xr-opt", textContent: text });
    if (q.shape === "choice") {
      q.options.forEach((o, k) => {
        const b = btn(o);
        b.onclick = () => {
          opts.querySelectorAll("button").forEach((x, j) => { x.disabled = true; if (j === q.answer) x.classList.add("ok"); });
          if (k !== q.answer) b.classList.add("no");
          done(retryOk(q, k), "The right answer is marked");
        };
        opts.append(b);
      });
    } else {
      const placed = [], line = $("#xrLine"), tiles = [];
      line.hidden = false;
      const draw = () => {
        line.replaceChildren(...placed.map((k) => { const c = btn(q.tiles[k]); c.className = "btn xr-chip"; c.onclick = () => { placed.splice(placed.indexOf(k), 1); tiles[k].disabled = false; draw(); }; return c; }));
        if (!placed.length) line.textContent = "Tap the words in order";
      };
      q.tiles.map((w, k) => [w, k]).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).forEach(([w, k]) => {
        const b = btn(w);
        tiles[k] = b;
        b.onclick = () => {
          b.disabled = true; placed.push(k); draw();
          if (placed.length === q.tiles.length) {
            const ok = retryOk(q, placed.map((i) => q.tiles[i]));
            line.querySelectorAll("button").forEach((x) => { x.disabled = true; });
            done(ok, "Right order: " + q.answer.join("") + (q.tail || ""));
          }
        };
        opts.append(b);
      });
      draw();
    }
  };
  step();
}

/* ---------- The page ---------- */
export function showResult(ctx) {
  const { book, test, paper, answers, secs, timeUp, host, again } = ctx;
  const { g, isBest, prev, result, again: repeat } = commit(ctx);
  const prevTotal = Number(prev?.total) || 0;
  const reduce = !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const missedQs = paper.parts.flatMap((p) => p.questions).filter((q) => g.missed.includes(q.n));
  const retryQs = missedQs.filter((q) => q.shape !== "write");
  const weak = g.weak.filter((w) => w.lost > 0).slice(0, 3);
  const lessonName = (id) => { const l = book.lessons.find((x) => x.id === id); return l ? `Lesson ${l.n}${l.title ? " · " + l.title : ""}` : id; };
  let showMiss = false, skipAnim = !!repeat;

  function page() {
    host.innerHTML = `<div class="panel xr-page">
      <div class="xr-top"><span class="lbl">${esc(book.title)}</span><h2 class="xr-h">${esc(test.cn)} <span class="muted">${esc(test.en)}</span></h2>${timeUp ? `<p class="muted">Time was up</p>` : ""}</div>
      <div class="xr-score"><div class="xr-total"><span aria-hidden="true"><span id="xrN">0</span><small> / ${g.max}</small></span><span class="xr-sr" id="xrSay" role="status"></span></div>
        <div class="xr-sealbox${g.seal ? " has" : ""}">${g.seal ? `<div class="xr-seal" id="xrSeal" aria-label="${esc(g.seal)}">${esc(g.seal)}</div>` : `<p class="xr-none" id="xrSeal">未通过 · not passed yet</p>`}</div>
        <p class="muted xr-line1">Pass line 300${isBest && prev ? ` · <b class="xr-best">新纪录 new best</b> · was ${prevTotal}` : prev && !isBest ? ` · best ${prevTotal}` : ""}</p></div>
      <ul class="xr-parts">${g.parts.map((p, i) => `<li><span class="xr-pn">${esc(PARTS[i].cn)} <span class="muted">${esc(PARTS[i].en)}</span></span><span class="xr-pr">${p.right} / ${p.total}</span><b class="xr-ps">${p.score}</b><span class="xr-bar"><i style="width:${p.score}%"></i></span></li>`).join("")}</ul>
      <p class="muted xr-time">Time taken ${clock(secs)}</p>
      ${weak.length ? `<div class="xr-weak"><h3>Worth another look</h3>${weak.map((w) => `<a class="xr-wl" href="#/lesson/${esc(w.lesson)}/exercises"><span>${esc(lessonName(w.lesson))}</span><span class="muted">lost ${w.lost} points</span></a>`).join("")}</div>` : ""}
      <div class="controls xr-btns"><button class="btn primary big" type="button" id="xrReport">成绩单 Score report</button>
        ${missedQs.length ? `<button class="btn big" type="button" id="xrMiss">See mistakes (${missedQs.length})</button>` : ""}
        <button class="btn big" type="button" id="xrAgain">Take it again</button><a class="btn big" href="#/book/${esc(book.id)}">Back to the book</a></div>
      <div id="xrMissBox" class="xr-missbox" ${showMiss ? "" : "hidden"}>${missedQs.length ? mistakesHtml(paper, answers, g) : ""}${retryQs.length ? `<div class="controls"><button class="btn" type="button" id="xrRetry">Retry missed (${retryQs.length})</button></div>` : ""}</div></div>`;
    const $ = (s) => host.querySelector(s);
    $("#xrAgain").onclick = () => again?.();
    $("#xrReport").onclick = () => openReport(host, { book, test, result, back: () => { skipAnim = true; page(); } });
    $("#xrMiss")?.addEventListener("click", () => { const b = $("#xrMissBox"); b.hidden = !b.hidden; showMiss = !b.hidden; if (showMiss) b.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" }); });
    $("#xrRetry")?.addEventListener("click", () => retry(host, retryQs, () => { skipAnim = true; showMiss = true; page(); }));
    play();
  }

  function play() {
    const n = host.querySelector("#xrN"), seal = host.querySelector("#xrSeal"), say = host.querySelector("#xrSay");
    const quick = skipAnim, land = () => {
      n.textContent = g.total; say.textContent = `${g.total} / ${g.max}`;
      seal.classList.add("land");
      if (g.seal && !quick) sfx("stamp");
    };
    skipAnim = true;
    if (quick || reduce || !g.total) return land();
    let tm = 0, to = 0;
    screen.onLeave(() => { clearInterval(tm); clearTimeout(to); });
    const t0 = Date.now();
    tm = setInterval(() => {
      const f = Math.min(1, (Date.now() - t0) / 1000);
      n.textContent = Math.round(g.total * (1 - (1 - f) ** 3));
      if (f >= 1) { clearInterval(tm); to = setTimeout(land, 250); }
    }, 30);
  }
  page();
}
