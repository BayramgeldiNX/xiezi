// Lesson completion: pure logic, no DOM, no views.
// An item is a progress key (or a list of keys where any one counts). It is done once it has
// been answered right at least once: get(key)?.ok > 0. That count never goes down, so neither does the %.
export const FINISHED_AT = 0.6;

const isDone = (item, get) => (Array.isArray(item) ? item : [item]).some((k) => (get(k)?.ok || 0) > 0);

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
