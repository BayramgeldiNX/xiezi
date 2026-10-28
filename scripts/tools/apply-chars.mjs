// Apply character notes to src/data/chars.json: node scripts/tools/apply-chars.mjs data-src/<book>-chars.txt
// Each line: char | meaning | memory tip | stroke names (space-separated, optional). Lines starting with # are skipped.
import fs from "node:fs";

const file = new URL("../../src/data/chars.json", import.meta.url);
const chars = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
const lines = fs.readFileSync(process.argv[2], "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
for (const l of lines) {
  const [c, en, tip, strokes] = l.split("|").map((s) => s.trim());
  if (!chars[c]) { console.error("not in chars.json (run gen:data first):", c); continue; }
  if (en) chars[c].en = en;
  if (tip) chars[c].tip = tip;
  if (strokes) {
    const s = strokes.split(/\s+/);
    if (s.length !== chars[c].strokes.length) console.error(`${c}: ${s.length} names for ${chars[c].strokes.length} strokes`);
    chars[c].strokes = s;
  }
}
fs.writeFileSync(file, JSON.stringify(chars, null, 2) + "\n");
