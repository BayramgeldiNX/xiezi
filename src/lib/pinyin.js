// Pinyin helpers: split into syllables, color by tone, add/remove tone marks.
export const TONED = { ā:"a1",á:"a2",ǎ:"a3",à:"a4",ē:"e1",é:"e2",ě:"e3",è:"e4",ī:"i1",í:"i2",ǐ:"i3",ì:"i4",ō:"o1",ó:"o2",ǒ:"o3",ò:"o4",ū:"u1",ú:"u2",ǔ:"u3",ù:"u4",ǖ:"v1",ǘ:"v2",ǚ:"v3",ǜ:"v4",ü:"v5" };
const FINALS = ["iang","iong","uang","ueng","ang","eng","ing","ong","ian","iao","uai","uan","van","ai","ei","ao","ou","an","en","in","un","vn","ia","ie","iu","ua","uo","ui","ue","ve","er","a","o","e","i","u","v"];
const INITIALS = ["zh","ch","sh","b","p","m","f","d","t","n","l","g","k","h","j","q","x","r","z","c","s","y","w"];

// Split one pinyin word ("Huáichéng") into syllables, each with its tone (5 = neutral).
export function syllables(word) {
  const chars = [...word], plain = [], tones = [];
  for (const ch of chars) {
    const low = ch.toLowerCase(), t = TONED[low];
    plain.push(t ? t[0] : low);
    tones.push(t && t[1] !== "5" ? +t[1] : 0);
  }
  const s = plain.join(""), out = [];
  let i = 0;
  while (i < s.length) {
    let len = 0;
    const ini = INITIALS.find((x) => s.startsWith(x, i)) || "";
    for (const f of FINALS) {
      if (!s.startsWith(f, i + ini.length)) continue;
      const end = i + ini.length + f.length;
      // a final ending in n/ng/r must not steal the next syllable's vowel
      if (/(n|ng|r)$/.test(f) && /[aeiouv]/.test(s[end] || "")) {
        const shorter = f.replace(/(ng|n|r)$/, "");
        if (FINALS.includes(shorter) || f === "ng") continue;
      }
      len = ini.length + f.length;
      break;
    }
    if (!len) len = 1;
    // erhua: 哪儿 nǎr, 一点儿 yìdiǎnr — the r belongs to the syllable before it
    else if (s[i + len] === "r" && !/[aeiouv]/.test(s[i + len + 1] || "") && !s.startsWith("er", i + len - 1)) len++;
    const part = chars.slice(i, i + len).join("");
    out.push([part, tones.slice(i, i + len).find((t) => t) || 5]);
    i += len;
  }
  return out;
}

export function tonePy(text) {
  return text.split(/([A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+)/).map((tok, k) =>
    k % 2 === 0 ? tok : syllables(tok).map(([p, t]) => `<span class="t${t}">${p}</span>`).join("")
  ).join("");
}

export const stripTone = (s) => [...s].map((ch) => (TONED[ch] ? TONED[ch][0].replace("v", "ü") : ch)).join("");

// Up to 3 wrong versions of a pinyin word: one syllable gets a different tone ("nǐhǎo" → "nīhǎo").
export function toneVariants(py) {
  const out = new Set();
  const parts = py.split(" ").flatMap((w) => syllables(w).map(([p, t]) => ({ p, t })));
  const target = py.replace(/\s/g, "").toLowerCase();
  for (let tries = 0; tries < 40 && out.size < 3; tries++) {
    const k = Math.floor(Math.random() * parts.length);
    const t = 1 + Math.floor(Math.random() * 4);
    if (t === parts[k].t) continue;
    const plain = stripTone(parts[k].p).toLowerCase();
    if (!/[aeiouü]/.test(plain)) continue;
    const v = parts.map((x, i) => (i === k ? addTone(plain, t) : x.p)).join("");
    if (v.toLowerCase() !== target) out.add(v);
  }
  return [...out];
}

export function addTone(plain, tone) {
  const MARK = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", "ü": "ǖǘǚǜ" };
  let idx = plain.search(/[ae]/);
  if (idx < 0) idx = plain.indexOf("ou");
  if (idx < 0) { for (let k = plain.length - 1; k >= 0; k--) if (MARK[plain[k]]) { idx = k; break; } }
  if (idx < 0) return plain;
  return plain.slice(0, idx) + MARK[plain[idx]][tone - 1] + plain.slice(idx + 1);
}
