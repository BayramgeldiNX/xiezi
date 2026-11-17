// "Do I need to learn this?" for any character or part of one. Pure: the card passes in what it knows.
//   charKind(c, entry, env) -> { kind, text, full?, family? }
//   entry = charParts(c) (null when the dictionary has nothing), with tier 0-3 (2 and 3 are common)
//   env   = { lesson: "HSK 2 · Lesson 5" | null,           where it comes in your books
//             side: { full, name, core } | null,           c is a side form of a radical (扌 of 手); core = its page, #/radical/<core>
//             family: [chars] }                            characters that take their sound from c
// Order, first match wins: in your books, radical side form, no entry or no sound (a bare shape),
// a stub entry nobody uses (a bare shape), common, mostly a part.
import { stripTone } from "./pinyin.js";

export const COMMON_TIER = 2;
const SHAPE = "A basic shape, not a character. The trail ends here.";

export function charKind(c, entry, env = {}) {
  const { lesson = null, side = null, family = [] } = env;
  if (lesson) return { kind: "book", text: lesson === true ? "You know it." : `Comes in ${lesson}.` };
  if (side) {
    const of = side.full ? `Side form of ${side.full}${side.name ? ` (${side.name})` : ""}` : `A radical form${side.name ? ` (${side.name})` : ""}`;
    return { kind: "side", full: side.full || "", core: side.core || "", text: `${of}. Never written alone: learn the shape.` };
  }
  if (!entry || !entry.py) return { kind: "shape", text: SHAPE };
  if (!entry.tier && !entry.dec && !entry.type && !entry.hint) return { kind: "shape", text: SHAPE }; // a bare stub nobody uses
  if (entry.tier >= COMMON_TIER) return { kind: "common", text: "Common on its own: worth learning." };
  if (family.length) {
    return { kind: "part", family, text: `Rare on its own. Learn it as a part: it gives the sound ${stripTone(entry.py)} in ${family.slice(0, 4).map((f) => f.c).join(" ")}.` };
  }
  return { kind: "part", family, text: "Rare on its own: you will mostly meet it as a part of other characters." };
}
