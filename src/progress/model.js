// Pure progress logic (no storage, no DOM) so it can be unit-tested.
//
// Every practice result updates one "item" stat. Item keys:
//   w:<char>  writing a character in Write → "Write it"
//   d:<word>  writing a word in Dictation
//   f:<word>  a flashcard answer
//   t:<char>  a tone-quiz answer
// Each device keeps its own stat per item and only ever writes its own, so devices
// can sync without overwriting each other; the totals are combined when read.

export const emptyStat = () => ({ n: 0, ok: 0, miss: 0, last: 0, lastOk: false, streak: 0 });

export function addResult(stat, { ok, miss = 0 }, now = Date.now()) {
  const s = stat ? { ...stat } : emptyStat();
  s.n += 1;
  s.ok += ok ? 1 : 0;
  s.miss += Math.max(0, miss | 0);
  s.last = now;
  s.lastOk = !!ok;
  s.streak = ok ? (s.streak || 0) + 1 : 0;
  return s;
}

// Combine one item's stats from several devices: counts add up, "latest" fields
// come from whichever device practiced most recently.
export function combine(stats) {
  const list = stats.filter(Boolean);
  if (!list.length) return null;
  const latest = list.reduce((a, b) => (b.last > a.last ? b : a));
  return {
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
  const ws = chars.map((c) => get("w:" + c)).filter((s) => s?.n);
  if (!d?.n && !f?.n && !ws.length) return null;
  let score = 0;
  if (d?.n) score += ((d.n - d.ok) / d.n) * 3 + (d.lastOk ? 0 : 2);
  if (f?.n) score += (f.miss / f.n) * 2 + (f.lastOk ? 0 : 1.5);
  for (const w of ws) score += Math.min(3, w.miss / w.n) + (w.lastOk ? 0 : 1);
  // Old results count a little more: practice fades.
  const last = Math.max(d?.last || 0, f?.last || 0, ...ws.map((s) => s.last));
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
  const bad = chars.filter((c) => { const s = get("w:" + c); return s?.n && !s.lastOk; });
  if (bad.length) out.push(`mistakes writing ${bad.join("")}`);
  return out;
}
