// 键 Typing: type the Chinese (with the phone's Chinese keyboard), or type pinyin with tone numbers.
// Each session reviews what's due first, then brings in new words, so learning and review happen together.
import { $, $$, esc, store } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { say, autoSay, stopSpeech } from "../lib/speech.js";
import { icon } from "../lib/icons.js";
import { checkHanzi, checkPinyin, toneSyllables, TONE_HELP } from "../lib/typing-check.js";
import { BOOKS, LESSONS, READINGS, wordsOf } from "../data/index.js";
import * as progress from "../progress/store.js";
import { isDue, nextReview } from "../progress/model.js";

const SESSION = 10;
const body = () => $("#typingBody");
const opts = () => ({ mode: "hz", content: "words", showPy: true, scope: "all", ...store.get("xz-typing", {}) });
const setOpt = (k, v) => store.set("xz-typing", { ...opts(), [k]: v });
const KEY = { hz: "tc:", py: "tp:" };

// Scope: "all", a whole book ("book:<id>") or one lesson (its id, "<book>/<n>").
const scopeLessons = () => {
  const s = opts().scope;
  if (s === "all") return LESSONS;
  if (s.startsWith("book:")) return LESSONS.filter((l) => l.book === s.slice(5));
  const one = LESSONS.filter((l) => l.id === s);
  return one.length ? one : LESSONS;
};
const scopeBook = () => { const s = opts().scope; return s === "all" ? null : s.startsWith("book:") ? s.slice(5) : s.split("/")[0]; };

// Words, or sentences (examples + reading lines), each { id, hz, py, en }.
function allItems() {
  const lessons = scopeLessons();
  if (opts().content === "words") return wordsOf(lessons).map((w) => ({ id: w.w, hz: w.w, py: w.py, en: w.en }));
  const seen = new Set(), out = [];
  const add = (hz, py, en) => { hz = hz.replace(/[AB]: /g, ""); py = py.replace(/[AB]: /g, ""); if (!seen.has(hz)) { seen.add(hz); out.push({ id: hz, hz, py, en }); } };
  for (const l of lessons) {
    for (const w of l.words) if (w.ex?.hz) add(w.ex.hz, w.ex.py, w.ex.en);
    for (const r of READINGS.filter((x) => x.lesson === l.id)) for (const line of r.lines) add(line.hz, line.py, line.en);
  }
  return out;
}

// Due first (oldest first), then new ones in lesson order, then the ones coming up soonest.
function plan() {
  const key = KEY[opts().mode];
  const rows = allItems().map((it) => ({ ...it, stat: progress.get(key + it.id) }));
  const due = rows.filter((r) => isDue(r.stat)).sort((a, b) => nextReview(a.stat) - nextReview(b.stat));
  const fresh = rows.filter((r) => !r.stat?.n);
  const later = rows.filter((r) => r.stat?.n && !isDue(r.stat)).sort((a, b) => nextReview(a.stat) - nextReview(b.stat));
  return { due, fresh, later, session: [...due, ...fresh, ...later].slice(0, SESSION) };
}

// Which words: all books, one book, or one lesson of the chosen book.
function scopePicker(o) {
  const btn = (v, label, on) => `<button type="button" data-opt="scope" data-v="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  const b = scopeBook();
  const bookRow = [btn("all", "All books", o.scope === "all"), ...BOOKS.map((x) => btn(`book:${x.id}`, x.title, b === x.id))].join("");
  const lessonRow = b ? [btn(`book:${b}`, "Whole book", o.scope === `book:${b}`),
    ...BOOKS.find((x) => x.id === b).lessons.map((l) => btn(l.id, `${l.n} ${l.title}`, o.scope === l.id))].join("") : "";
  return `<div class="scope">${bookRow}</div>${lessonRow ? `<div class="scope">${lessonRow}</div>` : ""}`;
}

/* ---------- Start screen ---------- */
export function openTyping() {
  stopSpeech();
  const o = opts(), p = plan();
  const seg = (k, items) => `<div class="seg" role="group">${items.map(([v, label]) =>
    `<button type="button" data-opt="${k}" data-v="${v}" aria-pressed="${String(o[k]) === String(v)}">${label}</button>`).join("")}</div>`;
  body().innerHTML = `
    <div class="panel">
      <span class="lbl">How do you want to type?</span>
      ${seg("mode", [["hz", "汉 Type Chinese"], ["py", "拼 Type pinyin"]])}
      ${seg("content", [["words", "Words"], ["sentences", "Sentences"]])}
      ${o.mode === "hz" ? seg("showPy", [[true, "Show pinyin"], [false, "Hide pinyin"]]) : ""}
      ${LESSONS.length > 1 ? scopePicker(o) : ""}
      <p class="note">${o.mode === "hz"
        ? "You see the English meaning (and the pinyin, if shown) and type the Chinese with your Chinese keyboard."
        : "You see the Chinese and type its pinyin with a tone number after each syllable, like <b>ni3 hao3</b>."}</p>
      <div class="stats">
        <div><b class="learn-c">${p.due.length}</b><span>to review</span></div>
        <div><b>${p.fresh.length}</b><span>new</span></div>
        <div><b class="ok-c">${p.later.length}</b><span>learned</span></div>
      </div>
      <button class="btn primary big" type="button" id="tyStart" ${p.session.length ? "" : "disabled"}>${icon("play")} Start · ${p.session.length} ${o.content === "words" ? "words" : "sentences"}</button>
    </div>
    ${o.mode === "py" ? toneLegend() : keyboardHelp()}`;
  $$("[data-opt]", body()).forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.v;
    setOpt(b.dataset.opt, v === "true" ? true : v === "false" ? false : v);
    openTyping();
  }));
  $("#tyStart").addEventListener("click", () => run(p.session));
}

const toneLegend = () => `<div class="panel">
  <span class="lbl">Tone numbers</span>
  <ul class="tone-legend">${[1, 2, 3, 4, 5].map((t) => `<li><b class="t${t}">${t === 5 ? "5" : t}</b>${esc(TONE_HELP[t])}</li>`).join("")}</ul>
  <p class="note">Examples: 你好 → <b>ni3 hao3</b> · 谢谢 → <b>xie4 xie5</b> (or <b>xie4 xie</b>) · for ü type <b>v</b>: 绿 → <b>lv4</b>. Spaces are optional.</p>
</div>`;

const keyboardHelp = () => `<details class="panel">
  <summary><b>How to add a Chinese keyboard</b></summary>
  <p><b>iPhone:</b> Settings → General → Keyboard → Keyboards → Add New Keyboard → Chinese, Simplified → <b>Pinyin – QWERTY</b>. Switch with the 🌐 key.</p>
  <p><b>Mi Pad (Gboard):</b> Settings → Additional settings → Languages &amp; input → Gboard → Languages → Add keyboard → <b>Chinese (Simplified) · Pinyin</b>. Switch with the 🌐 key or by holding the space bar.</p>
  <p><b>Windows:</b> Settings → Time &amp; language → Language &amp; region → Add a language → <b>Chinese (Simplified, China)</b>. Switch with <b>Win + Space</b>; it includes Microsoft Pinyin.</p>
  <p class="note">Type the pinyin without tones (for example <b>nihao</b>), then pick 你好 from the suggestions.</p>
</details>`;

/* ---------- Session ---------- */
function run(items) {
  const o = opts();
  let pos = 0, right = 0;
  const missed = [];
  const next = () => { pos++; pos >= items.length ? end() : ask(); };

  function ask() {
    const it = items[pos];
    let tries = 0, hints = 0, done = false;
    const hz = o.mode === "hz";
    body().innerHTML = `<div class="panel">
      <span class="lbl">${hz ? "汉 Type the Chinese" : "拼 Type the pinyin with tone numbers"}</span>
      <div class="progress">${pos + 1} of ${items.length} · ${right} right</div>
      <div class="bar"><i style="width:${(pos / items.length) * 100}%"></i></div>
      ${hz
        ? `<div class="prompt-big">${esc(it.en)}</div>${o.showPy ? `<div class="py" style="font-size:1.2rem">${tonePy(it.py)}</div>` : ""}`
        : `<div class="${it.hz.length > 4 ? "prompt-big" : "big-hz"}" style="font-family:var(--display)">${it.hz}</div><div class="muted">${esc(it.en)}</div>`}
      <div class="controls"><button class="btn" type="button" id="tyListen">${icon("speaker")} Listen</button></div>
      <input class="type-in" id="tyIn" type="text" ${hz ? 'lang="zh-CN"' : 'lang="en" inputmode="text"'} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        placeholder="${hz ? "Type in Chinese…" : "pinyin + tone numbers"}" aria-label="Your answer">
      <div class="ty-feedback" id="tyFb" aria-live="polite"></div>
      <div class="controls">
        <button class="btn primary" type="button" id="tyCheck">${icon("check")} Check</button>
        <button class="btn" type="button" id="tyHint">${icon("hint")} Hint</button>
        <button class="btn" type="button" id="tyShow">Show answer</button>
        <button class="btn primary" type="button" id="tyNext" hidden>${pos + 1 >= items.length ? "See results" : "Next"}</button>
        <button class="btn ghost" type="button" id="tyStop">Stop</button>
      </div>
      ${hz ? "" : `<p class="note">1 flat ˉ · 2 rising ˊ · 3 dips then rises ˇ · 4 falling ˋ · 5 / none neutral</p>`}
    </div>`;
    const input = $("#tyIn"), fb = $("#tyFb");
    input.focus({ preventScroll: true });

    const finish = (ok) => {
      done = true;
      const clean = ok && tries === 1 && hints === 0;
      progress.record(KEY[o.mode] + it.id, { ok: clean, miss: (tries - (ok ? 1 : 0)) + hints + (ok ? 0 : 1) });
      if (clean) right++; else missed.push(it.hz);
      input.readOnly = true;
      $("#tyCheck").hidden = $("#tyHint").hidden = $("#tyShow").hidden = true;
      $("#tyNext").hidden = false;
      $("#tyNext").focus({ preventScroll: true });
      autoSay(it.hz);
    };
    const answerLine = () => `<div class="answer"><span class="hz">${it.hz}</span><span class="py">${tonePy(it.py)}</span>
      ${hz ? "" : `<span class="muted">${toneSyllables(it.py).map((s) => s.p + (s.tone === 5 ? "" : s.tone)).join(" ")}</span>`}</div>`;

    function check() {
      if (done || !input.value.trim()) return;
      tries++;
      if (hz) {
        const r = checkHanzi(it.hz, input.value);
        if (r.ok) { fb.innerHTML = `<p class="status">${tries === 1 && !hints ? "太好了！Perfect!" : "对了！Correct."}</p>${answerLine()}`; return finish(true); }
        // Your own characters: green where right, red where wrong, ＿ where one is missing, extra ones red.
        const typed = [...r.typed];
        const cells = r.chars.map((c, i) => `<span class="${c.ok ? "ok" : "bad"}">${typed[i] ? esc(typed[i]) : "＿"}</span>`)
          .concat(typed.slice(r.chars.length).map((t) => `<span class="bad">${esc(t)}</span>`));
        const n = r.chars.length;
        fb.innerHTML = `<p class="status" style="color:var(--cinnabar)">Not quite. ${typed.length < n ? `It has ${n} characters.` : typed.length > n ? `It has only ${n} character${n > 1 ? "s" : ""}.` : "Red ones are wrong:"}</p>
          <div class="ty-chars">${cells.join("")}</div>`;
      } else {
        const r = checkPinyin(it.py, input.value);
        const chips = r.syllables.map((s) => `<span class="ty-syl ${s.spellOk && s.toneOk ? "ok" : "bad"}">
            <b>${s.spellOk ? s.p : esc(s.got || "…")}${s.gotTone && s.gotTone !== 5 ? s.gotTone : ""}</b>
            <small>${!s.spellOk ? "spelling" : s.toneOk ? "✓" : `tone ${s.gotTone ?? "missing"}`}</small></span>`).join("");
        if (r.ok) {
          fb.innerHTML = `<p class="status">${tries === 1 && !hints ? "太好了！Perfect tones!" : "对了！Correct."}</p><div class="ty-chars">${chips}</div>
            ${r.sandhi ? `<p class="note">Good ear! You typed the tone as it's <b>spoken</b>: when two 3rd tones meet, the first one is said as a 2nd tone. The book writes the original 3rd tone.</p>` : ""}${answerLine()}`;
          return finish(true);
        }
        const toneOnly = r.spellingOk;
        const spellBad = r.syllables.some((s) => !s.spellOk);
        fb.innerHTML = `<p class="status" style="color:var(--cinnabar)">${toneOnly ? "Spelling is right, check the tones." : spellBad ? "Check the spelling of the red syllable." : "There are extra letters at the end."}</p><div class="ty-chars">${chips}</div>`;
      }
      if (tries >= 3) fb.insertAdjacentHTML("beforeend", `<p class="note">Stuck? Tap <b>Hint</b> or <b>Show answer</b>.</p>`);
      input.select();
    }
    function hint() {
      hints++;
      if (hz) {
        const n = Math.min(hints, [...it.hz].length);
        fb.innerHTML = `<p class="note">Starts with: <span class="hz" style="font-size:1.4rem">${[...it.hz].slice(0, n).join("")}</span>${n < [...it.hz].length ? "…" : ""}</p>`;
      } else if (hints === 1) {
        fb.innerHTML = `<p class="note">Syllables (tones hidden): <b>${toneSyllables(it.py).map((s) => s.p).join(" ")}</b></p>`;
      } else {
        fb.innerHTML = `<p class="note">Listen closely to the tones.</p>`;
        say(it.hz, true);
      }
      input.focus({ preventScroll: true });
    }
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return; // still choosing characters in the IME
      e.preventDefault();
      done ? next() : check();
    });
    $("#tyCheck").addEventListener("click", check);
    $("#tyHint").addEventListener("click", hint);
    $("#tyShow").addEventListener("click", () => { fb.innerHTML = `<p class="status" style="color:var(--muted)">Here's the answer:</p>${answerLine()}`; finish(false); });
    $("#tyNext").addEventListener("click", next);
    $("#tyStop").addEventListener("click", () => { stopSpeech(); openTyping(); });
    $("#tyListen").addEventListener("click", () => { say(it.hz); input.focus({ preventScroll: true }); });
  }

  function end() {
    progress.addSession({ type: `typing-${o.mode}`, lesson: 0, score: right, total: items.length, missed });
    body().innerHTML = `<div class="panel">
      <span class="lbl">Results · ${o.mode === "hz" ? "Type the Chinese" : "Type the pinyin"}</span>
      <div class="score">${right} / ${items.length}</div>
      ${missed.length ? `<p>These come back tomorrow:</p><div class="result-list">${missed.map((t) => `<span>${esc(t)}</span>`).join("")}</div>`
        : `<p>全对！Everything right first time. These come back later for review.</p>`}
      <div class="controls"><button class="btn primary big" type="button" id="tyMore">${icon("play")} Next 10</button><button class="btn big" type="button" id="tyHome">Done</button></div>
    </div>`;
    $("#tyMore").addEventListener("click", () => { const p = plan(); p.session.length ? run(p.session) : openTyping(); });
    $("#tyHome").addEventListener("click", openTyping);
  }
  ask();
}

// Count shown on the home card: items due in either mode.
export function typingDue() {
  const items = wordsOf(LESSONS);
  let n = 0;
  for (const k of Object.values(KEY)) for (const w of items) if (isDue(progress.get(k + w.w))) n++;
  return n;
}
