// The printed book's own texts and grammar notes for a lesson, loaded from Firestore after sign-in
// (they are not in the public app). Returned in the same shape as the app's practice readings.
import { bookContent } from "./sync.js";
import { addRecordings } from "../lib/speech.js";

const CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const cache = new Map();

const clean = (t) => t.replace(/[AB]: /g, "").trim();
async function sha12(text) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

export function lessonContent(book, n) {
  const id = `${book}/${n}`;
  if (!cache.has(id)) {
    cache.set(id, load(book, n).then((r) => {
      if (r.status !== "ok") cache.delete(id); // try again next time (e.g. after signing in)
      return r;
    }));
  }
  return cache.get(id);
}

async function load(book, n) {
  const r = await bookContent(book, n).catch(() => ({ status: "error" }));
  if (r.status !== "ok") return { status: r.status, texts: [], notes: [] };
  const texts = r.texts.map((t, i) => {
    const [title, en] = (t.title || "").split(" · ");
    return {
      id: `b${i + 1}`, key: `${book}/${n}/b${i + 1}`, source: "book",
      title: title || `课文${CN[i + 1] || i + 1}`, py: "", en: en || `Text ${i + 1}`,
      lines: t.lines.map(([who, hz, py, en]) => ({ who, hz, py, en })),
    };
  });
  const said = [...texts.flatMap((t) => t.lines.map((l) => l.hz)), ...r.notes.flatMap((x) => x.examples || [])].map(clean);
  const urls = {};
  for (const t of new Set(said)) {
    try {
      const bytes = r.audio[await sha12(t)];
      if (bytes) urls[t] = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    } catch {}
  }
  addRecordings(urls);
  return { status: "ok", texts, notes: r.notes };
}
