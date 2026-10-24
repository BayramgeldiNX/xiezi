// Builds a book's lesson files from one plain-text source:
//
//   node scripts/import-book.mjs <book-id> path/to/source.txt
//
// Source format (fields separated by " | "):
//   # <n> <title> | <English title>
//   word | pinyin | English | example 汉字 | example pinyin | example English
//   ## <reading-id> <title> | <pinyin> | <English>
//   <speaker> | 汉字 | pinyin | English          (a reading line)
//   ? <question> | right answer / wrong / wrong / wrong
// New characters are added to chars.json with stroke names guessed from the stroke data
// (scripts/stroke-types.mjs); meanings and memory tips are listed as still to do.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, BOOKS_DIR, readJSON, writeJSON, isHanzi, loadBooks, strokeData } from "./lib.mjs";
import { strokeType } from "./stroke-types.mjs";

const CN_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];

const [bookId, ...files] = process.argv.slice(2);
const book = loadBooks().find((b) => b.id === bookId);
if (!book || !files.length) {
  console.error("Usage: node scripts/import-book.mjs <book-id> source.txt [grammar.txt …]");
  process.exit(1);
}

const split = (l) => l.split("|").map((s) => s.trim());
const lessons = [];
let L = null, R = null, G = null;
for (const file of files) for (const [i, raw] of fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).entries()) {
  const line = raw.trim();
  if (!line) continue;
  const where = `${file} line ${i + 1}`;
  if (/^# \d+$/.test(line)) {
    // A later file adding to a lesson (e.g. its grammar drills).
    L = lessons.find((l) => l.n === +line.slice(2));
    if (!L) throw new Error(`${where}: no lesson ${line.slice(2)}`);
    R = null;
  } else if (line.startsWith("= ")) {
    const [point, en] = split(line.slice(2));
    G = { point, en, drills: [] };
    (L.grammar ||= []).push(G);
  } else if (line.startsWith("_ ")) {
    const [q, opts, en] = split(line.slice(2));
    if (!en || !q.includes("___")) throw new Error(`${where}: drill needs sentence with ___ | right / wrong … | English`);
    G.drills.push({ q, options: opts.split(" / ").map((s) => s.trim()), answer: 0, en });
  } else if (/^[DJR] /.test(line)) {
    // Workbook items:  D line / line | question | right / wrong / wrong    J text | ★ claim | ✓ or x    R sentence | reply
    const [a, b, c] = split(line.slice(2));
    const wb = (L.workbook ||= { dialogs: [], judge: [], replies: [] });
    if (line[0] === "D") {
      if (!c) throw new Error(`${where}: dialog needs lines | question | options`);
      wb.dialogs.push({ lines: a.split(" / ").map((t, i) => [i % 2 ? "女" : "男", t.trim()]), q: b, options: c.split(" / ").map((s) => s.trim()), answer: 0 });
    } else if (line[0] === "J") {
      if (!/^[✓x]$/.test(c || "")) throw new Error(`${where}: judge needs text | claim | ✓ or x`);
      wb.judge.push({ text: a, claim: b, ok: c === "✓" });
    } else {
      if (!b) throw new Error(`${where}: reply needs sentence | reply`);
      wb.replies.push({ q: a, a: b });
    }
  } else if (line.startsWith("## ")) {
    const [head, py, en] = split(line.slice(3));
    const [, id, title] = head.match(/^(\S+)\s+(.+)$/) || [];
    R = { id, source: "practice", title, py, en, lines: [], questions: [] };
    (L.readings ||= []).push(R);
  } else if (line.startsWith("# ")) {
    const [head, en] = split(line.slice(2));
    const [, n, title] = head.match(/^(\d+)\s+(.+)$/) || [];
    L = { n: +n, cn: `第${CN_NUM[+n] || n}课`, title, en, words: [] };
    lessons.push(L);
    R = null;
  } else if (line.startsWith("? ")) {
    const [q, opts] = split(line.slice(2));
    R.questions.push({ q, options: opts.split(" / ").map((s) => s.trim()), answer: 0 });
  } else if (R) {
    const [who, hz, py, en] = split(line);
    if (!en) throw new Error(`${where}: reading line needs speaker | 汉字 | pinyin | English`);
    R.lines.push({ who, hz, py, en });
  } else {
    const [w, py, en, exHz, exPy, exEn] = split(line);
    if (!exEn) throw new Error(`${where}: word line needs 6 fields`);
    L.words.push({ w, py, en, ex: { hz: exHz, py: exPy, en: exEn } });
  }
}

const dir = path.join(BOOKS_DIR, book.dir);
for (const l of lessons) writeJSON(path.join(dir, `lesson${String(l.n).padStart(2, "0")}.json`), l);

const charsPath = path.join(DATA_DIR, "chars.json");
const chars = readJSON(charsPath);
const added = [];
for (const l of lessons) for (const w of l.words) {
  const sylls = w.py.split(/[\s'’]+/).flatMap((p) => p.match(/[^aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]*[aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+(?:ng|n|r(?![aeiouāáǎàēéěèīíǐìōóǒòūúǔù]))?/gi) || []);
  [...w.w].filter(isHanzi).forEach((c, i) => {
    if (chars[c]) return;
    const d = strokeData(c);
    if (!d) return console.error(`${c}: no stroke data`);
    chars[c] = { py: (sylls[i] || "").toLowerCase(), en: [...w.w].length === 1 ? w.en : "", tip: "", strokes: d.medians.map(strokeType) };
    added.push(c);
  });
}
writeJSON(charsPath, chars);
console.log(`${book.id}: ${lessons.length} lessons, ${lessons.reduce((t, l) => t + l.words.length, 0)} words, ${lessons.reduce((t, l) => t + (l.readings?.length || 0), 0)} readings`);
console.log(`${added.length} new characters: ${added.join("")}`);
