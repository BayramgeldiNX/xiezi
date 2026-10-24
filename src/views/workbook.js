// 练习册 Workbook-style exercises (the HSK test formats that work without pictures):
//   dialog  听对话，回答问题   hear a short dialogue, answer a question about it
//   judge   判断对错           does the ★ sentence follow from the text?
//   reply   选择合适的回答     pick the right reply to a sentence
//   fill    选词填空           pick the word that fills the gap (built from the lesson's example sentences)
//   radical 看部首             pick a character's radical (built from the character data)
// dialog / judge / reply come from each lesson's "workbook" data; results are saved as wb:<id>.
import { esc, shuffle } from "../lib/util.js";
import { tonePy } from "../lib/pinyin.js";
import { sayBtns } from "../lib/speech.js";
import { CHARINFO, RADICALS, LESSONS, wordsOf, lessonChars } from "../data/index.js";
import { charLinks } from "./charsheet.js";

// Every workbook item of the given lessons, each with a stable id and its kind.
export function workbookOf(lessons) {
  return lessons.flatMap((l) => {
    const wb = l.workbook || {};
    return [
      ...(wb.dialogs || []).map((d, i) => ({ ...d, kind: "dialog", id: `${l.id}/d${i + 1}`, lesson: l.id })),
      ...(wb.judge || []).map((d, i) => ({ ...d, kind: "judge", id: `${l.id}/j${i + 1}`, lesson: l.id })),
      ...(wb.replies || []).map((d, i, all) => ({ ...d, kind: "reply", id: `${l.id}/r${i + 1}`, lesson: l.id, others: all.filter((x) => x !== d).map((x) => x.a) })),
    ];
  });
}

const dialogText = (d) => d.lines.map((x) => x[1]).join("");
const hz = (t, size = 1.3) => `<span class="hz" style="font-size:${size}rem">${charLinks(t)}</span>`;
const plain = (t) => `<span class="hz" style="font-size:1.2rem">${esc(t)}</span>`; // answer buttons: no character links inside
const LABEL ={ dialog: "听对话 · Dialogue", judge: "判断 · True or false", reply: "回答 · Reply" };

// One quiz for any mix of dialog / judge / reply items.
export function workbookQuiz(ui, { items, title = "练习册 · Workbook", kind = "workbook", then }) {
  return ui.choiceQuiz({ kind, title, items, key: "wb:", id: (d) => d.id, then,
    label: (d) => (d.kind === "dialog" ? d.q : d.kind === "judge" ? d.claim : d.q),
    sayAfter: (d) => (d.kind === "judge" ? d.text : d.kind === "reply" ? d.a : ""),
    ask: (d) => {
      if (d.kind === "dialog") return { html: `<p class="hint">${LABEL.dialog}: listen, then answer.</p><p class="hz wb-q">问：${esc(d.q)}</p>`, say: dialogText(d) };
      if (d.kind === "judge") return { html: `<p class="hint">${LABEL.judge}: does the ★ sentence match?</p>
        <p class="wb-text">${hz(d.text)} ${sayBtns(d.text, "text", true)}</p><p class="wb-claim">★ ${hz(d.claim, 1.2)}</p>` };
      return { html: `<p class="hint">${LABEL.reply}: which answer fits?</p><p class="wb-text">${hz(d.q, 1.5)} ${sayBtns(d.q, "sentence", true)}</p>` };
    },
    makeOptions: (d) => {
      if (d.kind === "dialog") return d.options.map((o, i) => ({ html: plain(o), correct: i === d.answer }));
      if (d.kind === "judge") return [{ html: `<span class="en">✓ 对 · True</span>`, correct: d.ok }, { html: `<span class="en">✗ 错 · False</span>`, correct: !d.ok }];
      return [d.a, ...shuffle(d.others).slice(0, 3)].map((o, i) => ({ html: plain(o), correct: i === 0 }));
    },
    reveal: (d) => d.kind === "dialog"
      ? d.lines.map(([who, t]) => `<div class="wb-line"><span class="who">${esc(who)}</span> ${hz(t, 1.15)} ${sayBtns(t, "line", true)}</div>`).join("") + `<div class="muted">Answer: ${esc(d.options[d.answer])}</div>`
      : d.kind === "judge" ? `<span class="muted">${d.ok ? "True" : "False"}:</span> ${hz(d.text, 1.15)}`
      : `${hz(d.q, 1.15)} → ${hz(d.a, 1.15)} ${sayBtns(d.a, "reply", true)}`,
  });
}

// 选词填空: blank the word in its own example sentence.
export function fillQuiz(ui, words, { title = "选词填空 · Fill in the word", then } = {}) {
  const pool = words.filter((w) => w.ex?.hz?.includes(w.w));
  const items = shuffle(pool).slice(0, 10);
  return ui.choiceQuiz({ kind: "fill", title, items, key: "wf:", then,
    ask: (w) => ({ html: `<p class="hint">Which word fills the gap?</p>
      <p class="hz wb-q">${esc(w.ex.hz.replace(/[AB]: /g, "").replace(w.w, "（　　）"))}</p><p class="muted">${esc(w.ex.en)}</p>` }),
    makeOptions: (w) => {
      const others = [...shuffle(words), ...shuffle(wordsOf(LESSONS))].filter((x) => x.w !== w.w && !w.ex.hz.includes(x.w));
      const same = others.filter((x) => [...x.w].length === [...w.w].length);
      return [w, ...[...same, ...others].filter((x, i, a) => a.findIndex((y) => y.w === x.w) === i).slice(0, 3)]
        .map((o) => ({ html: `<span class="hz" style="font-size:1.3rem">${o.w}</span>`, correct: o === w }));
    },
    reveal: (w) => `${hz(w.ex.hz.replace(/[AB]: /g, ""), 1.2)} ${sayBtns(w.ex.hz, "sentence", true)}<br><span class="py">${tonePy(w.ex.py)}</span>`,
  });
}

// 部首: which radical does this character have?
export function radicalQuiz(ui, lesson, { title = "部首 · Which radical?", then } = {}) {
  const chars = lessonChars(lesson).filter((c) => CHARINFO[c]?.radical?.c && CHARINFO[c].radical.c !== c);
  const allRads = [...new Set(Object.values(CHARINFO).map((x) => x.radical?.c).filter(Boolean))];
  const name = (r) => RADICALS[r] || Object.values(CHARINFO).find((x) => x.radical?.c === r)?.radical?.en || "";
  return ui.choiceQuiz({ kind: "radical", title, items: shuffle(chars).slice(0, 10), key: "rad:", id: (c) => c, label: (c) => c, sayAfter: (c) => c, then,
    ask: (c) => ({ html: `<p class="hint">Which radical (部首) is in this character?</p><div class="big-hz">${c}</div>` }),
    makeOptions: (c) => {
      const r = CHARINFO[c].radical.c;
      return [r, ...shuffle(allRads.filter((x) => x !== r && !c.includes(x))).slice(0, 3)]
        .map((x) => ({ html: `<span class="hz" style="font-size:1.6rem">${x}</span> <span class="muted">${esc(name(x))}</span>`, correct: x === r }));
    },
    reveal: (c) => `${charLinks(c)} · <span class="hz">${CHARINFO[c].radical.c}</span> <span class="muted">${esc(name(CHARINFO[c].radical.c))}</span>`,
  });
}
