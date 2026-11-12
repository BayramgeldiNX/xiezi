# Plan: countdown (break timer) for the study timer

For: Sonnet, implementing. Read only the files listed here. Token budget is tight.
Builds on `docs/plans/study-timer.md` (already shipped).

## Goal
The owner wants to study in blocks: tap the timer, set a time (usually **45 minutes**), watch it count
**down**, and be told clearly when it is time to rest. Today the timer in the lesson header
(`#studyTimer`, left of the progress ring) is a stopwatch only: tap pauses, hold resets.

This is an alarm the owner sets by hand, so it is fine with the "no reminders" design rule. Still keep it
quiet and elegant: no streaks, no counts of blocks, no history.

## What the user sees
### The pill (lesson header)
- Stopwatch mode: unchanged look (`clock icon 4:07`).
- Countdown mode, running: an hourglass icon (inline SVG, `currentColor`, 14px) and the time **left**, e.g. `44:59`
  (`1:30:00` style past an hour; reuse `formatElapsed`). Colour `--muted`, like now.
- Countdown paused: pause glyph, digits at opacity .5 (same as stopwatch paused).
- Countdown finished: text `Rest` in `--amber`, with a one-time soft glow (reuse the `lm-glow` idea from
  `.lmeter.glow`, none under reduced motion — see `motionOK()` in `src/lib/motion.js`).
- `aria-label` describes the state, e.g. "Countdown 44 minutes 59 seconds left, tap for timer options".

### Tap the pill → a timer panel
Tapping the pill now **opens a panel** (it no longer pauses; long-press reset goes away).
The panel sits right under the topbar, like the "what is left" list `#lessonLeft` (`.lleft` styles in
`src/styles/practice.css` ~line 168; reuse `.lleft` card look). Opening it closes `#lessonLeft` and the ring's
list closes it in turn (`toggleLeft` in `src/views/lessonmeter.js`) — only one open at a time.
Tap the pill again, or press Escape, to close.

Panel contents (top to bottom, short labels, big tap targets ≥ 44px):
1. Title `Study timer`.
2. Mode switch, two buttons with `aria-pressed`: `Stopwatch` · `Countdown` (style like the settings choice buttons:
   look at `.set-row button` in the CSS, or copy their look).
3. Countdown only: length picker. Presets `15` `25` `45` `60` (minutes, aria-pressed on the chosen one) and a
   stepper `−` `45 min` `+` (steps of 5, range 5–180). Default **45**. Remember the last length (in the timer's
   saved state).
4. Buttons: `Start` (countdown not running) / `Pause` / `Resume`, and `Reset`.
   - Stopwatch: Pause/Resume and Reset do what tap and hold did before.
   - Countdown: Start begins from the chosen length; Reset puts it back to the full length, not running.
   - Changing the length while a countdown runs restarts it from the new length.
5. Small muted note under countdown: `Rings when time is up, even if you leave the lesson.`

### When the countdown reaches 0
- Play a soft chime **even if Sound effects are off** (the user asked for this alarm) — add a new `alarm` sound in
  `src/lib/sfx.js` (three slow bells, e.g. 784 → 659 → 523 Hz, ~1.6s total, a bit louder than `finish`) and an
  exported `alarm()` that plays it ignoring `setting("sfx")` but using `sfxVolume`. Play it twice, 1.5s apart.
- `navigator.vibrate?.([200, 120, 200])` (Android; iPhone ignores it).
- The pill shows `Rest` (see above) and the panel opens by itself in the lesson with the text
  `45 minutes done — time for a rest.` and buttons `Start again` (same length) and `Stop` (back to a stopped countdown at full length).
- If the user is **not** on a lesson page, show a small fixed card at the bottom (create one element in
  `studytimer.js`, styled in CSS, safe-area aware: `bottom: calc(16px + env(safe-area-inset-bottom))`), same text and
  the same two buttons, plus it closes on tap outside / after 20s. There is no shared toast helper in `src/`; don't
  build a general one, just this card.
- If the app was in the background when time ran out, show the finished state (and chime) when it comes back to the
  front. Do not chime again for a countdown that was already acknowledged.

## Timing rules
- **Stopwatch** keeps today's rules (counts only while a lesson is open and the app is visible; 30-minute away → new session).
- **Countdown** uses the wall clock: store `endsAt` (a timestamp). It keeps going when the app is hidden or you leave
  the lesson, and after a reload. Paused countdown stores `leftMs` instead.
- One mode at a time. Switching mode stops the other one (stopwatch time is kept; countdown resets to full length).

## Code
1. `src/lib/study-timer.js` (pure, no DOM): extend the saved state with
   `{ mode: "up" | "down", downMin, endsAt, leftMs, rang }` and add countdown methods, e.g.
   `setMode(m)`, `setMinutes(n)`, `startDown()`, `pauseDown()`, `resumeDown()`, `resetDown()`, `left()` (ms, ≥0),
   `isDone()`, `ackDone()`. Keep the existing stopwatch API and its tests working. Old saved state without `mode`
   must load as stopwatch. Wrap the `downMin` clamp (5–180, whole numbers).
2. `src/views/studytimer.js`: render both modes, the panel, the finished card, the alarm. A 1s `setInterval`
   must run while a countdown is running **on any page** (so it can ring off-lesson); for the stopwatch keep today's
   behaviour. Remove the long-press code. Keep `timerEnter()` / `timerLeave()` exports.
3. `index.html`: add `<div class="tpanel lleft" id="timerPanel" hidden></div>` right after `#lessonLeft`; give the pill
   `aria-controls="timerPanel" aria-expanded`.
4. `src/views/lessonmeter.js`: when the ring opens its list, close `#timerPanel` (tiny change).
5. `src/lib/sfx.js`: `alarm` sound + `export function alarm()`.
6. `src/views/account.js`: update the Study timer note to `A stopwatch or countdown next to the lesson ring. Tap it for options.`
7. CSS in `src/styles/practice.css` next to `.stimer`. Existing CSS variables only; check all four themes look fine
   (`data-theme` on `<html>`: spring, lacquer, ink, paper).
8. Tests in `tests/study-timer.test.js` (vitest, fake clock + fake store): countdown start/left/pause/resume/reset,
   finishing while "hidden" (time jump), `rang`/ack so it chimes once, length clamp, mode switch, loading old state.

## Don'ts
- No Notification API / push permission prompts, no Firebase sync, no progress keys, no counts of finished blocks.
- Don't touch lesson data or other views beyond the files named.
- Don't commit or push. Don't run long sweeps.

## Done when
- `npm test` and `npm run build` pass.
- Report back: files changed, anything unsure, and anything you could not check by eye.
