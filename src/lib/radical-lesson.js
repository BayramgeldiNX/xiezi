// Pure helpers for the radical lesson (no DOM): step list, addresses, next radical.
// Where a radical usually sits, in plain words (lower case; posText() capitalises it for a heading). One map for all Radicals screens.
export const POS = { left: "on the left", right: "on the right", top: "on top", bottom: "at the bottom", enclose: "around the outside", enclosing: "around the outside", outside: "around the outside", inside: "inside", any: "in many places", varies: "in many places", middle: "in the middle" };
export const posText = (pos, fallback = "in many places") => POS[pos] || fallback;
export const posHeading = (pos) => { const t = posText(pos); return t[0].toUpperCase() + t.slice(1); };
export const learnHash = (r, n = 1) => `#/radical/${encodeURIComponent(r)}/learn/${n}`;
export const picId = (r) => r.codePointAt(0).toString(16);
// Step ids in order for a radical: "twins" (look-alikes) only when it has twins, "sound" only when there is something to show.
export function lessonSteps(x) {
  const L = x?.lesson || {};
  const sound = x?.kind === "shape" ? !!(L.shape || (x.examples || []).length) : (L.sound || []).length > 0;
  return ["story", "shape", "part", (x?.twins || []).length ? "twins" : null, "family", sound ? "sound" : null, "check"].filter(Boolean);
}
export const stepIndex = (step, total) => Math.min(Math.max(parseInt(step, 10) || 1, 1), total);
export const nextRadical = (all, r) => { const i = all.findIndex((x) => x.r === r); return i >= 0 ? all[i + 1] || null : null; };
export const firstUndone = (all, done) => all.find((x) => !done(x.r)) || null;

