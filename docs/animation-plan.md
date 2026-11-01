# 写字本 animation: plan

Written by the design lead for the implementing agent. The owner chose: Balanced amount, quick and calm feel, iPhone-style page slides, no vibration.

Work through the sections in order. Where this plan is silent, add no motion. Keep the work tight: the last build took too long, so read only the files named here and run the Edge scripts only once, at the end.

## Rules

- **Timing:** press 100ms; everything else 150 to 250ms. Nothing is longer than 250ms. Exceptions: the existing mic pulse and the existing stroke drawing.
- **Easing:** `cubic-bezier(.2, .8, .2, 1)`, with no bounce or overshoot. Add tokens to `:root`: `--fast: 100ms; --med: 200ms; --ease: cubic-bezier(.2, .8, .2, 1);`.
- **Never block input:** no `pointer-events: none` on anything still usable, no `await` or `setTimeout` before a state change, and no delayed rendering. A tap during an animation must act at once. Keyboard shortcuts in flashcards and writing must stay instant.
- **Only animate `transform` and `opacity`**, except the progress bar width and the answer `box-shadow` below.
- **Never scale anything that contains a stroke box.** `write.js:102`, `dictation.js:92`, `notebook-review.js:210` and `notebook.js:204` size their writers from `getBoundingClientRect().width`, and scale would change that value. Translate and opacity are safe.
- **No fill modes that keep a transform after the animation ends.** A leftover transform breaks `position: sticky` in the landscape Write sidebar.
- **Reduced motion:** the rule at the end of `styles.css` only covers CSS. Any Web Animations API (`el.animate`) call must go through a helper that checks `matchMedia("(prefers-reduced-motion: reduce)")` at call time and does nothing if it matches.
- **No new dependencies.** No confetti, celebration, looping or background motion. Do not change the stroke animation (`src/lib/draw.js`, `src/views/write.js` writers).
- Do not touch `src/data/`, `data-src/`, `src/progress/` or `src/sync/`.

## New file: `src/lib/motion.js`

Holds everything below that needs JS:

- `animate(el, keyframes, options)`: reduced-motion check, then `el.animate(...)`. It uses no fill mode, and returns nothing to wait for. Web Animations restart cleanly, so no class juggling is needed.
- `pageDepth(hash)`: a pure function. `#/` and empty are 0. `#/books`, `#/review`, `#/typing`, `#/search` and `#/notebook` are 1. `#/book/<id>[/review]` and `#/notebook/<word>` are 2. `#/lesson/...` is 3. `#/print/...` is 4.
- `slideDirection(fromHash, toHash)`: a pure function returning `"forward"`, `"back"` or `"none"`. Same depth returns `"none"`.
- `slidePage(el, direction)`.
- `moveTabPill(tabsEl, instant)`.
- `watchBars(root)`.

Add unit tests for `pageDepth` and `slideDirection` in `tests/`, in the style of the existing tests.

## 1. Tap press (CSS only)

`:active` scale `.98` over `--fast` on `.row, .book-card, .mode-card, .btn:not(:disabled), .choice:not(:disabled), .tile, .tone-opt:not(:disabled), .chip:not(:disabled), .words button, .continue, .rd-item`. Replace the existing one-off `:active` and `transition` declarations on `.btn`, `.row` and `.continue` so there is one shared rule. `.lesson-row` keeps its background change instead, because its parent clips it.

Do not put it on `.fc` (the flip owns its transform), and never on `.box`.

iOS Safari only applies `:active` if the page has a touch listener. Add `document.addEventListener("touchstart", () => {}, { passive: true })` in `motion.js`.

## 2. Page slides (`showPage` and `route` in `src/main.js`)

The incoming page slides and fades in; the old page disappears at once. Do not attempt a full two-page slide with the View Transitions API: `route()` runs async and writers must measure their box synchronously, so it would be fragile.

- Forward: `translateX(32px)` and opacity 0 to none, over `--med`.
- Back: `translateX(-32px)`, same.
- `"none"`: opacity only, 150ms.

Implementation:

- Keep `lastHash` in `main.js`.
- Animate at the end of `showPage(id)`, on `$("#" + id)`.
- `showPage("loading")` must not animate or update `lastHash`. There is no `#loading` element, so `id === "loading"` should return before any of this.
- No animation on the very first render after boot or reload.
- No animation when the hash has not changed, because `go()` re-runs `route()` for the same hash.
- Skip when the event says the browser already animated: in the `hashchange` listener, `e.hasUAVisualTransition` true means no slide for that navigation.
- Lesson tab changes and `showBook` tab changes do not call `showPage` and must not slide.

Sideways page scroll must not appear during a slide. Check `.wrap` and add `overflow-x: clip` if needed; `clip` does not break `position: sticky` the way `hidden` does.

## 3. Tabs

- Lesson tabs and `.book-tabs`: add one `<i class="tab-pill" aria-hidden="true">` inside each `.tabs` in `index.html`.
- `.tabs` is `position: relative`. The pill is absolute with `--card2` background and the inset line, and it moves with `transform` and `width` over `--med`. `.tab` sits above it with `position: relative; z-index: 1`.
- The selected tab keeps its ink colour but loses its own background. The pill must not take a grid cell in the phone layout; absolute positioning handles that.
- `moveTabPill(tabsEl, instant)` measures the selected tab with `offsetLeft`, `offsetTop`, `offsetWidth` and `offsetHeight`. Selected means `[aria-selected="true"], [aria-pressed="true"]`. With `instant`, it turns the transition off for that move.
- Call it instantly from `openLesson` and from `showBook` on opening, animated on a tab tap, and instantly from the existing resize path (`redraw` in `main.js`).
- Sections are hidden while measured at 0 width, so call it after `showPage`.
- Tab content (`#tab-*`): opacity 0 to 1 over 150ms in `showTab`. No translate.
- `.mode`, `.seg button` and `.scope button`: a colour and background transition over `--fast`. No pill.

## 4. Flashcards (`src/views/cards.js`)

`cardsRender` replaces the whole card with `innerHTML`, so animate the new card right after render:

- Flip: `rotateY(-90deg)` to none over `--med`, with `perspective(800px)` in the transform. Only the second half of the flip shows, which keeps the answer visible immediately.
- Next card (Got it, Again): `translateX(24px)` and opacity 0 to none, over `--med`.
- Set the kind with a `deck.anim` field just before `cardsRender()`, and clear it after use. No animation on the first card, on changing the card direction, or on the finished screen.

## 5. Answer feedback (CSS only)

- `.choice.right, .tone-opt.right`: a single soft jade `box-shadow` glow keyframe over 250ms, ending at the existing right state.
- `.choice.wrong, .tone-opt.wrong`: the existing `shake` keyframe, shortened to 200ms. `.tile.bad` already shakes; give it the same 200ms.
- `.answer`, `.ty-feedback`, `.status`: fade in over 150ms when they appear, only if this does not replay on re-render of an unchanged screen.
- `.tile.done` keeps its existing transition.

## 6. Progress bars

Exercises rebuild `.bar i` with `innerHTML` on every question (`practice.js:262`, `typing.js:121`, `dictation.js:72`, `tones.js:62`, `reading.js:171`, `notebook-review.js:100`), so a CSS transition never runs.

Do not edit those files. `watchBars(root)` uses one `MutationObserver` on `.wrap`, with `childList` and `subtree`. When a new `.bar i` appears, it animates `width` from the last remembered width to the element's inline width, over `--med`, then remembers the new width. Reset the remembered width to 0 when the new width is lower than the last one, so a new exercise starts cleanly. Keep the callback cheap: return early when no added node contains `.bar`.

Book rows (`.lp-bar i` in `showBooks`): grow from 0 over 250ms when the Books page opens. Not in `renderLessonList` or on sync refreshes.

## 7. Small overlays (CSS only)

`dialog.sheet[open]`, `.gloss` and `.toast`: fade in and rise 8px over `--med`. The gloss and toast already use `transform: translateX(-50%)`, so their keyframes must keep it. `::backdrop` fades over `--med`.

## Not in scope

Score count-up, lists appearing row by row, the ink effect on finished characters, and vibration. The owner did not choose these.

## Checks

1. `npm test` and `npm run build` pass, including the new tests.
2. In the built-in browser at phone size (`preview_start` name `xiezi-dev`), use `document.getAnimations()` straight after an action to confirm the animation runs: a page change forward and back, a tab tap, a flashcard flip and next card, and one right and one wrong answer. Screenshots can't prove motion, so take at most 2, to check the tab pill's position on phone and desktop sizes.
3. Confirm that with reduced motion emulated, or by stubbing `matchMedia`, `animate()` does nothing.
4. Confirm a stroke box still gets the right size when opening a lesson straight from Home: the writer's `svg` width equals the box width.
5. Run once at the end: `node scripts/tools/debug.mjs http://localhost:5173/xiezi/ <scratch dir>` and `node scripts/tools/sweep.mjs http://localhost:5173/xiezi/ hsk1 1`. Report the results exactly.

## Do not

Do not commit or push. The owner reviews first. Stop any server you started in a shell.
