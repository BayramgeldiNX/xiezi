// Tests: the run, a test being sat. Pure state: no DOM, no localStorage, time is passed in. Terms: see GLOSSARY.md.
//
// A run is plain JSON, so it can be saved and restored on the same paper whatever changed since:
//   { v: 2, book, test, seed, paper, answers, marks, heard, started, part, pos, stage, left, spent, startedAt, timeUp }
//   stage    "cover" → "card" (a part's title page) → "q" (a question) → … → "confirm" (hand in) → "done"
//   part     index of the part being sat, pos the question inside it
//   answers  { [n]: option index | [words] | true / false }   marks { [n]: true }
//   heard    { [n]: rounds } how many times a listening question's audio has started (at most 2, never replayed)
//   started  { [n]: true } a handwriting question the learner has begun; leaving it unfinished makes it wrong
//   left     milliseconds left; spent: milliseconds used. Only a question page runs the clock (tick).
// Every function returns a new run (the old one is never changed). A move that is not allowed returns the same run.
// Rules: listening is one-way (no going back, a question left behind cannot be answered again); the other parts
// move freely inside the part; a finished part is never reopened; a handwriting question is written once (an answer
// is final); after "done" nothing changes.

export const STAGES = ["cover", "card", "q", "confirm", "done"];
export const VERSION = 2;
export const ROUNDS = 2;

export const newRun = ({ book, test, seed, paper, minutes, now = 0 }) => ({
  v: VERSION, book, test, seed, paper, answers: {}, marks: {}, heard: {}, started: {},
  part: 0, pos: 0, stage: "cover", left: Math.round(minutes * 60000), spent: 0, startedAt: now, timeUp: false,
});

const partOf = (run) => run.paper.parts[run.part];
const listening = (run) => partOf(run)?.id === "listen";
export const current = (run) => (run.stage === "q" ? partOf(run).questions[run.pos] || null : null);

// A handwriting question begun but not finished is wrong: leaving it (any move, hand-in, time up, a restore) settles it.
function settleOf(answers, started, qs) {
  let out = answers;
  for (const q of qs) if (q.shape === "write" && started[q.n] && !(q.n in out)) out = { ...out, [q.n]: false };
  return out;
}
export function settle(run) {
  if (!run) return run;
  const answers = settleOf(run.answers, run.started, run.paper.parts.flatMap((p) => p.questions));
  return answers === run.answers ? run : { ...run, answers };
}
const leaving = (run, change) => settle({ ...run, ...change });

// The question n may be changed now: on a question page, in the current part, and (listening) only the one on screen.
function find(run, n) {
  if (run.stage !== "q") return null;
  const qs = partOf(run).questions;
  const i = qs.findIndex((q) => q.n === n);
  return i >= 0 && (!listening(run) || i === run.pos) ? qs[i] : null;
}

export const begin = (run) => (run.stage === "cover" ? { ...run, stage: "card", part: 0, pos: 0 } : run);
export const startPart = (run) => (run.stage === "card" ? { ...run, stage: "q", pos: 0 } : run);

export function answer(run, n, value) {
  const q = find(run, n);
  if (!q || (q.shape === "write" && n in run.answers)) return run; // a written word is final
  if (value === undefined || value === null) return clearAnswer(run, n);
  return { ...run, answers: { ...run.answers, [n]: value } };
}
export function clearAnswer(run, n) {
  const q = find(run, n);
  if (!q || q.shape === "write" || !(n in run.answers)) return run;
  const answers = { ...run.answers };
  delete answers[n];
  return { ...run, answers };
}
export function toggleMark(run, n) {
  if (!find(run, n)) return run;
  const marks = { ...run.marks };
  if (marks[n]) delete marks[n]; else marks[n] = true;
  return { ...run, marks };
}

// The learner has begun writing this word.
export function startWrite(run, n) {
  const q = find(run, n);
  if (!q || q.shape !== "write" || n in run.answers || run.started[n]) return run;
  return { ...run, started: { ...run.started, [n]: true } };
}

// Listening audio: a round is counted when it starts (so a reload cannot replay it); one cut off by hiding the app is given back.
export const heardOf = (run, n) => run.heard[n] || 0;
export function heardRound(run, n) {
  if (!find(run, n) || heardOf(run, n) >= ROUNDS) return run;
  return { ...run, heard: { ...run.heard, [n]: heardOf(run, n) + 1 } };
}
export function heardUndo(run, n) {
  if (!find(run, n) || !heardOf(run, n)) return run;
  return { ...run, heard: { ...run.heard, [n]: heardOf(run, n) - 1 } };
}

export const next = (run) => (run.stage === "q" && run.pos < partOf(run).questions.length - 1 ? leaving(run, { pos: run.pos + 1 }) : run);
export const prev = (run) => (run.stage === "q" && !listening(run) && run.pos > 0 ? leaving(run, { pos: run.pos - 1 }) : run);
export function goto(run, pos) {
  if (run.stage !== "q" || !Number.isInteger(pos) || pos < 0 || pos >= partOf(run).questions.length) return run;
  if (listening(run) && pos < run.pos) return run;
  return pos === run.pos ? run : leaving(run, { pos });
}

export function finishPart(run) {
  if (run.stage !== "q") return run;
  return run.part < run.paper.parts.length - 1 ? leaving(run, { stage: "card", part: run.part + 1, pos: 0 }) : leaving(run, { stage: "confirm" });
}
export const backToPart = (run) => (run.stage === "confirm" ? { ...run, stage: "q" } : run);
export const handIn = (run) => (["card", "q", "confirm"].includes(run.stage) ? leaving(run, { stage: "done", timeUp: false }) : run);

export function tick(run, ms) {
  if (run.stage !== "q" || !(ms > 0)) return run;
  const used = Math.min(ms, run.left), left = run.left - used, spent = run.spent + used;
  return left > 0 ? { ...run, left, spent } : leaving(run, { left: 0, spent, stage: "done", timeUp: true });
}

/* ---------- Counting ---------- */
export function isAnswered(q, a) {
  if (q.shape === "order") return Array.isArray(a) && a.length === q.answer.length;
  if (q.shape === "write") return typeof a === "boolean";
  return Number.isInteger(a);
}
export function partStats(run, i) {
  const qs = run.paper.parts[i].questions;
  return {
    total: qs.length,
    answered: qs.filter((q) => isAnswered(q, run.answers[q.n])).length,
    marked: qs.filter((q) => run.marks[q.n]).length,
  };
}
export const unanswered = (run) => run.paper.parts.map((_, i) => { const s = partStats(run, i); return s.total - s.answered; });

/* ---------- Saving ---------- */
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const strs = (a) => Array.isArray(a) && a.every((s) => typeof s === "string");

// A question the screen can draw.
function drawable(q) {
  if (!isObj(q) || !Number.isInteger(q.n)) return false;
  if (q.shape === "choice") return strs(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;
  if (q.shape === "order") return strs(q.tiles) && strs(q.answer) && q.tiles.length === q.answer.length && q.answer.length > 0;
  if (q.shape === "write") return typeof q.word === "string" && q.word.length > 0;
  return false;
}

// A saved run (JSON text or object) → a valid run, or null when it is not one this version understands.
export function restore(json) {
  let r = json;
  if (typeof json === "string") { try { r = JSON.parse(json); } catch { return null; } }
  if (!isObj(r) || r.v !== VERSION || !STAGES.includes(r.stage)) return null;
  if (typeof r.book !== "string" || typeof r.test !== "string" || !isNum(r.seed)) return null;
  const parts = r.paper?.parts;
  if (!Array.isArray(parts) || !parts.length || !parts.every((p) => isObj(p) && typeof p.id === "string" && Array.isArray(p.questions) && p.questions.length > 0 && p.questions.every(drawable))) return null;
  if (!isObj(r.answers) || !isObj(r.marks) || !isObj(r.heard) || !isObj(r.started)) return null;
  if (![r.left, r.spent, r.startedAt].every(isNum) || r.left < 0 || r.spent < 0) return null;
  if (!Number.isInteger(r.part) || r.part < 0 || r.part >= parts.length) return null;
  if (!Number.isInteger(r.pos) || r.pos < 0 || r.pos >= parts[r.part].questions.length) return null;
  return settle({
    v: VERSION, book: r.book, test: r.test, seed: r.seed, paper: r.paper, answers: r.answers, marks: r.marks,
    heard: r.heard, started: r.started,
    part: r.part, pos: r.pos, stage: r.stage, left: r.left, spent: r.spent, startedAt: r.startedAt, timeUp: !!r.timeUp,
  });
}
