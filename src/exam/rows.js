// The book page's list: lessons with the tests between them. Pure: no DOM. Terms: see GLOSSARY.md.
//
//   bookRows(book)  → [{ type: "lesson", lesson } | { type: "test", test }, …] in page order
//   sealFor(total)  → the seal text of a best result out of 500, or null below 300
//   markOf(test)    → the letter on a row's outline seal before a pass
import { testsOf } from "./plan.js";
import { sealOf } from "./grade.js";

export const MAX = 500;
// One rule for seals: grade.js owns the thresholds; a total out of 500 is a percentage times five.
export const sealFor = (total) => (typeof total === "number" ? sealOf(total / 5, total === MAX) : null);
export const markOf = (test) => ({ small: "测", mid: "中", final: "末" })[test.kind] || "测";

// A test follows the lesson of number `after` (its place in the book, 1-based). Tests that do not fit the book are left out.
export function bookRows(book) {
  const lessons = book.lessons || [];
  let tests = [];
  try { tests = testsOf(book).filter((t) => t.after >= 1 && t.after <= lessons.length); } catch { tests = []; }
  return lessons.flatMap((lesson, i) => [{ type: "lesson", lesson }, ...tests.filter((t) => t.after === i + 1).map((test) => ({ type: "test", test }))]);
}
