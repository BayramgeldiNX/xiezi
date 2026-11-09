// A short key for one question, built from its text, so it stays the same when lessons are re-imported.
// Shared by scripts/explain.mjs (writes the explanations) and src/lib/explain.js (reads them).
export function explainKey(type, ...parts) {
  const s = [type, ...parts.flat()].join("\u0001");
  let h = 0x811c9dc5; // FNV-1a, 32 bit
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return type[0] + (h >>> 0).toString(36);
}

// The key of each kind of question, from the fields the quiz screens already have.
export const keyOf = {
  grammar: (d) => explainKey("grammar", d.q, d.options),
  reading: (q) => explainKey("reading", q.q, q.options),
  dialog: (d) => explainKey("dialog", d.lines.map((x) => x.join(":")), d.q, d.options),
  judge: (d) => explainKey("judge", d.text, d.claim),
};
