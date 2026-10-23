import { describe, it, expect } from "vitest";
import fs from "node:fs";
import AUDIO from "../src/data/audio.gen.json";
import chars from "../src/data/chars.json";
import glossary from "../src/data/glossary.json";
import toneSets from "../src/data/tone-sets.json";

const lessons = Object.values(import.meta.glob("../src/data/books/*/lesson*.json", { eager: true, import: "default" }));
const clean = (t) => t.replace(/[AB]: /g, "").trim();

// Every text the app can say must have a natural recording (otherwise it falls back to the robot voice).
describe("recorded audio", () => {
  const needed = new Set();
  for (const l of lessons) {
    for (const w of l.words) { needed.add(w.w); if (w.ex?.hz) needed.add(clean(w.ex.hz)); }
    for (const r of l.readings || []) for (const line of r.lines) needed.add(line.hz);
  }
  Object.keys(chars).forEach((c) => needed.add(c));
  Object.keys(glossary).forEach((g) => needed.add(g));
  toneSets.forEach(([, ...hz]) => hz.filter(Boolean).forEach((c) => needed.add(c)));

  it("exists for every word, sentence, reading line and character", () => {
    const missing = [...needed].filter((t) => !AUDIO[t]);
    expect(missing, "run npm run gen:audio").toEqual([]);
  });
  it("every listed recording file is really there", () => {
    const gone = Object.entries(AUDIO).filter(([, f]) => !fs.existsSync(`public/audio/${f}.mp3`)).map(([t]) => t);
    expect(gone).toEqual([]);
  });
});
