// Book PDFs: pure helpers over src/data/book-pdfs.json (no files, no browser APIs).
import data from "../data/book-pdfs.json";

export const PDFS = data.pdfs;
export const pdfById = (id) => PDFS.find((p) => p.id === id) || null;
// One book's PDFs, textbook first, then workbook.
export const pdfsForBook = (book) => PDFS.filter((p) => p.book === book).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "textbook" ? -1 : 1));

// The number printed on a page, or null (unnumbered, or outside the book's numbering).
export function printedLabel(pdf, page) {
  let hit = null;
  for (const [from, no] of pdf?.printed || []) {
    if (from <= page) hit = [from, no]; else break;
  }
  if (!hit || hit[1] == null) return null;
  return hit[1] + (page - hit[0]);
}

// The PDF page where a lesson starts, or null.
export function lessonPage(pdf, lesson) {
  const p = pdf?.lessons?.[String(lesson)];
  return Number.isInteger(p) ? p : null;
}

// Keep a page number inside 1..pages (anything not a number becomes 1).
export function clampPage(pdf, page) {
  const n = Math.round(Number(page));
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(n, 1), pdf?.pages || 1);
}

// Quiet links from a lesson into the book PDFs that are on this device: [{ id, label, hash }].
// `have` is a Set of pdf ids (or null while unknown). Textbook first. Label uses the printed number, else the PDF page.
export function bookLinksFor(book, lessonNo, have) {
  const out = [];
  if (!have) return out;
  for (const pdf of pdfsForBook(book)) {
    if (!have.has(pdf.id)) continue;
    const page = lessonPage(pdf, lessonNo);
    if (page == null) continue;
    const no = printedLabel(pdf, page) ?? page;
    out.push({ id: pdf.id, label: `${pdf.kind === "workbook" ? "Workbook" : "Book"} p. ${no}`, hash: `#/pdf/${pdf.id}/${page}` });
  }
  return out;
}
