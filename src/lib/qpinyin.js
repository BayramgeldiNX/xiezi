// The Pinyin show/hide switch for quizzes and tests. One remembered setting (quizPinyin);
// flipping it toggles a `hide-py` class on the open panel, so it works mid-question.
// annotate() adds a pinyin line under each Chinese prompt and inside each Chinese choice.
// The English switch works the same way (quizEnglish, `hide-en`): each Chinese prompt gets an
// English line from sentence-en.gen.json (loaded on demand); while off, a line stays blurred
// until tapped, so a sentence you don't understand is one tap away.
import { tonePy } from "./pinyin.js";
import { sentencePy } from "./sentence-py.js";
import { setting, setSetting } from "./settings.js";
import { DICT } from "../data/index.js";
import { esc } from "./util.js";

const HAN = /\p{Script=Han}/u;
export const pyOn = () => setting("quizPinyin") !== "hide";

export const enOn = () => setting("quizEnglish") === "show";

export const pyToggleHtml = () =>
  `<div class="seg py-tog" role="group" aria-label="Pinyin and English"><button type="button" data-pytog aria-pressed="${pyOn()}">拼 Pinyin</button><button type="button" data-entog aria-pressed="${enOn()}">英 English</button></div>`;

// English of a Chinese sentence or phrase, or "" when there is none.
let EN = null, enLoad = null;
const loadEn = () => (enLoad ||= import("../data/sentence-en.gen.json").then((m) => (EN = m.default)));
export const enNorm = (s) => s.replace(/^[★☆\s]+/, "").replace(/^[AB男女问答]\s*[:：]\s*/, "").replace(/\s+/g, "");
export function enOf(hz) {
  const k = enNorm(hz);
  return (EN && EN[k]) || DICT[k]?.en || DICT[k.replace(/[\p{P}]+$/u, "")]?.en || "";
}

// Call after the panel's HTML is in place. `root` is the .panel element.
export function wirePinyin(root, { annotateText = true } = {}) {
  if (!root) return;
  root.classList.toggle("hide-py", !pyOn());
  root.classList.toggle("hide-en", !enOn());
  if (annotateText) annotate(root);
  if (root.querySelector("[data-entog]")) (EN ? Promise.resolve() : loadEn()).then(() => root.isConnected && annotateEn(root), () => {});
  root.querySelectorAll("[data-pytog]").forEach((b) => b.addEventListener("click", () => {
    const on = !pyOn();
    setSetting("quizPinyin", on ? "show" : "hide");
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hide-py", !on));
    document.querySelectorAll("[data-pytog]").forEach((x) => x.setAttribute("aria-pressed", on));
  }));
  root.querySelectorAll("[data-entog]").forEach((b) => b.addEventListener("click", () => {
    const on = !enOn();
    setSetting("quizEnglish", on ? "show" : "hide");
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hide-en", !on));
    document.querySelectorAll("[data-entog]").forEach((x) => x.setAttribute("aria-pressed", on));
    document.querySelectorAll(".q-en.shown").forEach((x) => x.classList.remove("shown"));
  }));
  // While English is off, a tap shows one sentence's English.
  root.addEventListener("click", (e) => {
    const t = e.target.closest?.(".q-en");
    if (t && root.classList.contains("hide-en")) t.classList.toggle("shown");
  });
}

const PROMPTS = ".hz, .big-hz, .prompt-big, .wb-q, .gr-q";
function annotate(root) {
  // prompts (and the "show the text" lines): not the answer boxes or choices
  root.querySelectorAll(PROMPTS).forEach((el) => {
    if (el.closest(".choices, .answer, .controls, .result-list") || el.parentElement?.closest(PROMPTS)) return;
    if (el.querySelector(".py") || el.nextElementSibling?.classList.contains("q-py")) return;
    const t = el.textContent;
    if (!HAN.test(t)) return;
    el.insertAdjacentHTML("afterend", `<span class="q-py">${tonePy(sentencePy(t))}</span>`);
  });
  root.querySelectorAll(".choice").forEach((b) => {
    if (b.querySelector(".py, .c-py") || !HAN.test(b.textContent)) return;
    b.insertAdjacentHTML("beforeend", `<span class="c-py">${tonePy(sentencePy(b.textContent.replace(/[A-Za-z]+/g, "")))}</span>`);
  });
}

// English under each Chinese prompt and dialog line (never inside choices or answers). When the
// choices are English (a meaning quiz), the prompt's English would give the answer away: skip.
const EN_SKIP = ".choices, .answer, .controls, .result-list, .choice, .q-py, .q-en, .c-py, button:not(.char-link), .lbl, .progress";
function annotateEn(root) {
  const choices = [...root.querySelectorAll(".choice")];
  if (choices.length && !choices.some((c) => HAN.test(c.textContent))) return;
  const cands = [...root.querySelectorAll(PROMPTS + ", .rd-hz, [data-en-src]")];
  for (const el of cands) {
    if (el.closest(EN_SKIP) || el.parentElement?.closest(PROMPTS + ", [data-en-src]")) continue;
    if (el.dataset.enDone) continue;
    const c = el.cloneNode(true);
    c.querySelectorAll(".py, .q-py, .c-py, .q-en, button:not(.char-link)").forEach((x) => x.remove());
    const t = c.textContent.trim();
    if (!HAN.test(t)) continue;
    const en = enOf(t);
    if (!en) continue;
    el.dataset.enDone = "1";
    let after = el;
    while (after.nextElementSibling?.matches(".q-py, .py, button, .say")) after = after.nextElementSibling;
    after.insertAdjacentHTML("afterend", `<span class="q-en" lang="en">${esc(en)}</span>`);
  }
}

// For a chip or a short piece of text built elsewhere.
export const pyOf = (hz) => tonePy(sentencePy(hz));
