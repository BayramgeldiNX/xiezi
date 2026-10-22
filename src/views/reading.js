// 读 Reading: read texts (tap any word for its meaning), answer questions, build sentences,
// and say how a word is read. `ui` comes from skills.js: { body, backBtn, wireBack, choiceQuiz }.
import { $, $$, esc, shuffle, store } from "../lib/util.js";
import { tonePy, toneVariants } from "../lib/pinyin.js";
import { say, sayBtns, stopSpeech } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { makeSegmenter } from "../lib/segment.js";
import { DICT } from "../data/index.js";
import * as progress from "../progress/store.js";

const segment = makeSegmenter(DICT);

/* ---------- Tap a word: meaning bar ---------- */
function showGloss(t) {
  const g = $("#gloss");
  const info = DICT[t];
  g.innerHTML = `<span class="g-hz">${t}</span>
    <span class="g-txt">${info ? `<span class="py">${tonePy(info.py)}</span><span class="muted">${esc(info.en)}</span>` : `<span class="muted">No meaning saved yet</span>`}</span>
    ${sayBtns(t, info?.py || t, true)}
    <button class="sheet-close" type="button" id="glossClose" aria-label="Close">${icon("x")}</button>`;
  g.hidden = false;
  $("#glossClose").addEventListener("click", hideGloss);
  say(t);
}
export const hideGloss = () => { const g = $("#gloss"); if (g) g.hidden = true; };

const tokensHtml = (hz) => segment(hz).map((s) => (s.word ? `<button type="button" class="tok" data-t="${s.t}">${s.t}</button>` : `<span>${esc(s.t)}</span>`)).join("");

/* ---------- Texts: list ---------- */
export function textList(ui, readings) {
  if (!readings.length) {
    ui.body().innerHTML = `<div class="panel"><p>No reading texts in these lessons yet.</p>${ui.backBtn()}</div>`;
    return ui.wireBack(ui.body());
  }
  ui.body().innerHTML = `<div class="panel">
    <span class="lbl">课文 · Texts</span>
    <p>Tap a text to read it. Inside, tap any word for its meaning.</p>
    <div class="rv-list" style="display:grid;gap:8px;width:100%">${readings.map((r, i) => {
      const done = progress.get("r:" + r.key);
      return `<button class="rd-item" type="button" data-i="${i}">
        <span class="rd-item-hz">${r.title}</span>
        <span class="rd-item-txt"><span class="py">${tonePy(r.py)}</span><span class="muted">${esc(r.en)} · ${r.lines.length} lines</span></span>
        ${done?.n ? `<span class="badge ok">${done.ok}/${done.n} read</span>` : ""}
      </button>`;
    }).join("")}</div>
    ${ui.backBtn()}
  </div>`;
  ui.wireBack(ui.body());
  $$("[data-i]", ui.body()).forEach((b) => b.addEventListener("click", () => reader(ui, readings[+b.dataset.i], () => textList(ui, readings))));
}

/* ---------- Texts: reader ---------- */
function reader(ui, r, back) {
  stopSpeech();
  const prefs = store.get("xz-reader", { py: true, en: false });
  let playing = 0; // token: changes when playback should stop
  ui.body().innerHTML = `<div class="panel rd ${prefs.py ? "" : "hide-py"} ${prefs.en ? "" : "hide-en"}">
    <span class="lbl">课文 · ${esc(r.en)}${r.source === "practice" ? " · practice text" : ""}</span>
    <h3 class="rd-title">${r.title} <span class="py">${tonePy(r.py)}</span></h3>
    <div class="controls">
      <button class="btn primary" type="button" id="rdPlay">${icon("play")} Listen to all</button>
      <button class="btn" type="button" id="rdStop" hidden>${icon("stop")} Stop</button>
      <div class="seg" role="group" aria-label="Show">
        <button type="button" data-pref="py" aria-pressed="${prefs.py}">Pinyin</button>
        <button type="button" data-pref="en" aria-pressed="${prefs.en}">English</button>
      </div>
    </div>
    <ol class="rd-lines">${r.lines.map((l, i) => `<li class="rd-line" data-i="${i}">
      <span class="who">${l.who || ""}</span>
      <div class="rd-text">
        <p class="rd-hz">${tokensHtml(l.hz)}</p>
        <p class="rd-py">${tonePy(l.py)}</p>
        <p class="rd-en">${esc(l.en)}</p>
      </div>
      <button class="say sm" type="button" data-line="${i}" aria-label="Play line ${i + 1}">${icon("speaker")}</button>
    </li>`).join("")}</ol>
    <p class="note">Tap a word to see what it means. Tap the speaker to hear a line.</p>
    <div class="controls">
      ${r.questions?.length ? `<button class="btn primary big" type="button" id="rdQuiz">Answer ${r.questions.length} questions</button>` : ""}
      <button class="btn big" type="button" id="rdBack">All texts</button>
    </div>
  </div>`;
  const root = ui.body();
  const mark = (i) => $$(".rd-line", root).forEach((li) => li.classList.toggle("playing", +li.dataset.i === i));
  const stop = () => { playing++; stopSpeech(); mark(-1); $("#rdPlay").hidden = false; $("#rdStop").hidden = true; };
  $$(".tok", root).forEach((b) => b.addEventListener("click", () => { stop(); showGloss(b.dataset.t); }));
  $$("[data-line]", root).forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    stop();
    const i = +b.dataset.line, token = playing;
    mark(i);
    await say(r.lines[i].hz);
    if (token === playing) mark(-1);
  }));
  // The [data-line] buttons also carry no data-say, so the global sound handler leaves them alone.
  $$("[data-pref]", root).forEach((b) => b.addEventListener("click", () => {
    prefs[b.dataset.pref] = !prefs[b.dataset.pref];
    store.set("xz-reader", prefs);
    b.setAttribute("aria-pressed", prefs[b.dataset.pref]);
    $(".rd", root).classList.toggle("hide-py", !prefs.py);
    $(".rd", root).classList.toggle("hide-en", !prefs.en);
  }));
  $("#rdPlay").addEventListener("click", async () => {
    stop();
    const token = playing;
    $("#rdPlay").hidden = true; $("#rdStop").hidden = false;
    for (let i = 0; i < r.lines.length; i++) {
      if (token !== playing) return;
      mark(i);
      $$(".rd-line", root)[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
      await say(r.lines[i].hz);
      await new Promise((res) => setTimeout(res, 450));
    }
    if (token === playing) stop();
  });
  $("#rdStop").addEventListener("click", stop);
  $("#rdBack").addEventListener("click", () => { stop(); hideGloss(); back(); });
  $("#rdQuiz")?.addEventListener("click", () => { stop(); hideGloss(); textQuiz(ui, [r], () => reader(ui, r, back), r); });
  scrollTo(0, 0);
}

/* ---------- Questions about texts ---------- */
export function textQuiz(ui, readings, back, single) {
  const qs = readings.flatMap((r) => (r.questions || []).map((q, i) => ({ r, q, i })));
  if (!qs.length) {
    ui.body().innerHTML = `<div class="panel"><p>No questions in these lessons yet.</p>${ui.backBtn()}</div>`;
    return ui.wireBack(ui.body());
  }
  ui.choiceQuiz({
    kind: "reading-q", title: single ? `${single.title} · questions` : "Read & answer", key: "rq:", silent: true,
    words: single ? qs : shuffle(qs).slice(0, 10), count: single ? qs.length : 10,
    id: (x) => `${x.r.key}#${x.i}`, label: (x) => x.r.title,
    ask: (x) => ({ html: `<details class="rd-peek" ${single ? "" : "open"}><summary>${x.r.title} · show text</summary>
        <div class="rd-mini">${x.r.lines.map((l) => `<p><span class="who">${l.who}</span> ${l.hz}</p>`).join("")}</div></details>
        <p class="hint">${esc(x.q.q)}</p>` }),
    makeOptions: (x) => x.q.options.map((o, i) => ({ html: /\p{Script=Han}/u.test(o) ? `<span class="hz" style="font-size:1.25rem">${esc(o)}</span>` : `<span class="en">${esc(o)}</span>`, correct: i === x.q.answer })),
    reveal: (x) => `<span class="muted">Answer:</span> <b>${esc(x.q.options[x.q.answer])}</b>`,
    onDone: (right, total) => {
      if (single) progress.record("r:" + single.key, { ok: right === total, miss: total - right });
    },
    back,
  });
}

/* ---------- Build the sentence ---------- */
export function orderGame(ui, sentences) {
  // Sentences with 3–8 words; punctuation is shown at the end, not placed.
  const items = shuffle(sentences.map((s) => ({ ...s, parts: segment(s.hz).filter((p) => p.word).map((p) => p.t) }))
    .filter((s) => s.parts.length >= 3 && s.parts.length <= 8)).slice(0, 8);
  if (!items.length) {
    ui.body().innerHTML = `<div class="panel"><p>No sentences to build yet.</p>${ui.backBtn()}</div>`;
    return ui.wireBack(ui.body());
  }
  let pos = 0, right = 0;
  const missed = [];
  function show() {
    if (pos >= items.length) return end();
    const s = items[pos];
    let pool = shuffle(s.parts.map((t, i) => ({ t, i })));
    // Never start already in order.
    if (pool.every((p, k) => p.i === k)) pool = pool.reverse();
    const picked = [];
    let tries = 0;
    ui.body().innerHTML = `<div class="panel">
      <span class="lbl">组句 · Build the sentence</span>
      <div class="progress">${pos + 1} of ${items.length} · ${right} right</div>
      <div class="bar"><i style="width:${(pos / items.length) * 100}%"></i></div>
      <p class="prompt-big" style="font-size:1.2rem">${esc(s.en)}</p>
      <div class="controls"><button class="btn" type="button" data-say="${esc(s.hz)}">${icon("speaker")} Hint: listen</button></div>
      <div class="build" id="oAnswer" aria-label="Your sentence"></div>
      <div class="build pool" id="oPool"></div>
      <div class="status" id="oStatus" aria-live="polite"></div>
      <div class="answer" id="oReveal" hidden></div>
      <div class="controls"><button class="btn primary" type="button" id="oNext" hidden>${pos + 1 >= items.length ? "See results" : "Next"}</button>${ui.backBtn()}</div>
    </div>`;
    ui.wireBack(ui.body());
    const draw = () => {
      $("#oAnswer").innerHTML = picked.map((p, k) => `<button type="button" class="chip on" data-k="${k}">${p.t}</button>`).join("") || `<span class="muted">Tap the words below in the right order</span>`;
      $("#oPool").innerHTML = pool.map((p, k) => `<button type="button" class="chip" data-p="${k}">${p.t}</button>`).join("");
      $$("[data-k]", ui.body()).forEach((b) => b.addEventListener("click", () => { pool.push(picked.splice(+b.dataset.k, 1)[0]); draw(); }));
      $$("[data-p]", ui.body()).forEach((b) => b.addEventListener("click", () => {
        picked.push(pool.splice(+b.dataset.p, 1)[0]);
        draw();
        if (!pool.length) check();
      }));
    };
    const check = () => {
      const ok = picked.map((p) => p.t).join("") === s.parts.join("");
      tries++;
      if (ok) {
        if (tries === 1) right++; else missed.push(s.hz);
        progress.record("o:" + s.hz, { ok: tries === 1, miss: tries - 1 });
        $("#oStatus").style.color = "";
        $("#oStatus").textContent = tries === 1 ? "对了！Correct!" : "对了！Got it.";
        $("#oReveal").innerHTML = `<span class="hz" style="font-size:1.3rem">${s.hz}</span> <span class="py">${tonePy(s.py)}</span>`;
        $("#oReveal").hidden = false;
        $("#oPool").innerHTML = "";
        $$("#oAnswer .chip").forEach((c) => (c.disabled = true));
        $("#oNext").hidden = false;
        say(s.hz);
      } else {
        $("#oStatus").style.color = "var(--cinnabar)";
        $("#oStatus").textContent = tries >= 2 ? `Not yet. It starts with “${s.parts[0]}”. Tap words to move them back.` : "Not quite. Tap words to move them back and try again.";
      }
    };
    $("#oNext").addEventListener("click", () => { pos++; show(); });
    draw();
  }
  function end() {
    progress.addSession({ type: "order", lesson: 0, score: right, total: items.length, missed });
    ui.body().innerHTML = `<div class="panel">
      <span class="lbl">Results · Build the sentence</span>
      <div class="score">${right} / ${items.length} first try</div>
      ${missed.length ? `<p>Practice these again:</p><div class="result-list">${missed.map((t) => `<span>${t}</span>`).join("")}</div>` : `<p>全对！Quán duì!</p>`}
      <div class="controls"><button class="btn primary big" type="button" id="oAgain">${icon("replay")} Again</button>${ui.backBtn()}</div>
    </div>`;
    ui.wireBack(ui.body());
    $("#oAgain").addEventListener("click", () => orderGame(ui, sentences));
  }
  show();
}

/* ---------- How do you read it? (pick the pinyin) ---------- */
// Wrong choices: the same syllables with a different tone, plus another word's pinyin.
export function pinyinQuiz(ui, words) {
  ui.choiceQuiz({
    kind: "read-pinyin", title: "How do you read it?", words, key: "rp:",
    ask: (w) => ({ html: `<div class="big-hz">${w.w}</div><p class="hint">Which pinyin is right?</p>` }),
    makeOptions: (w) => {
      const correct = w.py.replace(/\s/g, "");
      const wrong = toneVariants(w.py).slice(0, 2);
      const others = shuffle(words.filter((x) => x.w !== w.w && x.w.length === w.w.length)).map((x) => x.py.replace(/\s/g, ""));
      for (const o of others) if (wrong.length < 3 && o !== correct && !wrong.includes(o)) wrong.push(o);
      return [{ html: `<span class="py" style="font-size:1.25rem">${tonePy(correct)}</span>`, correct: true },
        ...wrong.slice(0, 3).map((x) => ({ html: `<span class="py" style="font-size:1.25rem">${tonePy(x)}</span>`, correct: false }))];
    },
    reveal: (w) => `<span class="hz">${w.w}</span> <span class="py">${tonePy(w.py)}</span> <span class="muted">${esc(w.en)}</span> ${sayBtns(w.w, w.py, true)}`,
  });
}
