# 写字本 animation, round 2: plan

Written by the design lead for the implementing agent. Round 1 is live (`docs/animation-plan.md`, `src/lib/motion.js`). This round smooths the places where content still changes suddenly.

Work through the sections in order. Where this plan is silent, add no motion. Read only the files named here.

## Rules

All the Rules in `docs/animation-plan.md` still apply: 250ms at most, `--ease`, no bounce, no scale on anything containing a stroke box, no leftover transforms, no new dependencies, and everything JS-driven goes through `animate()` so Reduce Motion is honoured. Stroke drawing stays unchanged. `src/data/`, `data-src/`, `src/progress/` and `src/sync/` stay untouched.

Two exceptions to "state changes at once" and "only transform and opacity" apply, and only here:

- Closing a pop-up by its own close button or Esc may wait for its 150ms fade. Nothing else may be delayed.
- The answer reveal in section 4 may animate `height`.

`animate()` should now return the `Animation` object, or `undefined` under reduced motion. Callers that need an end step must handle `undefined` by doing that step at once.

## One observer

Rename `watchBars` to `watchMotion(root)` in `src/lib/motion.js` and keep the single `MutationObserver` on `.wrap`. Add `attributes: true, attributeFilter: ["hidden"]`. Sections 1, 4 and 5 go in this callback, so the many exercise files don't need editing. Return early when nothing relevant changed, because this runs on every DOM change. Update the call in `main.js`.

## 1. Next question

Exercises rebuild the whole `.panel` with `innerHTML` for each question: `practice.js:254`, `practice.js:370`, `typing.js:114`, `dictation.js`, `tones.js`, `reading.js:160` and `notebook-review.js:90`.

When a new `.panel` containing both `.bar` and `.progress` is added:

- Compare the `.progress` text with the last one seen. Animate only if it changed, so redraws after rotating or resizing don't replay. Remember the new text. Clear it when no such panel is on screen, or when the page changes.
- Animate each direct child of the panel except `.lbl`, `.progress` and `.bar`: `translateX(16px)` and opacity 0 to none, over `--med`. The title, count and bar stay still while the question changes.
- Keep it `translateX` only. Dictation measures its boxes with `getBoundingClientRect().width` straight after render.
- Check each listed file really renders `.bar` and `.progress` in one `.panel`. If one doesn't, tell me in the report rather than restructuring it.

Autoplayed sound, focus and keyboard handling must not change.

## 2. Changing word on the Write tab (`src/views/write.js`, `renderWord`)

`renderWord` also runs for redraws and returning from an exercise, so keep `lastWord` (lesson id and index) in the module and animate only when the lesson is the same and the index changed.

- `#wordHead`, `#example` and each `.info`: opacity 0 to 1 over 150ms.
- Each `.box .hw` and `.box .stepsvg`: opacity 0 to 1 over 150ms. Do not animate `.box` itself. The grid is rebuilt at the same position, so it looks still.
- Chip scrolling: `behavior: "smooth"` when the index changed and Reduce Motion is off, otherwise instant. Export a small `motionOK()` from `motion.js` for this. Opening a lesson stays instant.

## 3. Closing pop-ups

**Settings and the character sheet.** In `motion.js`, add `softClose(dialog)`:

- Guard against running twice.
- Add a `.closing` class. Run `animate(dialog, ...)` for opacity to 0 and `translateY(8px)` over 150ms.
- On finish, call `dialog.close()` and remove the class. Under reduced motion, close at once.
- In CSS, `dialog.sheet.closing::backdrop` fades to opacity 0 over 150ms.
- Also remove the class on the dialog's `close` event, in case something else closes it.

Wire it once at startup for `#accountSheet` and `#charSheet`:

- `submit` on the inner `form[method="dialog"]`: `preventDefault()`, then `softClose`.
- `cancel` (Esc): `preventDefault()`, then `softClose`.

Leave the code's own `.close()` calls instant (`account.js:119`, `charsheet.js:96`). The character sheet swaps content that way, and it must not fade.

**Word meaning bar (`src/views/reading.js`).** The `#glossClose` button fades `#gloss` out over 150ms, keeping its `translateX(-50%)`, then sets `hidden`. `hideGloss` itself stays instant, because `showPage` and `showTab` call it. `showGloss` must cancel any running fade first with `getAnimations().forEach((a) => a.cancel())`, so tapping another word during the fade works. A cancelled animation doesn't fire `onfinish`, so the bar stays open.

Toasts stay as they are.

## 4. Answer reveal without a jump

When `.answer` loses `hidden`, or when an empty `.ty-feedback` receives content (`typing.js`):

- In the observer callback, before paint, read `el.offsetHeight`.
- Animate `height` from 0 to that value, and opacity 0 to 1, over `--med`, with `overflow: clip` set for the animation's duration by adding a class. Remove the class when it ends or is cancelled, and if `animate()` returns `undefined`.
- Remove the existing CSS `fade-in` from `.answer` and `.ty-feedback`, so it doesn't run twice.
- The content below must move smoothly and not jump. Taps on `#qNext` must work during the animation.

## 5. End of an exercise

When a new `.score` is added and it is not inside `.review-hero`: `translateY(8px)` and opacity 0 to none, over 250ms. Results text and buttons don't animate.

## 6. Lesson loading placeholder (`index.html`, `route` and `showPage` in `src/main.js`)

`route()` shows nothing while `loadStrokes()` runs. Usually that is instant, because strokes preload in the background, but a first open or a slow phone can show a blank screen.

- Add one `<div id="pageLoading" class="page" aria-hidden="true" hidden>` in `.wrap`, using only CSS: quiet `--card` blocks in the shape of a lesson page (title, tabs, word chips, a square box). No text, no shimmer and no looping.
- In `route()`, start a 150ms timer before awaiting `loadStrokes()`. If it fires and this route is still the latest (`token === routeToken`), show the placeholder with a 150ms fade.
- Cancel the timer and hide the placeholder in `showPage` for every real page, and in the catch path. Keep `id === "loading"` handling as it is.
- If strokes are loaded already, nothing must flash. It must be impossible for the placeholder to stay on screen after any route finishes.

## Not in scope

Lists appearing row by row, score count-up, the ink effect, swipe-to-go-back and vibration.

## Checks

Run these one at a time, in the foreground. Do not leave anything running in the background, and do not start a second Edge script while one is running: they share a debugging port, and overlapping runs caused false timeouts last round.

1. `npm test` and `npm run build` pass. Add unit tests if you add any new pure logic.
2. In the built-in browser at phone size (`preview_start` name `xiezi-dev`), confirm with `document.getAnimations()`:
   - The next question animates, with `.bar` and `.progress` not animating. Check `choiceQuiz` and at least one of typing, dictation or tones.
   - Resizing during a question doesn't replay it.
   - Changing word animates the head and `.hw`. Opening a lesson doesn't. The writer `svg` width still equals the box width.
   - Settings fades on close and is actually closed afterwards (`open` is false). The same goes for Esc. The character sheet swapping characters stays instant.
   - Tapping a word during the gloss bar's fade leaves it open.
   - An answer reveal animates height and `.answer` ends with no leftover class or inline style.
   - The results `.score` animates.
3. Placeholder: wrap the load with a temporary 1-second delay, confirm it appears and goes away, then remove the delay. Also confirm it does not appear when strokes are already loaded.
4. With `matchMedia` stubbed to reduced motion, confirm dialogs close at once, the gloss closes at once, the answer shows at once, and nothing stays hidden.
5. Take at most 2 screenshots, one of them the placeholder.
6. Once at the end, one after another: `node scripts/tools/debug.mjs http://localhost:5173/xiezi/ <scratch dir>`, then `node scripts/tools/sweep.mjs http://localhost:5173/xiezi/ hsk1 1`. Report the output exactly. If one prints nothing, say so and check its exit code.

## Do not

Do not commit or push. The owner reviews first. Stop any server you started in a shell.
