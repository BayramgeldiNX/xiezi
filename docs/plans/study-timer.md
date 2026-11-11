# Plan: study timer next to the lesson ring

For: Sonnet, implementing. Read only the files listed here. Token budget is tight.

## Goal
The owner wants to see how long they have been studying. In the lesson header there is a
progress ring (`#lessonMeter`, "3%"). Put a small, quiet **study timer** right next to it (to its left),
in the same `.topbar`.

The app's design rule: minimalist and elegant, **no streaks, goals or reminders**. So this is a plain
stopwatch: no targets, no "you studied X today!" pop-ups, no history page, no sync.

## What the user sees
- In the lesson header, left of the ring: a small pill/button showing elapsed time, e.g. `4:07`,
  then `1:02:15` past an hour. Tabular numbers, `--muted` colour, same size as `.lmeter .pct`
  (`.8125rem`, weight 700). A tiny clock icon (inline SVG, `currentColor`, 14px) before the digits is fine.
- It **starts by itself** when a lesson opens and keeps counting while the user moves between tabs and
  between lessons (one study session, not per lesson).
- **Tap** = pause / resume. Paused: digits dimmed (opacity ~.5) and a pause glyph instead of the clock.
  `aria-label` "Study time 4 minutes 7 seconds, tap to pause" / "… paused, tap to resume", `aria-pressed` = paused.
- **Long press (~600ms) or double-tap** = reset to `0:00` (keep it simple: pick long-press, using
  pointerdown/pointerup timers; make sure a long-press does not also toggle pause).
- It **pauses automatically** when the app is hidden (`document.visibilitychange` → hidden), and resumes
  when visible again *only if the user had not paused it by hand*.
- When the user leaves lessons (goes home, books, search…), the timer stops counting but remembers the
  time; coming back into a lesson continues it.
- **New session**: if the app was away (hidden or out of lessons) for more than 30 minutes, the next lesson
  open starts from `0:00`.
- Settings: add a row `Study timer` with `Show` / `Hide` (key `studyTimer`, default `true`) in
  `src/views/account.js` next to the other settingRows, and in `DEFAULTS` in `src/lib/settings.js`.
  Hidden = element `hidden` and the clock does not run. Follow how other boolean settings apply
  (check `apply()` in settings.js and how `setSetting` triggers re-render; keep it minimal).
- Must fit on iPhone 16 width (393px) next to the long lesson title without sideways overflow:
  the title area should shrink/ellipsis, not the timer. Tap target ≥ 44px tall (like `.lmeter`).
- Works in all four themes (use existing CSS variables only: `--muted`, `--line2`, `--jade`, etc.).

## Code
1. **New module `src/lib/study-timer.js`** (pure logic, no DOM, so it can be tested):
   ```js
   // state: { ms, runningSince, paused, lastSeen }
   export function createTimer(now = () => Date.now(), store = localStorage-ish) { ... }
   // methods: start(), stop() (auto, not user pause), toggle() (user pause), reset(), elapsed(), isPaused(), isRunning()
   ```
   - Elapsed = `ms + (running ? now() - runningSince : 0)`.
   - Persist `{ ms, paused, lastSeen }` to localStorage key `xz-study-timer` (wrap in try/catch) on every
     stop/toggle/reset and every ~15s while running, so a reload/PWA kill keeps the time.
   - `start()` checks `lastSeen`: if more than 30 min ago → `ms = 0, paused = false`.
   - `start()` does nothing if user-paused (stays paused, but updates lastSeen).
   - Also export `formatElapsed(ms)` → `"0:00"`, `"4:07"`, `"1:02:15"`.
2. **New view `src/views/studytimer.js`**: binds the button, renders once per second with `setInterval`
   (only while running and visible; clear it when stopped), handles tap / long-press, visibilitychange.
   Export `timerEnter()` (called when a lesson is shown) and `timerLeave()` (called when a non-lesson page is shown).
3. **`index.html`**: in `#lessonView .topbar`, insert before `#lessonMeter`:
   `<button type="button" class="stimer" id="studyTimer" aria-pressed="false">…</button>`.
   `.lmeter` has `margin-left: auto`; move the auto margin to `.stimer` (or wrap both) so they sit together on the right.
4. **`src/main.js`**: call `timerEnter()` in `openLesson()` (line ~275) and `timerLeave()` where other pages are
   shown (look at `showPage()` — simplest: in `showPage(id)`, `id === "lessonView" ? timerEnter() : timerLeave()`).
5. **CSS** in `src/styles/practice.css` near the `.lmeter` block (~line 156): `.stimer` styles, paused state,
   respect reduced motion (no animations needed anyway).
6. **Test** `tests/study-timer.test.js` (vitest) for `formatElapsed` and the timer logic with a fake clock and
   a fake store: counting, pause/resume, auto stop, 30-minute new session, persistence round-trip.

## Don'ts
- No sync to Firebase, no progress keys, no sounds, no notifications, no daily totals/goals.
- Don't touch lesson data, progress store, or other views.
- Don't commit or push. Don't start long sweeps.

## Done when
- `npm test` passes (including the new test) and `npm run build` succeeds.
- In dev (`npm run dev`, `http://localhost:5173/xiezi/`), opening a lesson shows the timer counting next to
  the ring; tap pauses; long-press resets; Settings → Study timer → Hide removes it.
- Report back: files changed, anything you were unsure about.
