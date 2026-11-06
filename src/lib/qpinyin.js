// The Pinyin show/hide switch for quizzes and tests. One remembered setting (quizPinyin);
// flipping it toggles a `hide-py` class on the open panel, so it works mid-question.
// annotate() adds a pinyin line under each Chinese prompt and inside each Chinese choice.
import { tonePy } from "./pinyin.js";
import { sentencePy } from "./sentence-py.js";
import { setting, setSetting } from "./settings.js";

const HAN = /\p{Script=Han}/u;
export const pyOn = () => setting("quizPinyin") !== "hide";

export const pyToggleHtml = () =>
  `<div class="seg py-tog" role="group" aria-label="Pinyin"><button type="button" data-pytog aria-pressed="${pyOn()}">拼 Pinyin</button></div>`;

// Call after the panel's HTML is in place. `root` is the .panel element.
export function wirePinyin(root, { annotateText = true } = {}) {
  if (!root) return;
  root.classList.toggle("hide-py", !pyOn());
  if (annotateText) annotate(root);
  root.querySelectorAll("[data-pytog]").forEach((b) => b.addEventListener("click", () => {
    const on = !pyOn();
    setSetting("quizPinyin", on ? "show" : "hide");
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("hide-py", !on));
    document.querySelectorAll("[data-pytog]").forEach((x) => x.setAttribute("aria-pressed", on));
  }));
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
    b.insertAdjacentHTML("beforeend", `<span class="c-py">${tonePy(sentencePy(b.textContent))}</span>`);
  });
}

// For a chip or a short piece of text built elsewhere.
export const pyOf = (hz) => tonePy(sentencePy(hz));
