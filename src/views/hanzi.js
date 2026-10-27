// 汉字 Character lesson (Write tab) and 语音 Pronunciation tips (Listen tab): what the textbook teaches about
// strokes, stroke-order rules, single characters, character structures, radicals and sounds, per lesson.
// lesson.hanzi = { strokes: [[name, examples]], rules: [[rule, examples]], chars: [[c, story]],
//                  structure: [name, explanation, examples], radicals: [[radical, meaning, examples]] }
// lesson.pron = [{ t, en, ex: [...] }]
import { esc } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { sayBtns } from "../lib/speech.js";
import { STROKE_NAMES, DICT } from "../data/index.js";
import { charLinks } from "./charsheet.js";

const hzRow = (s) => `<span class="hz hzl-ex">${charLinks(s)}</span>`;

export function hanziLesson(ui, lesson, { onRadicals } = {}) {
  const h = lesson.hanzi || {};
  const sec = (title, body) => body ? `<section class="gr-note"><h3>${title}</h3>${body}</section>` : "";
  ui.body().innerHTML = `<div class="panel gr hzl">
    <span class="lbl">汉字 · Characters · ${esc(lesson.cn)}</span>
    <p class="note">Tap any character to see how it's built and practise it.</p>
    ${sec("笔画 Strokes", h.strokes?.length ? `<ul>${h.strokes.map(([s, ex]) =>
      `<li><b class="hz">${s}</b> <span class="py">${tonePy(STROKE_NAMES[s]?.py || "")}</span> <span class="muted">${esc(STROKE_NAMES[s]?.en || "")}</span> · ${hzRow(ex)}</li>`).join("")}</ul>` : "")}
    ${sec("笔顺 Stroke order", h.rules?.length ? `<ul>${h.rules.map(([r, ex]) => `<li>${esc(r)} · ${hzRow(ex)}</li>`).join("")}</ul>` : "")}
    ${sec("认识独体字 Characters from pictures", h.chars?.length ? `<ul>${h.chars.map(([c, story]) =>
      `<li><span class="hz hzl-big">${charLinks(c)}</span> <span class="py">${tonePy(DICT[c]?.py || "")}</span> <span class="muted">${esc(story)}</span></li>`).join("")}</ul>` : "")}
    ${sec("结构 Structure", h.structure ? `<p><b>${esc(h.structure[0])}</b> · <span class="muted">${esc(h.structure[1])}</span></p><p>${hzRow(h.structure[2])}</p>` : "")}
    ${sec("偏旁 Radicals", h.radicals?.length ? `<ul>${h.radicals.map(([r, en, ex]) =>
      `<li><span class="hz hzl-big">${r}</span> <span class="muted">${esc(en)}</span> · ${hzRow(ex)}</li>`).join("")}</ul>` : "")}
    <div class="controls">${onRadicals ? `<button class="btn primary" type="button" id="hzlQuiz">部 Which radical? quiz</button>` : ""}${ui.backBtn()}</div>
  </div>`;
  ui.wireBack(ui.body());
  ui.body().querySelector("#hzlQuiz")?.addEventListener("click", onRadicals);
}

export function pronTips(ui, lesson) {
  const tips = lesson.pron || [];
  ui.body().innerHTML = `<div class="panel gr">
    <span class="lbl">语音 · Pronunciation · ${esc(lesson.cn)}</span>
    ${tips.map((x) => `<section class="gr-note">
      <h3>${esc(x.t)}</h3><p>${esc(x.en)}</p>
      <ul>${x.ex.map((e) => `<li><span class="hz">${charLinks(e)}</span> <span class="py">${tonePy(DICT[e]?.py || "")}</span> ${sayBtns(e, "example", true)}</li>`).join("")}</ul>
    </section>`).join("")}
    ${ui.backBtn()}
  </div>`;
  ui.wireBack(ui.body());
}
