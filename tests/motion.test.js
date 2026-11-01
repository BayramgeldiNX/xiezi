import { describe, it, expect, vi } from "vitest";
import { pageDepth, slideDirection, animate } from "../src/lib/motion.js";

describe("pageDepth", () => {
  it("ranks pages by how deep they are", () => {
    expect(pageDepth("")).toBe(0);
    expect(pageDepth("#/")).toBe(0);
    expect(pageDepth("#")).toBe(0);
    for (const h of ["#/books", "#/review", "#/typing", "#/search", "#/notebook"]) expect(pageDepth(h)).toBe(1);
    expect(pageDepth("#/book/hsk1")).toBe(2);
    expect(pageDepth("#/book/hsk1/review")).toBe(2);
    expect(pageDepth("#/notebook/你好")).toBe(2);
    expect(pageDepth("#/lesson/hsk1/3/write")).toBe(3);
    expect(pageDepth("#/print/hsk1/3")).toBe(4);
  });
});

describe("slideDirection", () => {
  it("goes forward into deeper pages and back out", () => {
    expect(slideDirection("#/", "#/books")).toBe("forward");
    expect(slideDirection("#/lesson/hsk1/3/write", "#/book/hsk1")).toBe("back");
    expect(slideDirection("#/books", "#/typing")).toBe("none");
    expect(slideDirection("#/book/a", "#/book/b/review")).toBe("none");
  });
});

describe("animate", () => {
  it("does nothing under reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const el = { animate: vi.fn() };
    animate(el, [{ opacity: 0 }, { opacity: 1 }]);
    expect(el.animate).not.toHaveBeenCalled();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    animate(el, [{ opacity: 0 }, { opacity: 1 }]);
    expect(el.animate).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
