import { stripTone } from "./pinyin.js";

// Does a word match what was typed? 汉字, pinyin with or without tones and spaces, or English.
export function matchesWord(w, q) {
  const raw = q.trim();
  if (!raw) return true;
  const t = stripTone(raw.toLowerCase());
  return w.w.includes(raw) || stripTone(w.py.toLowerCase()).replace(/\s/g, "").includes(t.replace(/\s/g, "")) || w.en.toLowerCase().includes(t);
}
