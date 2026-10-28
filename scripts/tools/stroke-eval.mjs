// Measure scripts/stroke-types.mjs against the hand-checked stroke names in chars.json.
// node scripts/tools/stroke-eval.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import { strokeType, describe } from "../stroke-types.mjs";

const require = createRequire(import.meta.url);
const chars = JSON.parse(fs.readFileSync(new URL("../../src/data/chars.json", import.meta.url), "utf8"));
let ok = 0, n = 0; const bad = [];
for (const [c, info] of Object.entries(chars)) {
  const d = require(`hanzi-writer-data/${c}.json`);
  d.medians.forEach((m, i) => {
    n++;
    const got = strokeType(m), want = info.strokes[i];
    if (got === want) ok++; else bad.push(`${c}#${i + 1} want ${want} got ${got}  [${describe(m)}]`);
  });
}
console.log(`accuracy ${ok}/${n} = ${Math.round((ok / n) * 100)}%`);
console.log(bad.join("\n"));
