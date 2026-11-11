// 部 Radical lesson: six calm steps per radical, each its own address (#/radical/<r>/learn/<step>).
// Steps: 1 picture + story, 2 how the shape changed, 3 as a part, 4 family, 5 meaning + sound (skipped when empty), 6 quick check.
// The lesson text comes from radicals-core.json `lesson`; drawings and ancient forms are optional and may be missing.
import { $, esc } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { icon } from "../lib/icons.js";
import { gridSVG, makeWriter, trackWriter } from "../lib/draw.js";
import { STROKE_DATA, ensureChars } from "../data/index.js";
import * as progress from "../progress/store.js";
import { allCoreRadicals, pickRadicalDistractors, buildFindQuestions, buildGuessQuestions, pickGuessDistractors } from "../lib/radical-quiz.js";
import { radicalChoice } from "./workbook.js";
import { setHost, ui } from "./practice.js";
import { lessonSteps, stepIndex, nextRadical, learnHash, picId } from "../lib/radical-lesson.js";
import { firstUndone as firstUndoneIn } from "../lib/radical-lesson.js";
export const firstUndone = (all) => firstUndoneIn(all, lessonDone);

const ANCIENT_MOD = import.meta.glob("../data/ancient.gen.json", { eager: true });
const ANCIENT = Object.values(ANCIENT_MOD)[0]?.default || {};
const BASE = import.meta.env?.BASE_URL || "/";
const POS = { left: "On the left", right: "On the right", top: "On top", bottom: "At the bottom", enclose: "Around the outside", enclosing: "Around the outside", outside: "Around the outside", inside: "Inside", any: "In many places", varies: "In many places", middle: "In the middle" };
const SCRIPT = { oracle: "Oracle bone", bronze: "Bronze", seal: "Seal" };

export const lessonKey = (r) => "bsl:" + r;
export const lessonDone = (r) => (progress.get(lessonKey(r))?.n || 0) > 0;
export const picUrl = (r) => `${BASE}radicals/pic/${picId(r)}.svg`;
export const maskPic = (url, cls = "") => `<span class="rad-pic ${cls}" style="--src:url('${esc(url)}')" aria-hidden="true"></span>`;

const ALL = allCoreRadicals();
let trail = [], current = null;

function nav(r, n) {
  const here = learnHash(r, n);
  if (trail[trail.length - 2] === here) trail.pop(); else if (trail[trail.length - 1] !== here) trail.push(here);
  const prev = n > 1 ? learnHash(r, n - 1) : null;
  return {
    next: () => { location.hash = learnHash(r, n + 1); },
    back: () => { if (!prev) return; if (trail[trail.length - 2] === prev) history.back(); else location.hash = prev; },
  };
}

const full = (x) => (x.full && x.full !== x.r ? x.full : "");
const say = (c) => `<button type="button" class="rad-sayc" data-say="${esc(c)}" aria-label="Play ${esc(c)}"><span class="hz">${esc(c)}</span></button>`;

function head(x, n, total) {
  const dots = Array.from({ length: total }, (_, i) => `<i class="${i + 1 < n ? "done" : i + 1 === n ? "now" : ""}"></i>`).join("");
  return `<div class="rad-lhead"><div class="rad-dots" role="img" aria-label="Step ${n} of ${total}">${dots}</div>
    <h2 class="rad-ltitle"><span class="hz">${esc(full(x) ? full(x) + " " + x.r : x.r)}</span> · Lesson</h2></div>`;
}

function foot(n, last) {
  return `<div class="rad-lfoot">${n > 1 ? `<button class="btn" type="button" id="rlBack">Back</button>` : "<span></span>"}
    ${last ? "" : `<button class="btn primary" type="button" id="rlNext">Next</button>`}</div>`;
}

const sec = (cls, h) => `<div class="rad-lstep ${cls}">${h}</div>`;

function story(x) {
  const L = x.lesson || {};
  return sec("rad-l1", `<div class="rad-lpic">${maskPic(picUrl(x.r), "lg")}</div>
    <div class="rad-lbig hz" aria-label="${esc(x.r)}">${esc(x.r)}</div>
    <p class="nb-py">${tonePy(x.py || "")} · ${esc(x.name || "")}</p>
    <p class="nb-en">${esc(x.en)}</p>
    <p class="rad-ltext">${esc(L.story || x.origin || "")}</p>
    ${L.picture ? `<p class="note">${esc(L.picture)}</p>` : ""}`);
}

function shapeStep(x) {
  const forms = ANCIENT[x.r]?.forms || [];
  const cell = (inner, label) => `<div class="rad-fcell">${inner}<small>${esc(label)}</small></div>`;
  const arrow = `<span class="rad-farrow" aria-hidden="true">→</span>`;
  const today = cell(`<span class="hz rad-ftoday">${esc(x.r)}${full(x) ? `<em>${esc(full(x))}</em>` : ""}</span>`, "Today");
  const cells = [cell(maskPic(picUrl(x.r), "sm"), "Picture"),
    ...forms.map((f) => cell(maskPic(BASE + f.file, "sm"), SCRIPT[f.script] || f.script)), today];
  const credit = forms.length ? `<p class="note rad-credit">Ancient forms: ${forms.map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener" title="${esc([f.title, f.author, f.license].filter(Boolean).join(" · "))}">${esc(SCRIPT[f.script] || f.script)}</a>`).join(", ")} · Wikimedia Commons</p>` : "";
  return sec("rad-l2", `<h3 class="rad-lh">How the shape changed</h3>
    <div class="rad-flow">${cells.join(arrow)}</div>${credit}
    ${forms.length ? "" : `<p class="rad-ltext">${esc(x.origin || "")}</p>`}`);
}

function partStep(x) {
  const chars = (x.lesson?.part || []).slice(0, 2);
  return sec("rad-l3", `<h3 class="rad-lh">${esc(POS[x.pos] || "In many places")}</h3>
    <p class="rad-ltext">${full(x) ? `Alone it is <b class="hz">${esc(full(x))}</b>; as a part it shrinks to <b class="hz rad-rad">${esc(x.r)}</b>.` : `It keeps the same shape as a part: <b class="hz rad-rad">${esc(x.r)}</b>.`}</p>
    <div id="radWrite" class="rad-write" hidden></div>
    <div class="rad-parts">${chars.map((c) => `<button type="button" class="rad-part" data-say="${esc(c)}" aria-label="Play ${esc(c)}"><span class="hz rad-pc">${esc(c)}</span><span class="rad-pl">← <span class="hz rad-rad">${esc(x.r)}</span></span></button>`).join("")}</div>`);
}

function familyStep(x) {
  const why = (x.lesson?.why || []).slice(0, 4);
  return sec("rad-l4", `<h3 class="rad-lh">Meet the family</h3>
    <div class="rad-cards">${why.map((w) => `<button type="button" class="rad-card" data-say="${esc(w.c)}"><span class="hz rad-cc">${esc(w.c)}</span>
      <span class="rad-cb"><span class="py">${tonePy(w.py || "")}</span> <b>${esc(w.en)}</b><small>${esc(w.why)}</small></span></button>`).join("")}</div>`);
}

function soundStep(x) {
  const L = x.lesson || {};
  if (x.kind === "shape") {
    return sec("rad-l5", `<h3 class="rad-lh">A sorting shape</h3><p class="rad-ltext">${esc(L.shape || x.meaningNote || "")}</p>
      <div class="rad-chips">${(x.examples || []).slice(0, 6).map(say).join("")}</div>`);
  }
  const items = (L.sound || []).slice(0, 2);
  return sec("rad-l5", `<h3 class="rad-lh">Meaning + sound</h3>
    ${items.map((s) => `<div class="rad-eqrow">${say(s.c)}
      <p class="rad-eqt"><span class="py">${tonePy(s.py || "")}</span> ${esc(s.en || "")}<br>
      <span class="hz rad-rad">${esc(x.r)}</span> <small>meaning: ${esc(x.en)}</small> <span class="rad-plus">+</span>
      <span class="hz rad-snd">${esc(s.sound)}</span> <small>sound: ${tonePy(s.soundPy || "")}</small></p></div>`).join("")}`);
}

async function strokes(r) {
  const box = $("#radWrite");
  if (!box) return;
  try {
    await ensureChars([r]);
    if (!STROKE_DATA[r] || current !== r || !box.isConnected) return;
    box.hidden = false;
    box.innerHTML = `<div class="box">${gridSVG()}<div class="hw"></div></div>
      <div class="controls"><button class="btn" type="button">${icon("replay")} Replay</button></div>`;
    const hw = box.querySelector(".hw");
    const wr = trackWriter(makeWriter(hw, r, Math.round(hw.getBoundingClientRect().width) || 160, { showCharacter: false }));
    const play = () => wr.animateCharacter();
    box.querySelector("button").addEventListener("click", play);
    play();
  } catch { box.hidden = true; }
}

// Quick check: two "find" questions and one "guess" (or three "find" when this radical has no guess list).
function check(x, el, go) {
  el.innerHTML = `<div class="rad-lstep rad-l6"><h3 class="rad-lh">Quick check</h3><div id="radLessonQuiz"></div><div id="radLessonEnd"></div></div>`;
  const host = $("#radLessonQuiz");
  setHost("#radLessonQuiz", { back: go.back });
  const byR = Object.fromEntries(ALL.map((y) => [y.r, y]));
  const core = byR[x.r] || x;
  const guess = buildGuessQuestions([core], undefined, Math.random, 1);
  const find = buildFindQuestions([core], undefined, Math.random, guess.length ? 2 : 3);
  const fin = () => finish(x, $("#radLessonEnd"), host);
  const runGuess = () => {
    if (!guess.length) return fin();
    const pool = ALL.filter((y) => (y.kind || "meaning") === "meaning");
    ui.choiceQuiz({ kind: "radical-guess", title: "Guess the meaning", items: guess, key: "bs:", id: (q) => q.r, label: (q) => q.c, sayAfter: (q) => q.c, then: fin, back: go.back,
      ask: (q) => ({ html: `<p class="hint">What does this character mean? The radical gives a clue.</p><div class="big-hz">${esc(q.c)}</div>
        <p class="muted"><span class="hz" style="color:var(--jade)">${esc(q.radical.r)}</span> ${esc(q.radical.en)} + ?</p>` }),
      makeOptions: (q) => [q.en, ...pickGuessDistractors(q, pool)].map((en, i) => ({ html: `<span class="en">${esc(en)}</span>`, correct: i === 0 })),
      reveal: (q) => `<span class="hz" style="font-size:1.4rem">${esc(q.c)}</span> <span class="py">${esc(q.py)}</span> ${esc(q.en)}` });
  };
  if (!find.length) return runGuess();
  radicalChoice(ui, { kind: "radical-find", title: "Which radical?", items: find, key: "bs:", id: (q) => q.r, then: runGuess, back: go.back,
    charOf: (q) => q.c, radOf: (q) => q.r, nameOf: (r) => byR[r]?.en || "",
    distractors: (q) => pickRadicalDistractors(byR[q.r] || q.radical, ALL, Math.random, 3, q.c) });
}

function finish(x, end, host) {
  progress.record(lessonKey(x.r), { ok: true }, { sfx: "finish" });
  if (host) host.innerHTML = "";
  const nx = nextRadical(ALL, x.r);
  end.innerHTML = `<div class="panel rad-fin"><div class="rad-lbig hz">${esc(x.r)}</div><h3>Lesson done</h3>
    <p class="note">${esc(x.en)}</p>
    <div class="controls">${nx ? `<button class="btn primary big" type="button" id="rlNextLesson">Next lesson: <span class="hz">${esc(nx.r)}</span></button>` : ""}
    <button class="btn big" type="button" id="rlList">Back to radicals</button></div></div>`;
  $("#rlNextLesson")?.addEventListener("click", () => { location.hash = learnHash(nx.r, 1); });
  $("#rlList")?.addEventListener("click", () => { location.hash = "#/radicals"; });
  window.scrollTo(0, 0);
}

export function openRadicalLesson(x, step) {
  current = x.r;
  const steps = lessonSteps(x), total = steps.length, n = stepIndex(step, total);
  const id = steps[n - 1];
  const el = $("#radicalsBody");
  const go = nav(x.r, n);
  const view = { story, shape: shapeStep, part: partStep, family: familyStep, sound: soundStep }[id];
  el.innerHTML = `<div class="rad-lesson">${head(x, n, total)}<div id="radLBody">${view ? view(x) : ""}</div>${foot(n, id === "check")}</div>`;
  window.scrollTo(0, 0);
  $("#rlNext")?.addEventListener("click", go.next);
  $("#rlBack")?.addEventListener("click", go.back);
  if (id === "part") strokes(x.r);
  if (id === "check") check(x, $("#radLBody"), go);
}
