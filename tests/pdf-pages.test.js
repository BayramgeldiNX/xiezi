import { describe, it, expect } from "vitest";
import { pdfById, pdfsForBook, printedLabel, lessonPage, clampPage, PDFS } from "../src/pdf/pages.js";

describe("pdf pages", () => {
  it("finds pdfs", () => {
    expect(pdfById("kouyu").book).toBe("kouyu-rumen");
    expect(pdfById("nope")).toBe(null);
    expect(pdfsForBook("hsk1").map((p) => p.kind)).toEqual(["textbook", "workbook"]);
    expect(pdfsForBook("ledu").length).toBe(1);
  });
  it("printed labels run on from each start", () => {
    const k = pdfById("kouyu");
    expect(printedLabel(k, 1)).toBe(12);
    expect(printedLabel(k, 10)).toBe(21);
    expect(printedLabel(k, 84)).toBe(97);
    expect(printedLabel(k, 152)).toBe(165);
    expect(printedLabel(k, 153)).toBe(168);
    const h = pdfById("hsk1-tb");
    expect(printedLabel(h, 1)).toBe(null);
    expect(printedLabel(h, 14)).toBe(null);
    expect(printedLabel(h, 15)).toBe(2);
  });
  it("lesson pages", () => {
    expect(lessonPage(pdfById("kouyu"), 3)).toBe(6);
    expect(lessonPage(pdfById("kouyu"), 99)).toBe(null);
  });
  it("clamps", () => {
    const k = pdfById("kouyu");
    expect(clampPage(k, 0)).toBe(1);
    expect(clampPage(k, 9999)).toBe(k.pages);
    expect(clampPage(k, "x")).toBe(1);
    expect(clampPage(k, 5.4)).toBe(5);
  });
  it("every lesson page is inside its pdf", () => {
    for (const p of PDFS) for (const v of Object.values(p.lessons)) expect(v >= 1 && v <= p.pages).toBe(true);
  });
});

import { bookLinksFor, pageKey, isStale, ownerFromStore, shelfVisible } from "../src/pdf/pages.js";
describe("bookLinksFor", () => {
  it("lists both books for the owner, textbook first", () => {
    const both = bookLinksFor("hsk1", 3, true);
    expect(both.map((l) => l.id)).toEqual(["hsk1-tb", "hsk1-wb"]);
    expect(both[0].hash).toBe("#/pdf/hsk1-tb/27");
    expect(both[0].label).toBe("Book p. 14");
    expect(both[1].label).toMatch(/^Workbook p\. \d+$/);
  });
  it("shows nothing for anyone else, or for no such lesson", () => {
    expect(bookLinksFor("hsk1", 3, false)).toEqual([]);
    expect(bookLinksFor("hsk1", 3, null)).toEqual([]);
    expect(bookLinksFor("hsk1", 99, true)).toEqual([]);
  });
});
describe("page cache rules", () => {
  it("keys are the id and a 3-digit page", () => {
    expect(pageKey("ledu", 3)).toBe("ledu-003");
    expect(pageKey("hsk1-tb", 142)).toBe("hsk1-tb-142");
  });
  it("a page is stale when missing or older than the expected image version", () => {
    const pdf = { img: { v: 2 } };
    expect(isStale(null, pdf)).toBe(true);
    expect(isStale({ v: 1 }, pdf)).toBe(true);
    expect(isStale({ v: 2 }, pdf)).toBe(false);
    expect(isStale({ v: 3 }, pdf)).toBe(false);
    expect(isStale({ v: 1 }, { img: { v: 1 } })).toBe(false);
  });
  it("the owner flag is stored as 1 and read strictly", () => {
    expect(ownerFromStore("1")).toBe(true);
    for (const x of [null, "", "0", "true", undefined]) expect(ownerFromStore(x)).toBe(false);
    expect(shelfVisible(true)).toBe(true);
    expect(shelfVisible(false)).toBe(false);
    expect(shelfVisible(null)).toBe(false);
  });
});
