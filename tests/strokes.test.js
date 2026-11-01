import { describe, it, expect } from "vitest";
import chars from "../src/data/stroke-chars.gen.json";
import strokes from "../src/data/strokes.gen.json";

describe("stroke data", () => {
  it("the list of characters matches the shapes file", () => {
    expect(chars).toEqual(Object.keys(strokes));
  });
});
