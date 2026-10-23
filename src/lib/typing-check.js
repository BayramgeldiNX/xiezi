// Checking typed answers (pure functions, unit-tested).
import { syllables, stripTone } from "./pinyin.js";

// Characters only: spaces and punctuation don't matter.
const PUNCT = /[\s，。！？、,.!?：:；;“”"'‘’（）()…—\-·]/g;
export const cleanHanzi = (s) => s.replace(PUNCT, "");

// Chinese typing: compare character by character. Returns { ok, chars: [{ c, ok }] } for the expected text.
export function checkHanzi(expected, typed) {
  const e = [...cleanHanzi(expected)], t = [...cleanHanzi(typed)];
  const chars = e.map((c, i) => ({ c, ok: t[i] === c }));
  return { ok: e.length === t.length && chars.every((x) => x.ok), chars, typed: t.join("") };
}

// The expected pinyin as plain syllables with tone numbers: "nǐ hǎo" → [{ p: "ni", tone: 3 }, { p: "hao", tone: 3 }].
// Neutral tone = 5. ü is written v (the way it's typed).
export function toneSyllables(py) {
  return py.replace(/[^A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s']/g, " ").split(/[\s']+/).filter(Boolean)
    .flatMap((w) => syllables(w).map(([s, tone]) => ({ s, p: stripTone(s).toLowerCase().replace(/ü/g, "v"), tone })));
}

// Pinyin typing with tone numbers: "ni3 hao3", "ni3hao3", "xie4 xie" (no number = neutral), "lv4" / "lü4" / "lu:4".
// Returns { ok, spellingOk, syllables: [{ s, p, tone, got, gotTone, spellOk, toneOk }] }.
export function checkPinyin(expectedPy, typed) {
  const exp = toneSyllables(expectedPy);
  const input = typed.toLowerCase().replace(/u:/g, "v").replace(/ü/g, "v").replace(/[^a-z0-9]/g, "");
  let i = 0;
  const out = exp.map((x) => {
    const got = input.slice(i, i + x.p.length);
    const spellOk = got === x.p;
    if (spellOk) i += x.p.length;
    else {
      // Resync: skip this syllable's letters as typed (up to the next digit).
      const m = input.slice(i).match(/^[a-z]*/);
      i += m ? m[0].length : 0;
    }
    let gotTone = null;
    if (/[0-5]/.test(input[i] || "")) { gotTone = +input[i] === 0 ? 5 : +input[i]; i++; }
    const toneOk = x.tone === 5 ? gotTone === null || gotTone === 5 : gotTone === x.tone;
    return { ...x, got: spellOk ? got : (got || "?"), gotTone, spellOk, toneOk };
  });
  // Tone change in speech: a 3rd tone before another 3rd tone is said as a 2nd tone (你好 nǐ hǎo → ní hǎo).
  // Typing what you hear (2) is accepted and noted.
  out.forEach((s, k) => {
    if (!s.toneOk && s.tone === 3 && s.gotTone === 2 && out[k + 1]?.tone === 3) { s.toneOk = true; s.sandhi = true; }
  });
  const extra = i < input.length;
  const spellingOk = out.every((s) => s.spellOk) && !extra;
  return { ok: spellingOk && out.every((s) => s.toneOk), spellingOk, extra, sandhi: out.some((s) => s.sandhi), syllables: out };
}

export const TONE_HELP = {
  1: "1 · high and flat ˉ",
  2: "2 · rising ˊ",
  3: "3 · dips down, then up ˇ",
  4: "4 · falling ˋ",
  5: "5 or no number · neutral (light)",
};
