// 部 Radical lesson: six or seven calm steps per radical, each its own address (#/radical/<r>/learn/<step>).
// Steps: 1 picture + story, 2 how the shape changed, 3 as a part, look-alike twins (only for radicals that have them),
// family, meaning + sound (skipped when empty), check.
// The check is ONE round of up to 10 questions, one per word of the radical's family, "Spot the radical" and "What does it
// mean?" taking turns. The words change each time (lib/radical-quiz.js pickLessonWords: new words first, then missed ones).
// Each answer saves bsw:<char>; the radical's own bs:<radical> is saved once at the end.
// The lesson text comes from radicals-core.json `lesson`; drawings and ancient forms are optional and may be missing.
import { $, esc, shuffle } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { icon } from "../lib/icons.js";
import { gridSVG, makeWriter, trackWriter } from "../lib/draw.js";
import { STROKE_DATA, ensureChars, CHARS, CHARINFO, RADICAL_FAMILIES, CHAR_INSIDE } from "../data/index.js";
import * as progress from "../progress/store.js";
import { charMastered } from "../progress/model.js";
import { allCoreRadicals, buildLessonCheck, charGloss } from "../lib/radical-quiz.js";
import { sayBtns } from "../lib/speech.js";
import { setHost, ui } from "./practice.js";
import { lessonSteps, stepIndex, nextRadical, learnHash, picId, posHeading } from "../lib/radical-lesson.js";
import { radicalKey } from "../lib/radicals.js";
import { firstUndone as firstUndoneIn } from "../lib/radical-lesson.js";
export const firstUndone = (all) => firstUndoneIn(all, lessonDone);

const ANCIENT_MOD = import.meta.glob("../data/ancient.gen.json", { eager: true });
const ANCIENT = Object.values(ANCIENT_MOD)[0]?.default || {};
const BASE = import.meta.env?.BASE_URL || "/";
const SCRIPT = { oracle: "Oracle bone", bronze: "Bronze", seal: "Seal" };

export const lessonKey = (r) => "bsl:" + r;
export const lessonDone = (r) => (progress.get(lessonKey(r))?.n || 0) > 0;
export const picUrl = (r) => `${BASE}radicals/pic/${picId(r)}.svg`;
export const maskPic = (url, cls = "") => `<span class="rad-pic ${cls}" style="--src:url('${esc(url)}')" aria-hidden="true"></span>`;

const ALL = allCoreRadicals();
const BY_R = Object.fromEntries(ALL.map((y) => [y.r, y]));
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
  return sec("rad-l3", `<h3 class="rad-lh">${esc(posHeading(x.pos))}</h3>
    <p class="rad-ltext">${full(x) ? `Alone it is <b class="hz">${esc(full(x))}</b>; as a part it shrinks to <b class="hz rad-rad">${esc(x.r)}</b>.` : `It keeps the same shape as a part: <b class="hz rad-rad">${esc(x.r)}</b>.`}</p>
    <div id="radWrite" class="rad-write" hidden></div>
    <div class="rad-parts">${chars.map((c) => `<button type="button" class="rad-part" data-say="${esc(c)}" aria-label="Play ${esc(c)}"><span class="hz rad-pc">${esc(c)}</span><span class="rad-pl">← <span class="hz rad-rad">${esc(x.r)}</span></span></button>`).join("")}</div>`);
}

// A chip for a book character: opens its card when it has one, else plays it; "已学" when learned.
export function bookChip(c) {
  const ok = charMastered(progress.get("w:" + c));
  return `<button type="button" class="cs-chip" ${CHARINFO[c] ? `data-char="${esc(c)}"` : `data-say="${esc(c)}"`}><b>${esc(c)}</b><span class="py">${tonePy(CHARS[c]?.py || "")}</span><small>${esc(CHARS[c]?.en || "")}${ok ? " · 已学" : ""}</small></button>`;
}

function familyStep(x) {
  const why = (x.lesson?.why || []).slice(0, 4);
  const shown = new Set(why.map((w) => w.c));
  const known = (c) => (charMastered(progress.get("w:" + c)) ? 0 : 1);
  const book = ((RADICAL_FAMILIES[x.r] || {}).book || []).filter((c) => (CHARS[c] || CHARINFO[c]) && !shown.has(c) && c !== x.r && c !== x.full)
    .map((c, i) => [c, i]).sort((a, b) => known(a[0]) - known(b[0]) || a[1] - b[1]).slice(0, 8).map((e) => e[0]);
  return sec("rad-l4", `<h3 class="rad-lh">Meet the family</h3>
    <div class="rad-cards">${why.map((w) => `<button type="button" class="rad-card" data-say="${esc(w.c)}"><span class="hz rad-cc">${esc(w.c)}</span>
      <span class="rad-cb"><span class="py">${tonePy(w.py || "")}</span> <b>${esc(w.en)}</b><small>${esc(w.why)}</small></span></button>`).join("")}</div>
    ${book.length ? `<div class="rad-more"><span class="lbl">From your books</span><div class="rad-chips">${book.map(bookChip).join("")}</div></div>` : ""}`);
}

// Look-alikes: every form of a radical, and "does this character have it inside" through CHAR_INSIDE.
const formsOf = (y) => [y.r, y.full, ...(y.variants || [])].filter(Boolean);
const hasForm = (c, y) => { const s = c + (CHAR_INSIDE[c] || ""); return formsOf(y).some((f) => s.includes(f)); };
const famChars = (y, other) => {
  const f = RADICAL_FAMILIES[y.r] || {};
  return [...(f.book || []), ...(f.common || []).map((c) => c.c)].filter((c) => !formsOf(y).includes(c) && !hasForm(c, other));
};

function twinsStep(x) {
  const twins = (x.twins || []).map((t) => ({ y: BY_R[t.r], tell: BY_R[t.r]?.twins?.find((b) => b.r === x.r)?.tell || t.tell })).filter((t) => t.y);
  const row = (y, tell, other) => {
    const ex = famChars(y, other)[0];
    return `<div class="rad-twin"><span class="hz rad-twg">${esc(y.r)}</span>
      <p class="rad-twt"><b>${esc(y.en)}</b><br>${esc(tell)}</p>${ex ? say(ex) : ""}</div>`;
  };
  const mine = (x.twins || []).map((t) => t.tell).join(" ");
  return sec("rad-l3b", `<h3 class="rad-lh">Tell them apart</h3>
    <div class="rad-twins">${row(x, mine, twins[0]?.y || x)}${twins.map((t) => row(t.y, t.tell, x)).join("")}</div>
    <div class="rad-tw-drill" id="radTwDrill"></div>`);
}

// Tiny drill under the twins: four characters, two buttons each. Records nothing.
function twinsDrill(x) {
  const box = $("#radTwDrill");
  const t = shuffle((x.twins || []).map((t) => BY_R[t.r]).filter(Boolean))[0];
  if (!box || !t) return;
  const pick = (y, other) => shuffle(famChars(y, other)).slice(0, 2).map((c) => ({ c, ans: y.r }));
  const items = shuffle([...pick(x, t), ...pick(t, x)]);
  if (items.length < 2) return;
  box.innerHTML = `<p class="note">Which one is inside?</p>${items.map((it) => `<div class="rad-tw-q" data-ans="${esc(it.ans)}">${say(it.c)}
    <div class="rad-tw-opts">${[x, t].map((y) => `<button type="button" class="choice rad-tw-opt" data-pick="${esc(y.r)}"><span class="hz">${esc(y.r)}</span><small>${esc(y.en)}</small></button>`).join("")}</div></div>`).join("")}`;
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    const q = b.closest(".rad-tw-q"), opts = [...q.querySelectorAll("[data-pick]")];
    if (opts.some((o) => o.disabled)) return;
    opts.forEach((o) => { o.disabled = true; });
    const right = b.dataset.pick === q.dataset.ans;
    b.classList.add(right ? "right" : "wrong");
    if (!right) opts.find((o) => o.dataset.pick === q.dataset.ans)?.classList.add("right");
  });
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

// The writing box of a radical (animation, Replay, "Write it" with a message line); shared by the radical page and the lesson.
// isCurrent(): false once the page has moved on, so a late load draws nothing.
export async function radicalWriter(box, r, isCurrent = () => true) {
  if (!box) return;
  try {
    await ensureChars([r]);
    if (!STROKE_DATA[r] || !isCurrent() || !box.isConnected) return;
    box.hidden = false;
    box.innerHTML = `<div class="box">${gridSVG()}<div class="hw"></div></div>
      <div class="controls"><button class="btn" type="button" data-rw="play">${icon("replay")} Replay</button><button class="btn" type="button" data-rw="quiz">Write it</button></div>
      <p class="note" data-rw="msg" aria-live="polite"></p>`;
    const hw = box.querySelector(".hw");
    const wr = trackWriter(makeWriter(hw, r, Math.round(hw.getBoundingClientRect().width) || 160, { showCharacter: false }));
    const msg = box.querySelector('[data-rw="msg"]');
    const play = () => { wr.cancelQuiz(); msg.textContent = ""; wr.showOutline(); wr.animateCharacter(); };
    box.querySelector('[data-rw="play"]').addEventListener("click", play);
    // Write the radical yourself, stroke by stroke, over the grey outline.
    box.querySelector('[data-rw="quiz"]').addEventListener("click", () => {
      wr.hideCharacter();
      msg.textContent = "Your turn: draw the strokes in order.";
      wr.quiz({ showHintAfterMisses: 2, highlightOnComplete: true,
        onMistake: () => { msg.textContent = "Try again, check the stroke order."; },
        onComplete: (d) => { msg.textContent = d.totalMistakes ? `Done with ${d.totalMistakes} mistake${d.totalMistakes > 1 ? "s" : ""}.` : "太好了! Perfect!"; } });
    });
    play();
  } catch { box.hidden = true; }
}

// After an answer: the character, its sound and meaning, and how the radical gives it that meaning.
export function glossHtml(c, radical) {
  const g = charGloss(c, radical);
  const rad = radical ? `<span class="hz" style="color:var(--jade)">${esc(radical.r)}</span> ${esc(radical.en)}` : "";
  const how = g.why ? `${rad}: ${esc(g.why)}`
    : g.tip ? g.tip
    : g.sound ? `${rad} gives the meaning, <span class="hz">${esc(g.sound)}</span> gives the sound.`
    : rad ? `${rad} is its radical.` : "";
  return `<span class="hz" style="font-size:1.4rem">${esc(c)}</span> <span class="py">${tonePy(g.py)}</span> ${esc(g.en)} ${sayBtns(c, g.py, true)}
    ${how ? `<p class="note rad-gloss">${how}</p>` : ""}`;
}

// The check: ten words in one round. "Spot the radical": which of four characters has it inside? "What does it mean?":
// the character big, four meanings. Each answer shows glossHtml; a wrong choice adds a "You chose" note.
function check(x, el, go) {
  el.innerHTML = `<div class="rad-lstep rad-l6"><h3 class="rad-lh">Check</h3><div id="radLessonQuiz"></div><div id="radLessonEnd"></div></div>`;
  const host = $("#radLessonQuiz");
  setHost("#radLessonQuiz", { back: go.back });
  const core = BY_R[x.r] || x;
  const items = buildLessonCheck(core, ALL, { seen: (c) => progress.get("bsw:" + c), n: 10 });
  const end = () => $("#radLessonEnd");
  // Nothing missed: the lesson is done. Otherwise show what was missed first. The radical's own key is saved once, here.
  const fin = (res) => {
    const bad = [...new Set((res?.missedItems || []).map((q) => q.c))];
    if (items.length) progress.record(radicalKey(x.r), { ok: !bad.length, miss: bad.length ? 1 : 0 }, { quiet: true });
    if (!bad.length) return finish(x, end(), host);
    host.innerHTML = "";
    end().innerHTML = `<div class="panel rad-fin"><h3>Look at these again</h3>
      <div class="rad-chips">${bad.map(say).join("")}</div>
      <div class="controls"><button class="btn big" type="button" id="rlAgain">Look again</button><button class="btn primary big" type="button" id="rlDone">Done</button></div></div>`;
    $("#rlAgain").addEventListener("click", () => { location.hash = learnHash(x.r, lessonSteps(x).indexOf("family") + 1); });
    $("#rlDone").addEventListener("click", () => finish(x, end(), null));
  };
  if (!items.length) return fin();
  const gloss = (o, y) => { const g = charGloss(o.c, y); return `<span class="hz">${esc(o.c)}</span> ${tonePy(g.py)} ${esc(g.en)}`; };
  ui.choiceQuiz({ kind: "radical-check", title: "Check", items, key: "bsw:", id: (q) => q.c, label: (q) => q.c, sayAfter: (q) => q.c, then: fin, back: go.back,
    ask: (q) => q.type === "spot"
      ? { html: `<p class="hint">Which character has this radical inside?</p><div class="big-hz" data-en-done="1">${esc(q.r)}</div><p class="muted">${esc(q.radical.en)}</p>` }
      : q.radical.kind === "shape"
        ? { html: `<p class="hint">Which meaning?</p><div class="big-hz">${esc(q.c)}</div>` }
        : { html: `<p class="hint">What does this character mean? The radical gives a clue.</p><div class="big-hz">${esc(q.c)}</div>
          <p class="muted"><span class="hz" style="color:var(--jade)">${esc(q.radical.r)}</span> ${esc(q.radical.en)} + ?</p>` },
    makeOptions: (q) => q.type === "spot"
      ? [{ c: q.c, r: q.r }, ...q.others].map((o) => {
        const g = charGloss(o.c, BY_R[o.r]);
        return { html: `<span class="hz" style="font-size:1.8rem">${esc(o.c)}</span><span class="c-py">${tonePy(g.py)}</span>`, correct: o.c === q.c,
          note: `${gloss(o, BY_R[o.r])}: its radical is <span class="hz">${esc(o.r)}</span> ${esc(BY_R[o.r]?.en || "")}.` };
      })
      : [{ en: q.en, correct: true }, ...q.others.map((o) => ({ en: o.en, o, correct: false }))].map((o) => ({ html: `<span class="en">${esc(o.en)}</span>`, correct: o.correct,
        note: o.o ? `${esc(o.en)} is the meaning of ${gloss(o.o, BY_R[o.o.r])}.` : "" })),
    reveal: (q) => glossHtml(q.c, q.radical) });
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
  const view = { story, shape: shapeStep, part: partStep, twins: twinsStep, family: familyStep, sound: soundStep }[id];
  el.innerHTML = `<div class="rad-lesson">${head(x, n, total)}<div id="radLBody">${view ? view(x) : ""}</div>${foot(n, id === "check")}</div>`;
  window.scrollTo(0, 0);
  $("#rlNext")?.addEventListener("click", go.next);
  $("#rlBack")?.addEventListener("click", go.back);
  if (id === "part") radicalWriter($("#radWrite"), x.r, () => current === x.r);
  if (id === "twins") twinsDrill(x);
  if (id === "check") check(x, $("#radLBody"), go);
}
