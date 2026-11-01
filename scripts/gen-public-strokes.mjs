// Writes stroke data for every character in hanzi-writer-data to public/strokes/<hex code point>.json,
// so the Notebook can show stroke order for characters outside the books. Existing files are kept.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib.mjs";

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve("hanzi-writer-data/package.json"));
const out = path.join(ROOT, "public/strokes");
fs.mkdirSync(out, { recursive: true });

let made = 0, kept = 0;
for (const f of fs.readdirSync(pkgDir)) {
  const m = /^(.)\.json$/u.exec(f);
  if (!m || f === "package.json") continue;
  const file = path.join(out, m[1].codePointAt(0).toString(16) + ".json");
  if (fs.existsSync(file)) { kept++; continue; }
  const d = JSON.parse(fs.readFileSync(path.join(pkgDir, f), "utf8"));
  fs.writeFileSync(file, JSON.stringify({ strokes: d.strokes, medians: d.medians, radStrokes: d.radStrokes ?? null }));
  made++;
}
console.log(`public/strokes: ${made} written, ${kept} already there`);
