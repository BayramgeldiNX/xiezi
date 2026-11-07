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
      ...(wb.replies || []).map((d, i, all) => ({ ...d, kind: "reply", id: `${l.id}/r${i + 1}`, lesson: l.id, others: all.filter((x) => x !== d && x.q !== x.a).map((x) => x.a) })),
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
      if (d.kind === "dialog") return { html: `<p class="hint">${LABEL.dialog}: listen, then answer.</p><p class="hz wb-q">问：${esc(d.q)}</p>`, say: dialogText(d),
        peek: d.lines.map(([who, t]) => `<div class="wb-line"><span class="who">${esc(who)}</span> ${plain(t)}</div>`).join("") };
      if (d.kind === "judge") return { html: `<p class="hint">${LABEL.judge}: does the ★ sentence match?</p>
        <p class="wb-text">${hz(d.text)} ${sayBtns(d.text, "text", true)}</p><p class="wb-claim">★ ${hz(d.claim, 1.2)}</p>` };
      return { html: `<p class="hint">${LABEL.reply}: which answer fits?</p><p class="wb-text">${hz(d.q, 1.5)} ${sayBtns(d.q, "sentence", true)}</p>` };
    },
    makeOptions: (d) => {
      if (d.kind === "dialog") return d.options.map((o, i) => ({ html: plain(o), correct: i === d.answer }));
      if (d.kind === "judge") return [{ html: `<span class="en">✓ 对 · True</span>`, correct: d.ok }, { html: `<span class="en">✗ 错 · False</span>`, correct: !d.ok }];
      const bad = (o) => o === d.q || o === d.a; // never the prompt or the answer; self-answering greetings are left out of `others`
      return [d.a, ...shuffle([...new Set(d.others)].filter((o) => !bad(o))).slice(0, 3)].map((o, i) => ({ html: plain(o), correct: i === 0 }));
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
      const norm = (x) => (x.en || "").toLowerCase().replace(/\s+/g, "");
      const book = LESSONS.find((l) => l.words?.some((x) => x.w === w.w))?.book;
      const bookWords = LESSONS.filter((l) => l.book === book).flatMap((l) => l.words || []);
      const ok = (x) => x.w !== w.w && norm(x) !== norm(w) && !w.ex.hz.includes(x.w) && !x.w.includes(w.w) && !w.w.includes(x.w);
      const seen = new Set();
      const uniq = (list) => list.filter((x) => ok(x) && !seen.has(x.w) && seen.add(x.w));
      const tiers = [uniq(shuffle(words)), uniq(shuffle(bookWords)), uniq(shuffle(wordsOf(LESSONS)))];
      const len = [...w.w].length, picks = [];
      for (const t of tiers) { // same lesson first, then same book, then everything; same length first inside a tier
        for (const x of [...t.filter((y) => [...y.w].length === len), ...t.filter((y) => [...y.w].length !== len)]) if (picks.length < 3) picks.push(x);
        if (picks.length >= 3) break;
      }
      return [w, ...picks].map((o) => ({ html: `<span class="hz" style="font-size:1.3rem">${o.w}</span>`, correct: o === w }));
    },
    reveal: (w) => `${hz(w.ex.hz.replace(/[AB]: /g, ""), 1.2)} ${sayBtns(w.ex.hz, "sentence", true)}<br><span class="py">${tonePy(w.ex.py)}</span>`,
  });
}

// 部首: shared core of "which radical does this character have?".
// cfg: { items, charOf(item), radOf(item), distractors(item, r) → [radical…], nameOf(r), key, id(item), title, kind, then }
export function radicalChoice(ui, cfg) {
  const { charOf, radOf, nameOf } = cfg;
  return ui.choiceQuiz({ kind: cfg.kind, title: cfg.title, items: cfg.items, key: cfg.key, id: cfg.id, label: charOf, sayAfter: charOf, then: cfg.then, back: cfg.back,
    ask: (it) => ({ html: `<p class="hint">Which radical (部首) is in this character?</p><div class="big-hz">${charOf(it)}</div>` }),
    makeOptions: (it) => {
      const r = radOf(it);
      return [r, ...cfg.distractors(it, r)]
        .map((x) => ({ html: `<span class="hz" style="font-size:1.6rem">${x}</span> <span class="muted">${esc(nameOf(x))}</span>`, correct: x === r }));
    },
    reveal: (it) => `${charLinks(charOf(it))} · <span class="hz">${radOf(it)}</span> <span class="muted">${esc(nameOf(radOf(it)))}</span>`,
  });
}

// 部首: which radical does this character have? (lesson version, saved as rad:<char>)
export function radicalQuiz(ui, lesson, { title = "部首 · Which radical?", then } = {}) {
  const chars = lessonChars(lesson).filter((c) => CHARINFO[c]?.radical?.c && CHARINFO[c].radical.c !== c);
  const allRads = [...new Set(Object.values(CHARINFO).map((x) => x.radical?.c).filter(Boolean))];
  const name = (r) => RADICALS[r] || Object.values(CHARINFO).find((x) => x.radical?.c === r)?.radical?.en || "";
  return radicalChoice(ui, { kind: "radical", title, items: shuffle(chars).slice(0, 10), key: "rad:", id: (c) => c, then,
    charOf: (c) => c, radOf: (c) => CHARINFO[c].radical.c, nameOf: name,
    distractors: (c, r) => shuffle(allRads.filter((x) => x !== r && !c.includes(x))).slice(0, 3),
  });
}
