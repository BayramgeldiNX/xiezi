// The reader's network queue and its pure ordering rules (no DOM, no network).
// Every download of a page or a preview chunk goes through one queue: about 3 at a time, the most wanted first.
// The order is a number: lower runs first. Re-run `reprioritise()` when the page changes.

export const URGENT = 2000;   // below this (the page on screen, its previews) a job may take the last free slot
export const BG = 4000;   // from here on a download is background: it never waits ahead of the user's

// How much a page is wanted when the reader is on page `cur`:
//   0 the page itself, 2000 the next and previous page, 3000+ the next four and the one before those,
//   BG+ everything else, nearest first (forward a little ahead of backward).
export function pagePrio(n, cur) {
  if (!Number.isInteger(cur)) return BG + 2000 + n;
  const d = n - cur;
  if (d === 0) return 0;
  if (d === 1 || d === -1) return 2000 + (d < 0 ? 1 : 0);
  if ((d >= 2 && d <= 5) || d === -2) return 3000 + Math.abs(d) * 2 + (d < 0 ? 1 : 0);
  return BG + 1000 + Math.abs(d) * 2 + (d < 0 ? 1 : 0);
}

// The preview chunk: the one holding the current page first (1000), then a chunk that holds a page the reader
// is about to need (3000), then the rest of the book, nearest first (BG + distance).
export function thumbPrio(k, cur, per = 40) {
  if (!Number.isInteger(cur)) return BG + k;
  const ck = chunkOf(cur, per).k;
  if (k === ck) return 1000;
  if (k === chunkOf(Math.max(1, cur - 2), per).k || k === chunkOf(cur + 5, per).k) return 3000;
  return BG + Math.abs(k - ck);
}

// Where a page's preview lives: the chunk (doc "<id>-<k>") and the index inside its `imgs`.
export const chunkOf = (n, per = 40) => ({ k: Math.floor((n - 1) / per), i: (n - 1) % per });
export const chunkCount = (total, per = 40) => Math.ceil(total / per);
export const chunkPages = (k, total, per = 40) => {
  const out = [];
  for (let n = k * per + 1; n <= Math.min(total, (k + 1) * per); n++) out.push(n);
  return out;
};

// Page numbers outward from `cur`: cur, cur+1, cur-1, cur+2, cur-2 ... within 1..total. Only those in `want` when given.
export function outward(cur, total, want = null) {
  const out = [];
  const take = (n) => { if (n >= 1 && n <= total && (!want || want.has(n))) out.push(n); };
  take(cur);
  for (let d = 1; d < total; d++) { take(cur + d); take(cur - d); }
  return out;
}

// A queue of jobs. add(key, meta, run) returns a promise for run()'s result; the same key never runs twice at once
// (a second add returns the first promise and, if more urgent, raises its priority). `prioOf(meta)` gives the order.
// At most `limit` run together (the last slot only for jobs below URGENT), and at most `bgLimit` of those are
// background; a background job never starts while a user job waits.
export function createQueue({ limit = 3, bgLimit = 2, prioOf }) {
  const jobs = new Map();   // key -> { key, meta, prio, seq, run, state: "wait" | "run", promise }
  let seq = 0, running = 0, bgRunning = 0;

  function next() {
    while (running < limit) {
      let best = null, userWaits = false;
      for (const j of jobs.values()) {
        if (j.state !== "wait") continue;
        if (j.prio < BG) userWaits = true;
        if (!best || j.prio < best.prio || (j.prio === best.prio && j.seq < best.seq)) best = j;
      }
      if (!best) return;
      if (best.prio >= URGENT && running >= limit - 1) return;   // the last slot stays free for the page on screen
      if (best.prio >= BG && (userWaits || bgRunning >= bgLimit)) return;
      start(best);
    }
  }
  function start(j) {
    j.state = "run"; running++;
    const bg = j.prio >= BG;
    if (bg) bgRunning++;
    j.bg = bg;
    let p;
    try { p = Promise.resolve(j.run()); } catch (e) { p = Promise.reject(e); }
    const fin = () => { running--; if (j.bg) bgRunning--; jobs.delete(j.key); next(); };
    p.then((v) => { fin(); j.resolve(v); }, (e) => { fin(); j.reject(e); });
  }

  return {
    add(key, meta, run) {
      const have = jobs.get(key);
      if (have) {
        if (have.state === "wait") { const p = prioOf(meta); if (p < have.prio) { have.prio = p; have.meta = meta; } }
        return have.promise;
      }
      const j = { key, meta, prio: prioOf(meta), seq: ++seq, run, state: "wait" };
      j.promise = new Promise((resolve, reject) => { j.resolve = resolve; j.reject = reject; });
      jobs.set(key, j);
      next();
      return j.promise;
    },
    // The reader moved: every waiting job gets its order again.
    reprioritise() {
      for (const j of jobs.values()) if (j.state === "wait") j.prio = prioOf(j.meta);
      next();
    },
    has: (key) => jobs.has(key),
    // Keys in the order they would start (waiting only). For tests and debugging.
    waiting: () => [...jobs.values()].filter((j) => j.state === "wait").sort((a, b) => a.prio - b.prio || a.seq - b.seq).map((j) => j.key),
    stats: () => ({ running, bgRunning, waiting: [...jobs.values()].filter((j) => j.state === "wait").length }),
    kick: next,
  };
}
