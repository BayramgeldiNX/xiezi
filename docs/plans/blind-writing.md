# Plan: "From memory" (默写) mode in the writing section

For: Sonnet, implementing. Read only the files listed here.

## Goal
The owner wants to memorise how characters are written. Today the character card in
`src/views/write.js` (`buildCharCard`) has three modes:

| mode | data-m | what it shows |
|---|---|---|
| Non-stop | `flow` | animation loop |
| Stroke by stroke | `step` | one stroke at a time |
| Write it | `quiz` | Hanzi Writer quiz **with the grey outline** (you trace) |

Add a fourth mode, **From memory** (默写), that works like dictation
(`src/views/dictation.js`): an empty 田字格, no outline, no stroke order shown. You write the
whole character from memory, stroke by stroke; Hanzi Writer checks each stroke silently.
Help only comes when you ask for it, or after repeated misses.

## What the user sees
- Mode tab: `From memory` after `Write it` (keep the labels short so four tabs fit at iPhone 16 width; check overflow).
- Box: grid only. Outline hidden, character hidden.
- The stroke strip under the card (`.strip`) and the stroke-name line are **hidden** in this mode
  (they give the order away). The `tip` paragraph stays (it is a memory aid, not the order).
- Title row still shows 汉字 + pinyin + meaning + sound, and the meta line "7 strokes". The stroke count is fine to show.
- Status text: `Write 你 from memory.` → on each correct stroke `✓ 3 / 7` (no "stroke 4 next" wording,
  no "check the stroke order"). On a mistake: `Not that one, try again.`
- Controls (`data-for="blind"`): `Hint`, `Show answer`, `Start again`.

## Hint ladder (like dictation's `hintLevel`)
Each press of **Hint** goes one level up; the highest level used is remembered for scoring.
1. **Peek**: show the outline for ~1.2 s, then hide it (`writer.showOutline()` → `setTimeout` → `writer.hideOutline()`).
   Guard the timeout with a token so a mode change or restart cancels it.
2. **Next stroke**: highlight the stroke you are stuck on (`writer.highlightStroke(next)`, Hanzi Writer 3.x).
   Track `next` from `onCorrectStroke` (`d.strokeNum + 1`); start at 0.
3. Hint button disabled after level 2.

Automatic help: pass `showHintAfterMisses: setting("hintAfter") || false` as `quiz` does, so the
existing setting still works. Also pass `markStrokeCorrectAfterMisses: 4` so nobody gets stuck forever;
count a forced stroke as a mistake (check `onCorrectStroke` data / `onMistake` `mistakesOnStroke`).

**Show answer**: `writer.cancelQuiz()`, `writer.showCharacter()` (or `animateCharacter()`), status
`Here's the answer. You'll get it next time!`, record as a fail (see below). Then `Start again` offers a retry.

## Scoring and progress
- Use a **new** progress key `m:<char>` so existing `w:` keys and statuses keep their meaning
  (CLAUDE.md: don't change existing keys). Record like dictation:
  `progress.record("m:" + c, { ok: perfect, miss: mistakes + hintLevel + (gaveUp ? 3 : 0) })`,
  where `perfect = !gaveUp && mistakes === 0 && hintLevel === 0`.
- Check `src/progress/model.js` (`charStatus`) and `src/progress/store.js`: make sure an unknown key
  prefix `m:` is accepted and synced (search for where prefixes like `d:`, `nb:`, `bs:` are handled; add `m:` the same way if there is a list).
- `metaText(c, n)` in `write.js`: add `· from memory ✓N×` (or similar, muted) when `m:<c>` has successes.
  Keep it one short line. Do not change how "Mastered" is computed unless trivial and safe; mention it in the PR if not done.
- Review (optional, second PR): `bookreview.js` could later use `m:` keys. Out of scope here.

## Code changes (all in `src/views/write.js` unless noted)
1. Template: add `<button class="mode" role="tab" data-m="blind">From memory</button>` and
   `<div class="controls" data-for="blind" hidden>` with the three buttons (`data-a="bhint"`, `"banswer"`, `"blind"`), using `icon("hint")`, `icon("eye")` if it exists (check `icon()`'s set), `icon("replay")`.
2. `setMode(mo)`: also toggle `.strip` and `.strokename` hidden when `mo === "blind"`; call `blind()`.
   Remember to cancel the peek timeout here.
3. New `blind()` next to `quiz()`:
   ```js
   function blind() {
     hintLevel = 0; mistakes = 0; next = 0; gaveUp = false; ++peek;
     writer.cancelQuiz(); writer.hideCharacter(); writer.hideOutline();
     status.textContent = `Write ${c} from memory.`;
     writer.quiz({ showHintAfterMisses: setting("hintAfter") || false, markStrokeCorrectAfterMisses: 4,
       highlightOnComplete: true,
       onCorrectStroke: (d) => { next = d.strokeNum + 1; status.textContent = `✓ ${next} / ${n}`; },
       onMistake: () => { mistakes++; status.textContent = "Not that one, try again."; },
       onComplete: () => { /* record m:, update .count, markWords(), message */ },
     });
   }
   ```
   Note `quiz()` sets the outline via the writer's defaults (`showOutline: true` in `lib/draw.js`):
   when leaving blind mode, `quiz()`/`play()` must call `writer.showOutline()` again. Add that to `setMode`.
4. Button handler (the `data-a` switch near line 230): `bhint`, `banswer`, `blind`.
5. Keyboard (`api.key` and `writeKey`): `m` switches to From memory; `h` = hint while in it;
   space restarts it. Add `"m", "h"` to the key list in `writeKey`.
6. `src/views/practice.js`: nothing, unless the lesson help text lists the modes, then add one line.
7. CSS: only if four mode tabs overflow on 375–393 px width. Prefer letting `.modes` wrap or
   shrinking padding over smaller tap targets (keep ≥44 px).

## Don't
- Don't touch lesson words, examples or readings. Don't rename existing modes or keys.
- No streaks/goals. Keep the minimalist look; use existing classes (`btn ghost`, `btn primary`, `status`).

## Test
- `npm test` (add a small vitest if there is a pure helper, e.g. scoring; UI needs none).
- `npm run dev`, open a lesson's Write tab, check: outline hidden, strip hidden, hint 1 flashes then hides,
  hint 2 highlights the right stroke, Show answer, Start again, switching back to `Write it` shows the outline again.
- Animations: the hidden browser pane pauses requestAnimationFrame, so check the peek/animation in headless Edge
  (`scripts/e2e`) or with the pane visible.
- `node scripts/tools/debug.mjs http://localhost:5173/xiezi/ <outdir>` for overflow and tap-target sizes at iPhone 16 / Mi Pad / Windows.
- Themes: glance at Spring and Lacquer (outline and highlight colours come from CSS vars, so they should just work).

## Ship
Branch, commit with the noreply author and the Co-Authored-By line from CLAUDE.md, open a PR to `main`.
