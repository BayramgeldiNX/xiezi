// Pure helpers for the radical lesson (no DOM): step list, addresses, next radical.
export const learnHash = (r, n = 1) => `#/radical/${encodeURIComponent(r)}/learn/${n}`;
export const picId = (r) => r.codePointAt(0).toString(16);
// Step ids in order for a radical: the sound step only when there is something to show.
export function lessonSteps(x) {
  const L = x?.lesson || {};
  const sound = x?.kind === "shape" ? !!(L.shape || (x.examples || []).length) : (L.sound || []).length > 0;
  return ["story", "shape", "part", "family", sound ? "sound" : null, "check"].filter(Boolean);
}
export const stepIndex = (step, total) => Math.min(Math.max(parseInt(step, 10) || 1, 1), total);
export const nextRadical = (all, r) => { const i = all.findIndex((x) => x.r === r); return i >= 0 ? all[i + 1] || null : null; };
export const firstUndone = (all, done) => all.find((x) => !done(x.r)) || null;

