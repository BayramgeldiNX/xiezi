# 写字本 improvement plan (for the builder)

You build this plan step by step. Opus reviews your work and publishes it, so **never push**.
All paths are relative to the repository root. Line numbers are from commit `a60b1f1`, so search if they have moved.

## Rules
- Read `CLAUDE.md` first. Its rules apply, especially copyright and "no streaks, goals or reminders".
- **Don't change lesson data** (`src/data/books/**`), and don't rename progress keys (`w:`, `d:`, `f:`, `l:`, `q:`, `s:`, `o:`, `g:`, `wb:`, `rp:`, `tc:`, `tp:`, `t:`). Saved progress depends on them.
- Don't run `gen:audio`, `gen:font`, `upload:private` or anything that talks to the real Firebase project.
- Match the surrounding style: plain JS modules, template strings, short comments that explain why.
- No new dependencies.
- Do the steps in order, with one commit per step. Commit message: a short plain sentence, then a blank line, then
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before every commit, `npm test` must pass. After steps 4, 6, 8 and 10, also run `npm run build`.
- If a step's design turns out to be wrong, or you are unsure, **don't invent a new design**. Skip it, say why in your report, and go on.
- Save tokens: read only the files a step names.

## Report when you finish
For each step: commit hash, done / skipped, anything you did differently and why. Then the final output of `npm test`, `npm run check` and the size lines from `npm run build`. Be honest about what you couldn't check. You won't test in a browser; Opus does that.

---

## Step 1. Review dates: stop them growing too fast, and share them across devices
**Problem.** `addResult` adds 1 to `streak` on every right answer, even on the same day, so 7 right answers in a day schedule a word 4 months away. `store.record` also builds from this device's stat only, so changing device resets the streak and the word comes back tomorrow.

**Rule.** A right answer grows the streak only if the word was due, is new, or was last wrong. Otherwise the streak stays. A wrong answer sets it to 0. The streak always starts from the combined stat of all devices. Counts (`n`, `ok`, `miss`) stay per device.

`src/progress/model.js`:
```js
// A right answer only moves a word further out when it was actually due; extra practice in between keeps its place.
const grows = (s, now) => !s?.n || !s.lastOk || !s.streak || isDue(s, now);

// shared: this item's combined stat across devices (the schedule belongs to the word, not to the device).
export function addResult(stat, { ok, miss = 0 }, now = Date.now(), shared = stat) {
  const s = stat ? { ...stat } : emptyStat();
  s.n += 1;
  s.ok += ok ? 1 : 0;
  s.miss += Math.max(0, miss | 0);
  s.last = now;
  s.lastOk = !!ok;
  s.streak = !ok ? 0 : grows(shared, now) ? (shared?.streak || 0) + 1 : shared.streak;
  return s;
}
```
`src/progress/store.js`, in `record`: `P.mine[key] = addResult(P.mine[key], result, Date.now(), get(key));`

**Tests** (add to `tests/schedule.test.js`; use a fixed `T`):
- Five right answers at the same `now` leave streak 1, so the next review is 1 day away.
- Right when due (`T + 1 day`) gives streak 2 and a 3 day gap.
- Right before due keeps the streak and sets `last` to now.
- Wrong gives streak 0; the next right gives streak 1.
- With `shared = { n: 5, last: T, lastOk: true, streak: 5 }`, a right answer at `T + 30 days` from a device with no stat gives streak 6.

In `tests/store.test.js`, add: after `applyRemoteItem` with another device on streak 3 and `last` long ago, `record(ok)` gives this device streak 4.

If an older test expected growth at the same timestamp, change only that test, and mention it in your report.

## Step 2. Sync: upload only what changed
**Problem.** `start()` in `src/sync/sync.js:99` rewrites every item and session on each start. That wastes Firebase's daily write limit, and every other device receives all of it.

**Design.** The store remembers what hasn't reached the cloud, and which account already has everything.

`src/progress/store.js`:
- In `load()`, add `unsent: p.unsent || { items: {}, sessions: {} }` (`items: { key: n at change }`, `sessions: { id: 1 }`) and `sentFor: p.sentFor || null` (the uid whose cloud copy is complete).
- `record`: after updating, `P.unsent.items[key] = P.mine[key].n`.
- `addSession`: `P.unsent.sessions[session.id] = 1`.
- New exports:
```js
// What still has to reach this account's cloud copy: everything the first time, then only what changed.
export function pendingUpload(uid) {
  const own = P.sessions.filter((s) => s.dev === P.device);
  if (P.sentFor !== uid) return { items: Object.entries(P.mine), sessions: own };
  return {
    items: Object.keys(P.unsent.items).filter((k) => P.mine[k]).map((k) => [k, P.mine[k]]),
    sessions: own.filter((s) => P.unsent.sessions[s.id]),
  };
}
// Called once the server has confirmed. A newer result recorded meanwhile stays unsent (its n has changed).
export function markItemSent(key, n) { if (P.unsent.items[key] === n) { delete P.unsent.items[key]; persist(); } }
export function markSessionSent(id) { if (P.unsent.sessions[id]) { delete P.unsent.sessions[id]; persist(); } }
export function markUploaded(uid, items, sessions) {
  items.forEach(([k, s]) => { if (P.unsent.items[k] === s.n) delete P.unsent.items[k]; });
  sessions.forEach((s) => delete P.unsent.sessions[s.id]);
  P.sentFor = uid;
  persist();
}
```
- `importBackup`: when `put` changes `P.mine[key]`, set `P.unsent.items[key]`. Replace the final "push all mine" loop with one that pushes only those changed keys. A session in the backup with `dev === P.device` that was new goes in `P.unsent.sessions`.
- `exportBackup`: leave these out: `const { unsent, sentFor, ...rest } = P;`.

`src/sync/sync.js`, in `start()`:
- Live pushes confirm: `pushItem: (key, stat) => safely(() => F.setDoc(...).then(() => progress.markItemSent(key, stat.n)))`, and the same for sessions with `markSessionSent`.
- Replace lines 99-111: take `const { items, sessions } = progress.pendingUpload(uid)`, build `writes` from those, commit batches of 400 and collect the promises, then `Promise.all(commits).then(() => progress.markUploaded(uid, items, sessions)).catch(fail)`. With nothing to send, still call `markUploaded`.

**Tests** (`tests/store.test.js`):
- First `pendingUpload("u1")` returns everything.
- After `markUploaded("u1", ...)` it returns nothing.
- After a new `record` it returns only that key.
- `pendingUpload("u2")` returns everything again.
- A result recorded between push and confirmation stays unsent: `markItemSent(key, oldN)` doesn't clear it.
- `exportBackup()` has no `unsent` or `sentFor`.
- Signed-out `importBackup` leaves its keys in `pendingUpload`.

## Step 3. Small fixes
**Home count.** Words shared between books are counted twice at `src/main.js:141`.
- In `src/views/bookreview.js`: `export const ALL_BOOKS = { id: "all", title: "All books", lessons: LESSONS };` (import `LESSONS`).
- `wordsOf` already removes duplicates, so `dueCount(ALL_BOOKS)` counts each word once. Use it in `renderHub`.
- The per-book counts on the books page stay as they are.

**Mixed direction.** `src/views/practice.js:128` and `:137` always give a word the same direction. In `src/lib/util.js`:
```js
// mode, or for "mixed" a random pick that stays the same for a word during this round.
export function directionPicker(mode, a, b) {
  const picked = new Map();
  return (x) => {
    if (mode !== "mixed") return mode;
    if (!picked.has(x.w)) picked.set(x.w, Math.random() < 0.5 ? a : b);
    return picked.get(x.w);
  };
}
```
Then `const pick = directionPicker(mode, "word", "meaning");` in `listenQuiz` and `vocabQuiz`. Add a small test.

**Dictation hint text.** `src/views/dictation.js:33` hardcodes "After 3 mistakes". Writers use `setting("hintAfter") + 1`, and 0 means never. So:
```js
const hintAfter = setting("hintAfter");
const hintNote = hintAfter ? ` After ${hintAfter + 1} mistakes on one stroke, it shows you a hint.` : "";
```

## Step 4. Delete
- `src/main.js:162`: the `book-soon` note. `src/main.js:208-212`: the "coming soon" row.
- CSS for `.book-soon` and `.lesson-row.soon` in `src/styles.css`, if nothing else uses them (grep first).
- `src/views/bookreview.js`: every `soon` check (lines 42, 100, 103, 124). No type has `soon`.
- `src/lib/speech.js:45`: `hasVoice`.
- Old fallbacks: `"#tab-dict"` in `src/views/dictation.js:21,27` (use `let hostSel = null`, `hostSel = opts.host`, and make `dictActive` check `dict` before `$(hostSel)`); `"#tab-cards"` in `src/views/cards.js:16`; `host: "#tab-tones"` and the defaults beside it in `src/views/tones.js:38` (grep that every caller passes `host`).
- Fix the first-line comments of `cards.js` and `dictation.js`, which mention tabs that no longer exist.
- `scripts/add-lesson.mjs`: check with `grep -n "chars.json" scripts/import-book.mjs`.
  - If `import-book` adds new characters to `chars.json`: delete the script and its line in `package.json`, and change README steps 1-2 (around line 42) to point at `import-book` as `CLAUDE.md` describes.
  - If not: **keep it**, and say so in your report.

## Step 5. Merge duplicate menu items
In `SKILLS` (`src/views/practice.js`):
- Replace `pick-word` and `pick-meaning` with `{ id: "hear", seal: "听", name: "Hear the word", sub: "Listen, then pick the word or its meaning" }`.
- Replace `quiz-meaning` and `quiz-word` with `{ id: "word-quiz", seal: "选", name: "Word quiz", sub: "See a word or its meaning, pick the match" }`.

In `startMode`, one case each, using `mode: "mixed"`:
```js
case "hear": return words.length < 2 ? notEnough() : listenQuiz({ items: ten(words), pool: words, title: "Hear the word" });
case "word-quiz": return words.length < 2 ? notEnough() : vocabQuiz({ items: ten(words), pool: words, title: "Word quiz" });
```
Update the mode lists in `scripts/e2e/screens.mjs:103,106` and `scripts/tools/debug.mjs:74,77`.

## Step 6. Review button on Home
- `index.html`: add a section like `typingView` (lines 76-82): `id="reviewView"`, eyebrow `复 · 复习`, title `Review`, body `<div id="allReview" class="inner"></div>`, back button `data-back-to="#/"`. Add a hub card as the **first** item in `.hub`: `id="openReview"`, seal `复`, `Review` + `复习`, and `<span class="hub-sub" id="reviewMeta"></span>`.
- `src/main.js`:
  - Add `"reviewView"` to `PAGES`, and to `upFrom` as `"#/"`.
  - `route()`: `if (page === "review") { showPage("reviewView"); document.title = "Review · 写字本"; return openReview(ALL_BOOKS, "#allReview"); }`
  - Click: `$("#openReview").addEventListener("click", () => go("#/review"));`
  - `renderHub`: `reviewMeta` shows `${due} to review`, or `Nothing to review right now` at zero. Remove the "to review" part from `hubMeta`, because it has moved here.
- `src/views/bookreview.js`: the practice-test text says "from the whole book". Use "from all your books" when `book.id === "all"`.
- Book-level Review stays as it is.

## Step 7. Search all words
New `src/lib/search.js`, pure so it can be tested:
```js
import { stripTone } from "./pinyin.js";
// Does a word match what was typed? 汉字, pinyin with or without tones and spaces, or English.
export function matchesWord(w, q) {
  const raw = q.trim();
  if (!raw) return true;
  const t = stripTone(raw.toLowerCase());
  return w.w.includes(raw) || stripTone(w.py.toLowerCase()).replace(/\s/g, "").includes(t.replace(/\s/g, "")) || w.en.toLowerCase().includes(t);
}
```
- Use it in `wordList` in `src/views/practice.js:490-491`, so there is one matcher.
- New `src/views/search.js`, `export function openSearch()`, drawing into `#searchBody`. Reuse the classes from `wordList` (`.search`, `.word-table`, `.py`, `.en`).
  - Items: `wordsOf(LESSONS)`.
  - Empty query: a short note like "Search all 567 words", using the real count.
  - Show at most 50 results, and say so when there are more.
  - Each row: word, pinyin, English, `sayBtns`, the lesson name (`bookOf(L).title · L.cn`), and a "Practice" button that does what `csPractice` does in `src/views/charsheet.js:93-98`.
  - Use `esc()` on text.
- `index.html` and `src/main.js`: add `searchView`, route `#/search`, a hub card `id="openSearch"` (seal `查`, `Search` + `查词`, sub `Find any word in your books`) after Typing, the `PAGES` and `upFrom` entries.

**Tests** `tests/search.test.js`: 你好 by `你`, `ni hao`, `nǐ hǎo`, `nihao`, `hello`; no match; empty query.

## Step 8. Retry missed on every results screen
The label is always `Retry missed`, shown only when something was missed.
- `src/views/practice.js`:
  - `showResults(..., perfect, retry)`: add a `<button class="btn big" id="resRetry">` when `retry` is given.
  - `choiceQuiz`: keep `missedItems` beside `missed`, and pass `() => choiceQuiz({ ...cfg, items: missedItems, onDone: undefined })`. Include `missedItems` in the `then` result.
  - `speak`: the same with its items. `then` result gets `missedItems`.
  - `matchGame`: when the set has at least 2 words not right the first time, add the button with `matchGame(thoseWords)`.
- `src/views/reading.js`, `orderGame`: keep the missed sentence objects; `orderGame(ui, missedObjects, { all: true })`. Include `missedItems` in `then`.
- `src/views/tones.js`, `toneEnd`: `tq = { qs: missed, pos: 0, right: 0, missed: [], src }; toneAsk();`.
- `src/views/typing.js`, `end`: `missedItems` beside `missed`, then `run(missedItems)`.
- `src/views/cards.js`, done screen: `cardsStart(deck.dir, { ...deck.opts, words: words.filter((w) => deck.again.has(w.w)) })`.
- `src/views/dictation.js`: rename "Only the missed ones" to `Retry missed`. In the `then` result, add `missedItems: words.filter((w) => missed.includes(w.w))`.
- `src/views/bookreview.js`, Review summary: in `runStep`, keep `t` and wrap the raw missed items back into chain items: `{ w }` for vocab, listen and write; `{ w: it.w }` for speak; `{ s }` for read; `{ d }` for everything else. In `summary`, if any were missed, show `Retry missed`, which runs `runChain` with only those. The text "These come back tomorrow" stays true.

## Step 9. Continue on any device
`firestore.rules` already allows `users/{uid}/**`, so **no rules change**. Doc: `users/{uid}/meta/place`.

`src/progress/store.js`:
```js
/* ---------- last place (newest wins across devices) ---------- */
let placeTimer = 0, placeWaiting = null;
const flushPlace = () => { clearTimeout(placeTimer); if (placeWaiting) syncer?.pushPlace?.(placeWaiting); placeWaiting = null; };
export const place = {
  get: () => store.get("hz-state", null),
  set: (v) => {
    placeWaiting = { ...v, at: Date.now() };
    store.set("hz-state", placeWaiting);
    clearTimeout(placeTimer);
    placeTimer = setTimeout(flushPlace, 2000); // moving between words shouldn't write each time
  },
};
// True when the cloud's place was newer and is now ours.
export function applyRemotePlace(p) {
  if (!p?.lid || (p.at || 0) <= (place.get()?.at || 0)) return false;
  store.set("hz-state", p);
  return true;
}
```
Call `flushPlace()` in the existing `pagehide` listener.

`src/sync/sync.js`, in `start()`:
- Add to the syncer: `pushPlace: (p) => safely(() => F.setDoc(placeRef, p))`.
- Add a listener, and add it to `stopFns`:
```js
const placeRef = F.doc(db, "users", uid, "meta", "place");
const placeSub = F.onSnapshot(placeRef, (snap) => {
  const remote = snap.data();
  if (progress.applyRemotePlace(remote)) progress.remoteDone();
  else if ((progress.place.get()?.at || 0) > (remote?.at || 0)) safely(() => F.setDoc(placeRef, progress.place.get()));
}, fail);
```

`src/main.js`: move lines 129-136 into `renderResume()`. Call it from `showHome` and from the `onProgress` home branch, so the Continue card updates live. A place from another device must never move someone who is already practicing, which holds because only Home reads it live.

**Tests** (`tests/store.test.js`, with `vi.useFakeTimers()`): older remote is ignored, newer remote is applied; `place.set` pushes once after 2 s for several quick calls.

## Step 10. Faster start: load stroke shapes only when needed
`src/data/strokes.gen.json` (1.2 MB) is in the main file, but Home only needs to know **which** characters have strokes.

1. `scripts/gen-data.mjs`: after writing `strokes.gen.json`, also write `stroke-chars.gen.json` with `Object.keys(out)`, in the same way. Run `npm run gen:data` and check `git status`: only the new file should change. If others change, restore them with `git checkout -- <file>` and report it.
2. New `src/data/strokes.js`:
```js
// Stroke shapes are the biggest data file, so they load when first needed instead of with the app.
export const STROKE_DATA = {};
let loading = null;
export const loadStrokes = () => (loading ||= import("./strokes.gen.json")
  .then((m) => { Object.assign(STROKE_DATA, m.default); })
  .catch((e) => { loading = null; throw e; }));
```
3. `src/data/index.js`:
   - Remove the JSON import and re-export `STROKE_DATA, loadStrokes` from `./strokes.js`.
   - Import `STROKE_CHARS` from the new JSON: `const HAS_STROKES = new Set(strokeChars);`
   - `wordChars = (w) => [...new Set(w.w)].filter((c) => HAS_STROKES.has(c));`
4. `src/lib/draw.js`: make the loader wait:
```js
const loader = (c, onLoad, onError) => { loadStrokes().then(() => (STROKE_DATA[c] ? onLoad(STROKE_DATA[c]) : onError?.(new Error("no data for " + c))), onError); };
```
5. `src/main.js`: make `route` async, with a guard against an old route finishing late:
```js
let routeToken = 0;
async function route() {
  const token = ++routeToken;
  const [, page, a, b, c] = location.hash.split("/");
  if (page === "lesson" || page === "print") {
    try { await loadStrokes(); } catch (e) { console.error(e); return showHome(); }
    if (token !== routeToken) return;
  }
  // ...the rest as before
}
```
   At the end of boot, load in the background so the first lesson opens instantly: `setTimeout(() => loadStrokes().catch(() => {}), 1500);`.
6. `src/views/charsheet.js`, the `[data-char]` click handler: `loadStrokes().catch(() => {}).then(() => openChar(el.dataset.char));`. `openChar` already handles missing data with its font fallback.
7. **Test** `tests/strokes.test.js`: `stroke-chars.gen.json` equals `Object.keys(strokes.gen.json)`.
8. **Check** `npm run build`: stroke data must be its own chunk, and the main `index-*.js` should drop from about 1,994 KB to about 800 KB. Report the real numbers. The PWA precache must still include the chunk (`globPatterns` already covers `.js`).

## Step 11. Notes
Update `CLAUDE.md`: under Stack and layout, add `search.js`, `lib/search.js`, `data/strokes.js`, the `#/review` and `#/search` pages, and the `users/{uid}/meta/place` doc. Update the script notes if `add-lesson` was removed. Keep it short.
