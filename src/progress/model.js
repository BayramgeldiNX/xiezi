// Pure progress logic (no storage, no DOM) so it can be unit-tested.
//
// Every practice result updates one "item" stat, under a progress key: every kind of key is
// listed in keys.js.
// fix counts answers that were wrong first and then put right (a miss for review, but done for the lesson %).
// Each device keeps its own stat per item and only ever writes its own, so devices
// can sync without overwriting each other; the totals are combined when read.

export const emptyStat = () => ({ n: 0, ok: 0, miss: 0, last: 0, lastOk: false, streak: 0 });

// A right answer only moves a word further out when it was actually due; extra practice in between keeps its place.
const grows = (s, now) => !s?.n || !s.lastOk || !s.streak || isDue(s, now);

// shared: this item's combined stat across devices (the schedule belongs to the word, not to the device).
export function addResult(stat, { ok, miss = 0, fix = false }, now = Date.now(), shared = stat) {
  const s = stat ? { ...stat } : emptyStat();
  s.n += 1;
  s.ok += ok ? 1 : 0;
  s.miss += Math.max(0, miss | 0);
  if (fix && !ok) s.fix = (s.fix || 0) + 1;
  s.last = now;
  s.lastOk = !!ok;
  s.streak = !ok ? 0 : grows(shared, now) ? (shared?.streak || 0) + 1 : shared.streak;
  return s;
}

// Combine one item's stats from several devices: counts add up, "latest" fields
// come from whichever device practiced most recently.
export function combine(stats) {
  const list = stats.filter(Boolean);
  if (!list.length) return null;
  const latest = list.reduce((a, b) => (b.last > a.last ? b : a));
  const fix = list.reduce((t, s) => t + (s.fix || 0), 0);
  return {
    ...(fix ? { fix } : {}),
    n: list.reduce((t, s) => t + (s.n || 0), 0),
    ok: list.reduce((t, s) => t + (s.ok || 0), 0),
    miss: list.reduce((t, s) => t + (s.miss || 0), 0),
    last: latest.last,
    lastOk: latest.lastOk,
    streak: latest.streak,
  };
}

// A character is mastered once written with no mistakes at least twice, the last time included.
export const charMastered = (w) => !!w && w.ok >= 2 && w.lastOk;

export function charStatus(w) {
  if (!w || !w.n) return "new";
  return charMastered(w) ? "mastered" : "learning";
}

// A word is known when all its characters are mastered and its last dictation was perfect.
export function wordStatus(chars, get) {
  const d = get("d:" + chars.word);
  const cs = chars.list.map((c) => charStatus(get("w:" + c)));
  const f = get("f:" + chars.word);
  if (cs.every((s) => s === "mastered") && d?.lastOk) return "known";
  if (cs.every((s) => s === "new") && !d?.n && !f?.n) return "new";
  return "learning";
}

// How much a word needs review: 0 = fine, higher = weaker. null = never practiced.
export function weakness(word, chars, get) {
  const d = get("d:" + word), f = get("f:" + word);
  const extra = ["l:", "q:", "s:"].map((k) => get(k + word)).filter((s) => s?.n);
  const ws = chars.map((c) => get("w:" + c)).filter((s) => s?.n);
  if (!d?.n && !f?.n && !ws.length && !extra.length) return null;
  let score = 0;
  if (d?.n) score += ((d.n - d.ok) / d.n) * 3 + (d.lastOk ? 0 : 2);
  if (f?.n) score += (f.miss / f.n) * 2 + (f.lastOk ? 0 : 1.5);
  for (const w of ws) score += Math.min(3, w.miss / w.n) + (w.lastOk ? 0 : 1);
  for (const s of extra) score += ((s.n - s.ok) / s.n) + (s.lastOk ? 0 : 1);
  // Old results count a little more: practice fades.
  const last = Math.max(d?.last || 0, f?.last || 0, ...ws.map((s) => s.last), ...extra.map((s) => s.last));
  const days = (Date.now() - last) / 864e5;
  if (days > 3) score += Math.min(2, days / 7);
  return Math.round(score * 100) / 100;
}

// Why a word shows up in Review, in plain words.
export function weakReasons(word, chars, get) {
  const out = [];
  const d = get("d:" + word), f = get("f:" + word);
  if (d?.n && !d.lastOk) out.push("missed in dictation");
  if (f?.n && !f.lastOk) out.push("flashcard “again”");
  if (get("l:" + word)?.n && !get("l:" + word).lastOk) out.push("missed in listening");
  if (get("q:" + word)?.n && !get("q:" + word).lastOk) out.push("missed in a quiz");
  if (get("s:" + word)?.n && !get("s:" + word).lastOk) out.push("not yet in speaking");
  const bad = chars.filter((c) => { const s = get("w:" + c); return s?.n && !s.lastOk; });
  if (bad.length) out.push(`mistakes writing ${bad.join("")}`);
  return out;
}

/* ---------- Review schedule (spaced repetition) ----------
   Each word has its own schedule per review type. Right → it comes back later each time
   (1 day, 3 days, 1 week, 2 weeks, 1 month, 2 months, 4 months); wrong → back the next day. */
export const INTERVALS = [1, 3, 7, 14, 30, 60, 120];
const DAY = 864e5;

// The most recent of several stats (e.g. flashcards and quizzes both count for vocabulary).
export const latest = (stats) => stats.filter((s) => s?.n).reduce((a, b) => (!a || b.last > a.last ? b : a), null);

export function nextReview(stat) {
  if (!stat?.n) return null;
  const days = stat.lastOk ? INTERVALS[Math.min(Math.max(stat.streak || 1, 1), INTERVALS.length) - 1] : 1;
  return stat.last + days * DAY;
}

// Due = practiced before and its next review time has come. Never practiced = not due (learn it first).
export const isDue = (stat, now = Date.now()) => {
  const t = nextReview(stat);
  return t != null && t <= now;
};