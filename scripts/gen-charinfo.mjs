// Builds src/data/charinfo.gen.json: for every lesson character its parts, radical, origin hint and
// look-alikes, from the Make Me a Hanzi dictionary (https://github.com/skishore/makemeahanzi).
// Needs data-src/makemeahanzi-dictionary.txt (see README). Without it, the existing file is kept.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, DATA_DIR, loadLessons, lessonChars, readJSON, writeJSON } from "./lib.mjs";

const SRC = path.join(ROOT, "data-src/makemeahanzi-dictionary.txt");
const OUT = path.join(DATA_DIR, "charinfo.gen.json");
const IDS = /[⿰-⿿？]/u;

export function genCharInfo() {
  if (!fs.existsSync(SRC)) {
    console.log("charinfo: dictionary not downloaded, keeping existing charinfo.gen.json");
    return;
  }
  const dict = new Map();
  for (const line of fs.readFileSync(SRC, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    dict.set(e.character, e);
  }
  const brief = (c) => {
    const e = dict.get(c);
    return e ? { py: e.pinyin?.[0] || "", en: (e.definition || "").split(/[;,]/)[0].trim() } : { py: "", en: "" };
  };
  const similar = readJSON(path.join(DATA_DIR, "similar.json"));
  const out = {};
  for (const c of lessonChars(loadLessons())) {
    const e = dict.get(c);
    if (!e) continue;
    // Direct parts: the top-level components of the decomposition (nested structures flattened one level).
    // "？" marks an unknown part: then the breakdown is a guess (气 = ⿱亻？ would wrongly say "person"), so skip it.
    const parts = (e.decomposition || "").includes("？") ? [] : [...(e.decomposition || "")].filter((x) => !IDS.test(x));
    out[c] = {
      dec: e.decomposition || "",
      parts: [...new Set(parts)].map((p) => ({ c: p, ...brief(p) })),
      radical: e.radical ? { c: e.radical, ...brief(e.radical) } : null,
      hint: e.etymology?.hint || "",
      type: e.etymology?.type || "",
      phonetic: e.etymology?.phonetic || "",
      semantic: e.etymology?.semantic || "",
      similar: (similar[c] || []).filter((s) => s !== c).map((s) => ({ c: s, ...brief(s) })),
    };
  }
  writeJSON(OUT, out);
  console.log(`charinfo.gen.json: ${Object.keys(out).length} characters`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) genCharInfo();
