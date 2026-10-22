// Write tab: watch the strokes, step through them one by one, or trace the character.
import { $, $$ } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { sayBtns } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { gridSVG, stripSVG, makeWriter, trackWriter, clearWriters } from "../lib/draw.js";
import { CHARS, STROKE_NAMES, STROKE_DATA, wordChars } from "../data/index.js";
import { app } from "../app.js";
import * as progress from "../progress/store.js";
import { charStatus, wordStatus } from "../progress/model.js";

// The card that arrow keys / space control (the last one touched).
let activeCard = null;

export function renderWords() {
  const nav = $("#words");
  nav.innerHTML = "";
  app.L().words.forEach((w, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.i = i;
    b.title = `${w.py}: ${w.en}`;
    b.innerHTML = `${w.w}<i class="dot" aria-hidden="true"></i>`;
    b.addEventListener("click", () => renderWord(i));
    nav.appendChild(b);
  });
  markWords();
}

// Small dot on each word chip: grey = new, amber = learning, green = known.
export function markWords() {
  $$("#words button").forEach((b) => {
    const w = app.L().words[+b.dataset.i];
    const st = wordStatus({ word: w.w, list: wordChars(w) }, progress.get);
    b.dataset.status = st;
    b.setAttribute("aria-label", `${w.w} (${st})`);
  });
}

export function renderWord(idx) {
  clearWriters();
  app.word = idx;
  app.savePlace();
  $$("#words button").forEach((b, i) => b.setAttribute("aria-pressed", i === idx));
  const word = app.L().words[idx];
  $("#wordHead").innerHTML = `<span class="hz">${word.w}</span><span class="py">${tonePy(word.py)}</span><span class="en">${word.en}</span>${sayBtns(word.w, word.py)}`;
  $("#example").innerHTML = `<span class="lbl">Example sentence</span>
    <span class="ex-hz">${word.ex.hz} ${sayBtns(word.ex.hz, "sentence", true)}</span>
    <span class="py">${tonePy(word.ex.py)}</span><span class="ex-en">${word.ex.en}</span>`;
  const host = $("#chars");
  host.innerHTML = "";
  activeCard = null;
  wordChars(word).forEach((c) => buildCharCard(host, c));
  const nav = $("#wordNav");
  nav.innerHTML = `<button class="btn" type="button" data-go="-1" ${idx === 0 ? "disabled" : ""}>${icon("back")} ${idx > 0 ? app.L().words[idx - 1].w : ""}</button>
    <button class="btn" type="button" data-go="1" ${idx === app.L().words.length - 1 ? "disabled" : ""}>${idx < app.L().words.length - 1 ? app.L().words[idx + 1].w : ""} ${icon("next")}</button>`;
}

function badgeText(c) {
  const s = progress.get("w:" + c);
  const st = charStatus(s);
  if (st === "new") return `<span class="badge new">New</span>`;
  const tries = `written ${s.n}×`;
  return st === "mastered"
    ? `<span class="badge ok">✓ Mastered</span><span class="count">${tries}</span>`
    : `<span class="badge learning">Learning</span><span class="count">${tries} · ${s.ok} perfect</span>`;
}

export function buildCharCard(host, c) {
  const { py, en, tip, strokes: names } = CHARS[c];
  const n = STROKE_DATA[c].strokes.length;
  const el = document.createElement("article");
  el.className = "char";
  el.innerHTML = `
    <div class="box">${gridSVG()}<div class="hw"></div><svg class="stepsvg" viewBox="0 0 1024 1024" hidden aria-hidden="true"></svg></div>
    <div class="info">
      <div class="title"><b>${c}</b><span class="py">${tonePy(py)}</span><span style="color:var(--muted)">${en}</span>${sayBtns(c, py, true)}</div>
      <div class="count">${n} strokes</div>
      <div class="badges">${badgeText(c)}</div>
      <p class="tip"><strong>Memory trick:</strong> ${tip}</p>
      <div class="modes" role="tablist" aria-label="Mode">
        <button class="mode" role="tab" data-m="flow">Non-stop</button>
        <button class="mode" role="tab" data-m="step">Stroke by stroke</button>
        <button class="mode" role="tab" data-m="quiz">Write it</button>
      </div>
      <div class="controls" data-for="flow"><button class="btn primary" data-a="play">${icon("play")} Play</button></div>
      <div class="controls" data-for="step" hidden>
        <button class="btn" data-a="back">${icon("back")} Back</button>
        <button class="btn primary" data-a="next">Next stroke ${icon("next")}</button>
        <button class="btn" data-a="replay">${icon("replay")} Replay</button>
      </div>
      <div class="strokename" data-for="step" hidden></div>
      <div class="controls" data-for="quiz" hidden><button class="btn primary" data-a="quiz">${icon("replay")} Start again</button></div>
      <div class="status" aria-live="polite"></div>
    </div>
    <div class="strip">${STROKE_DATA[c].strokes.map((_, i) => `<figure data-i="${i}">${stripSVG(c, i)}<figcaption>${i + 1}${names[i] ? " " + names[i] : ""}</figcaption></figure>`).join("")}</div>`;
  host.appendChild(el);

  const hw = $(".hw", el), stepSvg = $(".stepsvg", el), status = $(".status", el), sname = $(".strokename", el);
  const size = Math.round(hw.getBoundingClientRect().width) || 260;
  const writer = trackWriter(makeWriter(hw, c, size));
  const figs = $$(".strip figure", el);
  let mode = "flow", step = 0, anim = 0;

  function drawStep(i) {
    step = i;
    const s = STROKE_DATA[c].strokes, m = STROKE_DATA[c].medians[i];
    const pad = Math.round(size * 0.05), k = (size - 2 * pad) / size, off = (pad / size) * 1024;
    const ghosts = s.map((d) => `<path d="${d}" fill="var(--ghost)"/>`).join("");
    const done = s.slice(0, i).map((d) => `<path d="${d}" fill="var(--ink)"/>`).join("");
    const line = m.map((p, j) => (j ? "L" : "M") + p[0] + " " + p[1]).join("");
    const id = "clip-" + c.codePointAt(0) + "-" + i;
    stepSvg.innerHTML = `<defs><clipPath id="${id}"><path d="${s[i]}"/></clipPath></defs>
      <g transform="translate(${off},${off}) scale(${k}) translate(0,900) scale(1,-1)">${ghosts}${done}
      <path class="cur" d="${line}" fill="none" stroke="var(--cinnabar)" stroke-width="150" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${id})"/></g>`;
    // requestAnimationFrame on the attribute: works the same on every phone browser.
    const cur = $(".cur", stepSvg);
    const len = cur.getTotalLength() + 150;
    const dur = Math.min(1200, 400 + len * 0.4);
    cur.setAttribute("stroke-dasharray", len + " " + len);
    cur.setAttribute("stroke-dashoffset", len);
    const token = ++anim, t0 = performance.now();
    const tick = (now) => {
      if (token !== anim) return;
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      cur.setAttribute("stroke-dashoffset", len * (1 - e));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    figs.forEach((f, j) => f.classList.toggle("on", j === i));
    figs[i].scrollIntoView({ block: "nearest", inline: "nearest" });
    const nm = names[i], info = STROKE_NAMES[nm];
    sname.innerHTML = nm && info ? `<b>${nm}</b><span class="py">${tonePy(info.py)}</span><span>${info.en}</span>` : "";
    sname.toggleAttribute("hidden", !(nm && info));
    status.textContent = i === n - 1 ? `Stroke ${i + 1} of ${n}. Finished! 完成了 wánchéng le!` : `Stroke ${i + 1} of ${n}. Copy it, then tap Next.`;
    $('[data-a="back"]', el).disabled = i === 0;
    $('[data-a="next"]', el).disabled = i === n - 1;
  }
  function setMode(mo) {
    mode = mo;
    writer.cancelQuiz();
    $$(".mode", el).forEach((b) => b.setAttribute("aria-selected", b.dataset.m === mo));
    $$("[data-for]", el).forEach((g) => g.toggleAttribute("hidden", g.dataset.for !== mo));
    stepSvg.toggleAttribute("hidden", mo !== "step");
    hw.style.visibility = mo === "step" ? "hidden" : "visible";
    figs.forEach((f) => f.classList.remove("on"));
    if (mo === "flow") play();
    else if (mo === "step") drawStep(0);
    else quiz();
  }
  function play() {
    status.textContent = "Watch carefully…";
    writer.hideCharacter();
    writer.animateCharacter({ onComplete: () => { if (mode === "flow") status.textContent = `Done! ${n} strokes. Now try Stroke by stroke.`; } });
  }
  function quiz() {
    status.textContent = "Your turn! Draw stroke 1.";
    writer.hideCharacter();
    writer.quiz({
      showHintAfterMisses: 2, highlightOnComplete: true,
      onCorrectStroke: (d) => { status.textContent = d.strokesRemaining ? `Good! Stroke ${d.strokeNum + 2} next.` : ""; },
      onMistake: () => { status.textContent = "Try again, check the stroke order."; },
      onComplete: (d) => {
        progress.record("w:" + c, { ok: d.totalMistakes === 0, miss: d.totalMistakes });
        $(".badges", el).innerHTML = badgeText(c);
        markWords();
        status.textContent = d.totalMistakes === 0 ? "太好了! Tài hǎo le! Perfect!" : `很好! Hěn hǎo! Done with ${d.totalMistakes} mistake${d.totalMistakes > 1 ? "s" : ""}.`;
      },
    });
  }
  const api = {
    el,
    key(k) {
      if (k === "ArrowRight") { if (mode !== "step") setMode("step"); else if (step < n - 1) drawStep(step + 1); }
      else if (k === "ArrowLeft") { if (mode === "step" && step > 0) drawStep(step - 1); }
      else if (k === " ") { if (mode === "step") drawStep(step); else if (mode === "flow") play(); else quiz(); }
      else if (k === "w") setMode("quiz");
      else if (k === "p") setMode("flow");
    },
  };
  activeCard ||= api;
  el.addEventListener("pointerdown", () => { activeCard = api; });
  el.addEventListener("click", (e) => {
    activeCard = api;
    const mb = e.target.closest("[data-m]");
    if (mb) return setMode(mb.dataset.m);
    const fig = e.target.closest("figure[data-i]");
    if (fig) { if (mode !== "step") setMode("step"); return drawStep(+fig.dataset.i); }
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "play") play();
    else if (a === "next" && step < n - 1) drawStep(step + 1);
    else if (a === "back" && step > 0) drawStep(step - 1);
    else if (a === "replay") drawStep(step);
    else if (a === "quiz") quiz();
  });
  $$(".mode", el).forEach((b) => b.setAttribute("aria-selected", b.dataset.m === "flow"));
}

// Keyboard (Windows): ← → strokes, space replays, W = write it, P = play, [ ] = previous / next word.
export function writeKey(e) {
  if (e.key === "[" && app.word > 0) return renderWord(app.word - 1), true;
  if (e.key === "]" && app.word < app.L().words.length - 1) return renderWord(app.word + 1), true;
  if (!activeCard || !document.body.contains(activeCard.el)) return false;
  if (["ArrowRight", "ArrowLeft", " ", "w", "p"].includes(e.key)) { activeCard.key(e.key); return true; }
  return false;
}
