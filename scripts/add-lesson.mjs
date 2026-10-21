// Adds a lesson from a simple tab-separated word list.
//
//   npm run add-lesson -- lessons-in/lesson02.tsv
//
// The .tsv file: first line   = lesson title in Chinese (e.g. 你是哪国人)
//                other lines  = word <TAB> pinyin <TAB> English <TAB> example 汉字 <TAB> example pinyin <TAB> example English
// It writes src/data/lessons/lessonNN.json, adds new characters to chars.json with
// placeholders (meaning, memory trick, stroke names) and lists what still needs filling in.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, LESSON_DIR, readJSON, writeJSON, isHanzi, loadLessons, strokeData } from "./lib.mjs";

const CN_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run add-lesson -- path/to/lessonNN.tsv");
  process.exit(1);
}
const lines = fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const title = lines.shift();
const n = loadLessons().length + 1;
const words = lines.map((l, i) => {
  const [w, py, en, exHz = "", exPy = "", exEn = ""] = l.split("\t").map((s) => s.trim());
  if (!w || !py || !en) throw new Error(`Line ${i + 2}: need at least word, pinyin and English separated by tabs`);
  return { w, py, en, ex: { hz: exHz, py: exPy, en: exEn } };
});

const charsPath = path.join(DATA_DIR, "chars.json");
const chars = readJSON(charsPath);
const todo = [];
for (const w of words) {
  const sylls = w.py.split(/[\s']+/).flatMap((p) => p.match(/[^aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]*[aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+(?:ng|n|r(?![aeiou]))?/gi) || []);
  [...w.w].filter(isHanzi).forEach((c, i) => {
    if (chars[c]) return;
    const d = strokeData(c);
    if (!d) { todo.push(`${c}: no stroke data available, cannot be practiced`); return; }
    chars[c] = { py: (sylls[i] || "").toLowerCase(), en: "", tip: "", strokes: Array(d.strokes.length).fill("?") };
    todo.push(`${c}: fill in "en", "tip" and ${d.strokes.length} stroke names (check "py": ${chars[c].py || "?"})`);
  });
  if (!w.ex.hz) todo.push(`${w.w}: example sentence missing`);
}

const out = path.join(LESSON_DIR, `lesson${String(n).padStart(2, "0")}.json`);
writeJSON(out, { n, cn: `第${CN_NUM[n] || n}课`, title, words });
writeJSON(charsPath, chars);
console.log(`Wrote ${path.relative(process.cwd(), out)} with ${words.length} words.`);
console.log(todo.length ? `\nStill to do:\n  ${todo.join("\n  ")}` : "\nNothing left to fill in.");
console.log("\nThen run: npm run gen:data  (stroke data + checks)  and  npm run gen:font  (font).");
