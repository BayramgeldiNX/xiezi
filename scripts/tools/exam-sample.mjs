// Prints a test paper as plain text, for a teacher to proof-read.
//   node scripts/tools/exam-sample.mjs <book> <testId> <seed>
// Applies src/data/exam-exclude.json. Loads the modules through Vite, because the data uses import.meta.glob.
import { createServer } from "vite";
import { readFileSync, existsSync } from "node:fs";

const [bookId, testId, seedArg] = process.argv.slice(2);
if (!bookId || !testId || seedArg === undefined) {
  console.error("usage: node scripts/tools/exam-sample.mjs <book> <testId> <seed>");
  process.exit(1);
}
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
try {
  const { BOOKS } = await vite.ssrLoadModule("/src/data/index.js");
  const { testOf, testsOf } = await vite.ssrLoadModule("/src/exam/plan.js");
  const { buildPaper } = await vite.ssrLoadModule("/src/exam/build.js");
  const book = BOOKS.find((b) => b.id === bookId);
  if (!book) throw new Error("no book " + bookId + " (have " + BOOKS.map((b) => b.id).join(", ") + ")");
  const test = testOf(book, testId);
  if (!test) throw new Error("no test " + testId + " (have " + testsOf(book).map((t) => t.id).join(", ") + ")");
  const { optsFor } = await vite.ssrLoadModule("/src/exam/build.js");
  const excludeJson = JSON.parse(readFileSync(new URL("../../src/data/exam-exclude.json", import.meta.url), "utf8"));
  const fillFile = new URL("../../src/data/exam-fill.json", import.meta.url);
  const fillJson = existsSync(fillFile) ? JSON.parse(readFileSync(fillFile, "utf8")) : {};
  const paper = buildPaper(test, book, Number(seedArg), optsFor(book, BOOKS, excludeJson, fillJson));

  const out = [];
  out.push(`${book.title} · ${test.cn} ${test.en} · seed ${paper.seed}${paper.relaxed ? ` · relaxed ${paper.relaxed}` : ""}`);
  out.push(`lessons ${test.lessons[0].n}–${test.lessons.at(-1).n}${test.earlier.length ? ` (+ earlier 1–${test.earlier.at(-1).n})` : ""} · ${test.total} questions · ${test.minutes} min`);
  for (const p of paper.parts) {
    const kinds = {};
    for (const q of p.questions) kinds[q.kind] = (kinds[q.kind] || 0) + 1;
    out.push("", `== ${p.cn} ${p.en} (${p.questions.length}: ${Object.entries(kinds).map(([k, n]) => k + " " + n).join(", ")})`);
    for (const q of p.questions) {
      out.push(`${q.n}. [${q.kind}] ${q.lesson}${q.newChars ? ` (new: ${q.newChars})` : ""}`);
      if (q.shape === "choice") {
        if (q.audio) out.push(`   (heard) ${q.audio.join(" / ")}`);
        if (q.context) q.context.forEach((c) => out.push(`   | ${c}`));
        if (q.text) out.push(`   ${q.text}`);
        q.options.forEach((o, i) => out.push(`   ${i === q.answer ? "*" : " "} ${String.fromCharCode(65 + i)}. ${o}`));
      } else if (q.shape === "order") {
        out.push(`   ${q.en}`, `   tiles: ${q.tiles.join(" | ")}`, `   * ${q.answer.join("")}${q.tail}`);
      } else {
        out.push(`   write: ${q.py}  ${q.en}`, `   * ${q.word}`);
      }
    }
  }
  console.log(out.join("\n"));
} finally {
  await vite.close();
}
