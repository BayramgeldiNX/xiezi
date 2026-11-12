// Quiz round: the loop every one-question-at-a-time exercise shares. The exercise draws and checks one
// item; the round does the rest: the head (✕, title, count), focus mode, the Next bar at the bottom,
// the score, saving the session, the results screen (Next, Again, Retry missed, Back), and `then`, which
// hands the result to the book Review's chain instead. Words: see GLOSSARY.md (Round, Item).
//
// runRound(cfg)
//   items      a list, or a function that picks a round ("Again" then picks a new one)
//   ask(x, q)  draws item x with q.draw(html) and calls q.done(ok) once it is answered (ok: right the first
//              time). q.next() moves on at once. May return { skip(), stop() }: skip answers the dock's
//              give-up button, stop ends a microphone or a timer when the round moves on or is left.
//   host()     the element to draw in; back() leaves
//   kind, lesson, session   the saved session (session: extra fields)
//   title      results title; head: the title over the questions (default title), or a function of the item
//   label(x)   names x in the missed list and the saved session (default x.w); missedHtml(x) shows it
//   toggles    the 拼 / 英 switches (default on); pinyin: options for wirePinyin
//   skip       the give-up button's text, or a function of the item; none = no button
//   perfect, scoreNote, more: [{ label, run }]   results text, a note after the score, extra buttons
//   then(res), onDone(right, total)
import { $, $$, esc, revealNext } from "../lib/util.js";
import { icon } from "../lib/icons.js";
import { quizHead, wirePinyin } from "../lib/qpinyin.js";
import * as progress from "../progress/store.js";
import { nextHtml, wireNext } from "./practice.js";

const backHtml = (label = "Back") => `<button class="btn ghost leave" type="button" data-back>${label}</button>`;

// full: the round "Again" starts (the original one, even after "Retry missed").
export function runRound(cfg, full = cfg) {
  const items = typeof cfg.items === "function" ? cfg.items() : cfg.items;
  const host = cfg.host, label = cfg.label || ((x) => x.w);
  let pos = 0, right = 0, cur = null;
  const missed = [], missedItems = [];
  const stop = () => { const c = cur; cur = null; c?.stop?.(); };
  const leave = () => { stop(); cfg.back(); };
  const wireLeave = (el) => $$("[data-back]", el).forEach((b) => b.addEventListener("click", leave));

  if (!items.length) {
    host().innerHTML = `<div class="panel"><p>Not enough here to practise yet.</p>${backHtml()}</div>`;
    return wireLeave(host());
  }

  function show() {
    stop();
    if (pos >= items.length) return end();
    const x = items[pos], last = pos + 1 >= items.length;
    const of = (v) => (typeof v === "function" ? v(x) : v), skipText = of(cfg.skip);
    if (!pos) scrollTo(0, 0);
    host().innerHTML = `<div class="panel focus">
      ${quizHead({ title: of(cfg.head) || cfg.title, pos, total: items.length, toggles: cfg.toggles !== false, leave: cfg.then ? "Stop" : "Back" })}
      <div class="controls dock"><button class="btn primary" type="button" id="qNext" hidden>${last ? (cfg.then ? "Continue" : "See results") : "Next"}</button>${skipText ? `<button class="btn ghost" type="button" id="qSkip">${skipText}</button>` : ""}</div>
    </div>`;
    const panel = host().firstElementChild, dock = $(".dock", panel), next = $("#qNext", panel), skip = $("#qSkip", panel);
    wireLeave(panel);
    let answered = false, gone = false;
    const q = {
      el: panel, pos, total: items.length,
      draw: (html) => dock.insertAdjacentHTML("beforebegin", html),
      done(ok) {
        if (answered || gone) return;
        answered = true;
        if (ok) right++; else { missed.push(label(x)); missedItems.push(x); }
        if (skip) skip.hidden = true;
        revealNext(next);
      },
      next() { if (gone) return; gone = true; pos++; show(); },
    };
    cur = cfg.ask(x, q) || null;
    if (cfg.toggles !== false) wirePinyin(panel, cfg.pinyin);
    next.addEventListener("click", () => q.next());
    skip?.addEventListener("click", () => cur?.skip?.());
  }

  function end() {
    const total = items.length;
    progress.addSession({ type: cfg.kind, lesson: cfg.lesson ?? 0, ...cfg.session, score: right, total, missed });
    cfg.onDone?.(right, total);
    if (cfg.then) return cfg.then({ title: cfg.title, right, total, missed, missedItems });
    const shown = missedItems.map((x) => (cfg.missedHtml ? cfg.missedHtml(x) : esc(label(x))));
    host().innerHTML = `<div class="panel">
      <span class="lbl">Results · ${esc(cfg.title)}</span>
      <div class="score">${right} / ${total}${cfg.scoreNote ? " " + esc(cfg.scoreNote) : ""}</div>
      ${shown.length ? `<p>Practice these again:</p><div class="result-list">${shown.map((h) => `<span>${h}</span>`).join("")}</div>` : `<p>${cfg.perfect || "全对！Quán duì! Everything correct!"}</p>`}
      <div class="controls">${nextHtml()}<button class="btn big" type="button" id="resAgain">${icon("replay")} Again</button>${missedItems.length ? `<button class="btn big" type="button" id="resRetry">Retry missed</button>` : ""}${(cfg.more || []).map((m, i) => `<button class="btn big" type="button" data-more="${i}">${esc(m.label)}</button>`).join("")}${backHtml()}</div>
    </div>`;
    const el = host();
    wireLeave(el);
    wireNext(el);
    $("#resAgain", el).addEventListener("click", () => runRound(full));
    $("#resRetry", el)?.addEventListener("click", () => runRound({ ...cfg, items: missedItems, onDone: undefined }, full));
    $$("[data-more]", el).forEach((b) => b.addEventListener("click", () => cfg.more[+b.dataset.more].run()));
  }

  show();
}
