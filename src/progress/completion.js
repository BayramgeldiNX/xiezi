// Lesson completion: pure logic, no DOM, no views.
// An item is a progress key, or a list of options where any one counts. An option is a key, or a
// nested list of keys that all must be right (e.g. every question of a text). A key is done once it has
// been answered right at least once: get(key)?.ok > 0. Writing keys (w: characters, d: dictation words)
// also count after WRITE_TRIES tries, mistakes or not. Neither count goes down, so neither does the %.
export const FINISHED_AT = 0.6;
export const WRITE_TRIES = 5;

const isWriteKey = (k) => k.startsWith("w:") || k.startsWith("d:");
const okKey = (k, get) => {
  const s = get(k);
  return (s?.ok || 0) > 0 || (isWriteKey(k) && (s?.n || 0) >= WRITE_TRIES);
};
const okOption = (o, get) => (Array.isArray(o) ? o.length > 0 && o.every((k) => okKey(k, get)) : okKey(o, get));
const isDone = (item, get) => (Array.isArray(item) ? item : [item]).some((o) => okOption(o, get));

// itemsBySkill: { write: [item, …], … }  →  { pct (0–100), skills: { write: {done, total} }, finished }
export function completion(itemsBySkill, get) {
  const skills = {};
  const ratios = [];
  for (const [name, items] of Object.entries(itemsBySkill)) {
    const total = items.length;
    const done = items.filter((it) => isDone(it, get)).length;
    skills[name] = { done, total };
    if (total) ratios.push(done / total); // a skill with no items is skipped
  }
  const ratio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
  return { pct: Math.round(ratio * 100), ratio, skills, finished: ratio >= FINISHED_AT };
}
