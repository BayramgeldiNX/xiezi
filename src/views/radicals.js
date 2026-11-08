// 部 Radicals: list page (#/radicals) and one radical (#/radical/<r>).
// Teaching text comes from radicals-core.json (repo-owned); everything goes through esc().
import { $, esc } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { icon } from "../lib/icons.js";
import { gridSVG, makeWriter, trackWriter } from "../lib/draw.js";
import { CHARS, CHARINFO, RADICALS_CORE, RADICAL_FAMILIES, STROKE_DATA, ensureChars } from "../data/index.js";
import * as progress from "../progress/store.js";
import { charMastered, isDue } from "../progress/model.js";
import { radicalKey } from "../lib/radicals.js";

const STAGES = RADICALS_CORE?.stages || [];
const ALL = STAGES.flatMap((s) => s.radicals);
const find = (r) => ALL.find((x) => x.r === r);
const body = () => $("#radicalsBody");
const POS = { left: "on the left", right: "on the right", top: "on top", bottom: "at the bottom", enclose: "around the outside", enclosing: "around the outside", outside: "around the outside", inside: "inside", any: "in many places", varies: "in many places", middle: "in the middle" };

export const radicalTotal = () => ALL.length;
export const learnedCount = () => ALL.filter((x) => learned(x.r)).length;
const stat = (r) => progress.get(radicalKey(r));
const learned = (r) => charMastered(stat(r));
export const dueRadicals = () => ALL.filter((x) => isDue(stat(x.r))).map((x) => x.r);

// Radicals to practise: everything learned, plus the stages up to the first one not fully learned.
function scope() {
  const out = new Set(ALL.filter((x) => learned(x.r)).map((x) => x.r));
  for (const s of STAGES) {
    s.radicals.forEach((x) => out.add(x.r));
    if (!s.radicals.every((x) => learned(x.r))) break;
  }
  return [...out];
}

// Practice has its own address (#/radicals/<mode>, #/radical/<r>/<mode>), so the back arrow and the
// back gesture return to the page it was started from.
const MODES = ["cards", "find", "guess", "due"];
export function radicalsUp(hash) {
  const p = hash.split("/");
  if (p[1] === "radicals") return p[2] ? "#/radicals" : "#/";
  return p[3] ? `#/radical/${p[2]}` : "#/radicals";
}
function leave() {
  const up = radicalsUp(location.hash);
  if (history.state?.from === up) history.back();
  else location.hash = up;
}
const startPractice = (m) => { location.hash = `${location.hash.replace(/\/$/, "")}/${m}`; };

async function practice(mode, radicals) {
  try {
    const m = await import("./radicals-practice.js");
    window.scrollTo(0, 0);
    m.startRadicalPractice($("#radicalsBody"), { mode, radicals, then: leave, back: leave });
  } catch (e) {
    console.warn(e);
    const n = $("#radMsg");
    if (n) n.textContent = "Practice is coming soon.";
  }
}

let current = null;
export function openRadicals(r, mode) {
  current = r || null;
  const x = r && find(r);
  if (MODES.includes(mode)) return practice(mode, x ? [x.r] : mode === "due" ? dueRadicals() : scope());
  return x ? radicalPage(x) : listPage();
}

function tile(x) {
  const on = learned(x.r);
  return `<a class="rad-tile${on ? " on" : ""}" href="#/radical/${encodeURIComponent(x.r)}" aria-label="${esc(x.r)} ${esc(x.en)}${on ? ", learned" : ""}">
    <b class="rad-hz">${esc(x.r)}</b><span class="rad-en">${esc(x.en)}</span>${on ? `<i class="rad-dot" aria-hidden="true"></i>` : ""}</a>`;
}

function listPage() {
  const due = dueRadicals().length;
  body().innerHTML = `<p class="note">Radicals are the building blocks that hint at a character's meaning.</p>
    <div class="rad-actions">
      <button class="btn primary" type="button" data-rp="cards">Cards</button>
      <button class="btn" type="button" data-rp="find">Find the radical</button>
      <button class="btn" type="button" data-rp="guess">Guess the meaning</button>
      ${due ? `<button class="btn" type="button" data-rp="due">Review due (${due})</button>` : ""}
    </div>
    <p class="note" id="radMsg" aria-live="polite"></p>
    ${STAGES.map((s) => `<section class="rad-stage"><h3>${esc(s.title)}<span class="cn">${esc(s.cn || "")}</span></h3>
      <div class="rad-grid">${s.radicals.map(tile).join("")}</div></section>`).join("")}`;
  body().querySelectorAll("[data-rp]").forEach((b) => b.addEventListener("click", () => startPractice(b.dataset.rp)));
}

const famChip = (c, py, en) => `<button type="button" class="cs-chip" data-say="${esc(c)}"><b>${esc(c)}</b><span class="py">${tonePy(py || "")}</span><small>${esc(en || "")}</small></button>`;

function radicalPage(x) {
  const f = RADICAL_FAMILIES?.[x.r] || {};
  const sec = (t, h) => (h ? `<section><span class="lbl">${t}</span>${h}</section>` : "");
  const forms = [x.full && x.full !== x.r ? `from ${esc(x.full)}` : "", ...(x.variants || []).filter((v) => v !== x.full && v !== x.r).map((v) => `also ${esc(v)}`)].filter(Boolean).join(" · ");
  const phon = (f.common || []).filter((c) => c.sound).slice(0, 6);
  const book = (f.book || []).filter((c) => CHARS[c] || CHARINFO[c]);
  const more = (f.common || []).slice(0, 24);
  body().innerHTML = `<div class="panel rad-head">
      <div class="rad-big" aria-label="${esc(x.r)}">${esc(x.r)}</div>
      <p class="nb-py">${tonePy(x.py || "")} · ${esc(x.name || "")}</p>
      <p class="nb-en">${esc(x.en)}${learned(x.r) ? ` <span class="rad-ok">learned</span>` : ""}</p>
      <p class="note">${[forms, POS[x.pos] ? `Usually ${POS[x.pos]}` : ""].filter(Boolean).join(" · ")}</p>
      <div id="radWrite" class="rad-write" hidden></div>
    </div>
    ${sec("Origin", x.origin ? `<p>${esc(x.origin)}</p>` : "")}
    ${sec("Memory tip", x.tip ? `<p>${esc(x.tip)}</p>` : "")}
    ${sec("How it shapes meaning", (x.meaningNote ? `<p>${esc(x.meaningNote)}</p>` : "") + (x.kind === "shape" ? `<p class="note">Mostly a sorting radical.</p>` : ""))}
    ${sec("Meaning + sound", phon.length ? `<ul class="rad-eq">${phon.map((c) => `<li><button type="button" class="rad-say" data-say="${esc(c.c)}"><b>${esc(c.c)}</b></button> = ${esc(x.r)} meaning + <b>${esc(c.sound)}</b> sound <span class="note">${tonePy(c.py || "")} · ${esc(c.en || "")}</span></li>`).join("")}</ul>` : "")}
    ${sec("In your books", book.length ? `<div class="rad-chips">${book.map((c) => {
      const py = CHARS[c]?.py || "", en = CHARS[c]?.en || "";
      const ok = charMastered(progress.get("w:" + c));
      return `<button type="button" class="cs-chip" ${CHARINFO[c] ? `data-char="${esc(c)}"` : `data-say="${esc(c)}"`}><b>${esc(c)}</b><span class="py">${tonePy(py)}</span><small>${esc(en)}${ok ? " · 已学" : ""}</small></button>`;
    }).join("")}</div>` : "")}
    ${sec("More characters", more.length ? `<div class="rad-chips">${more.map((c) => famChip(c.c, c.py, c.en)).join("")}</div>` : "")}
    <div class="rad-actions">
      <span class="note">Practice ${esc(x.r)}</span>
      <button class="btn" type="button" data-rp="cards">Cards</button>
      <button class="btn" type="button" data-rp="find">Find</button>
      <button class="btn" type="button" data-rp="guess">Guess</button>
    </div>
    <p class="note" id="radMsg" aria-live="polite"></p>`;
  body().querySelectorAll("[data-rp]").forEach((b) => b.addEventListener("click", () => startPractice(b.dataset.rp)));
  strokes(x.r);
}

async function strokes(r) {
  const box = $("#radWrite");
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
