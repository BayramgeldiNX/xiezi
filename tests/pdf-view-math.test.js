import { describe, it, expect } from "vitest";
import { parsePdfHash, pdfHash, savedPage, withPage, fitSize, clampPan, zoomAt, swipeResult, tapZone, clampZoom } from "../src/pdf/view-math.js";

const pdf = { id: "ledu", pages: 50 };
describe("pdf view math", () => {
  it("parses and formats the address", () => {
    expect(parsePdfHash("#/pdf/ledu/12")).toEqual({ id: "ledu", page: 12 });
    expect(parsePdfHash("#/pdf/ledu")).toEqual({ id: "ledu", page: null });
    expect(parsePdfHash("#/pdf/ledu/x")).toEqual({ id: "ledu", page: null });
    expect(parsePdfHash("#/pdf/ledu/0")).toEqual({ id: "ledu", page: null });
    expect(parsePdfHash("#/shelf")).toBe(null);
    expect(parsePdfHash("#/pdf/")).toBe(null);
    expect(pdfHash("hsk1-tb", 7)).toBe("#/pdf/hsk1-tb/7");
  });
  it("keeps the place map", () => {
    expect(savedPage({ ledu: 12 }, pdf)).toBe(12);
    expect(savedPage({ ledu: 999 }, pdf)).toBe(50);
    expect(savedPage({ ledu: "x" }, pdf)).toBe(1);
    expect(savedPage(null, pdf)).toBe(1);
    expect(withPage({ a: 1 }, "b", 2)).toEqual({ a: 1, b: 2 });
    expect(withPage("junk", "b", 2)).toEqual({ b: 2 });
  });
  it("fits and clamps", () => {
    expect(fitSize(100, 200, 400, 400)).toEqual({ w: 200, h: 400 });
    expect(fitSize(0, 1, 1, 1)).toEqual({ w: 0, h: 0 });
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(0.3)).toBe(1);
  });
  it("pans inside the page", () => {
    expect(clampPan(500, 500, 400, 600, 400, 600, 2)).toEqual({ x: 200, y: 300 });
    expect(clampPan(50, 50, 400, 600, 400, 600, 1)).toEqual({ x: 0, y: 0 });
  });
  it("zooms about a point", () => {
    const s = zoomAt({ z: 1, x: 0, y: 0 }, 2, 100, 0);
    expect(s).toEqual({ z: 2, x: -100, y: 0 });
  });
  it("reads swipes and taps", () => {
    expect(swipeResult(-120, 300, 400)).toBe(1);
    expect(swipeResult(120, 300, 400)).toBe(-1);
    expect(swipeResult(-30, 300, 400)).toBe(0);
    expect(swipeResult(-40, 50, 400)).toBe(1);
    expect(tapZone(10, 300)).toBe("prev");
    expect(tapZone(150, 300)).toBe("mid");
    expect(tapZone(290, 300)).toBe("next");
  });
});
