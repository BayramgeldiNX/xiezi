# 写字本 minimal redesign: plan

> Update: the owner found the fully flat version too bare ("looks like a demo"), so cards, real buttons, seals and short descriptions came back. The direction below still applies to the layout, the single red action and the Write tab order, but not to "flat" and "no boxes".

Written by the design lead for the implementing agent. Follow it in order. Where it is silent, remove rather than add.

## What is wrong now

1. **Everything looks equally important.** Home has five identical cards, each with a seal, a title, a subtitle and a chevron. Red marks both Review and Books, so nothing says "start here".
2. **Boxes inside boxes.** Cards, panels, pills, seals and segmented controls all have a border, a fill and a radius. The page also has background glows.
3. **Things are said twice.** Home has a greeting, a date, an emblem, a title, pinyin and an English line before any action. Inner pages show `复 · 复习` above `Review`. On the Write tab the word appears in the chip, the word head and the character card.
4. **The Write tab is too busy.** Above and around the stroke box sit the tabs, the practice strip, the chips, the word head, the example, two help notes, the stroke count, badges, a tip box, the mode switch and the controls. On a phone the writing box is pushed down the screen.
5. **Too many small differences.** There are about ten radii and many one-off font sizes. Some tap targets are under 44px.

## Design direction: one sheet of paper

- **Flat.** The page is one surface. Group with space and hairlines, not with boxes. Only dialogs, the gloss bar and toasts float.
- **One red thing per screen.** `--cta` is only for the single main action. Jade and amber only mean right/known and learning. Tone colours stay. Gold goes away.
- **Type makes the hierarchy.** Big serif hanzi carries the page. Labels are plain and quiet, with no uppercase eyebrows.
- **Show the next step.** Secondary things stay reachable but quiet.

## Tokens (top of `src/styles.css`)

- Spacing only from: 4, 8, 12, 16, 24, 32, 48.
- Radii: `--r: 12px` for controls, 16px for dialogs. Pills only where already round by function (the mic).
- Text sizes for UI: `.8125rem` (meta), `1rem` (body), `1.25rem` (titles), `1.5rem` (page title). Hanzi display sizes may stay as they are.
- Remove `body`'s radial gradients, `--glow`, `--glow2`, `--shadow` and their uses. Set `body` to plain `var(--paper)`.
- Set `--card` equal to `--paper` for page content in both themes. Keep `--card2` as the one raised tone (selected item, dialogs, gloss, toast).
- Replace `--gold` uses with `--muted`, then delete it.
- Both themes (Ink default, Paper) must keep working. Change values through tokens.
- Every tappable control is at least 44px tall, including `.say`, `.mode`, `.scope button`, `.seg button`, `.sheet-close`, `.tab`. Keep them visually light; use transparent padding.

## Screens

### Home (`index.html`, `showHome`/`renderHub`/`renderResume` in `src/main.js`)

```
白怀诚的写字本                      Sync

[ Continue                          > ]    the only red block
[ 你好吗 · Write                      ]

Review 复习                           9
─────────────────────────────────────
Notebook 生词本                       3
─────────────────────────────────────
Books 课本                      1/536 字
─────────────────────────────────────
Typing 打字                           8
─────────────────────────────────────
Search 查词
```

- Remove the greeting, date, emblem, pinyin and English hero lines, and the code that only served them (`greeting`, `#greet*`, `#heroPy`, and their entries in the `data-py` selectors).
- `白怀诚的写字本` is a small serif `h1` on the left of the top row. The account chip is on the right as borderless muted text; status still changes its colour.
- Continue: one solid `--cta` block, 2 lines: `Continue`, then `<lesson title> · <word if on Write> · <tab>`. Drop the book name.
- Rows replace cards: no seal, no subtitle, no chevron, no progress bar, a hairline between rows, 56px tall. Left: English in body weight 700, Chinese in muted serif. Right: a quiet number, or nothing when it is zero.
- Remove `#hubBooksSub` and `#hubBar`. Keep the ids `#reviewMeta`, `#hubMeta`, `#notebookMeta`, `#typingMeta`.
- `scripts/e2e/sync.mjs:178` reads `#reviewMeta` and `#hubMeta`. Read how it uses them and update the test's expectations if the new text requires it. Do not weaken what it checks.
- Max width 560px at every size. Stays a single column on Mi Pad and Windows.

### Every inner page

- Back is a borderless chevron with a 44px target. No circle.
- Remove the `eyebrow` lines from static pages (Review, Typing, Search, Notebook, Books, Print). Keep the title alone.
- Book and lesson pages keep one quiet context line in muted normal case (for example `HSK 1`), with no gold and no uppercase.
- `.eyebrow` and `.lbl` become muted, normal case, normal letter-spacing, `.8125rem`.
- The full-screen button is borderless and muted.

### Books and lessons

- Book rows: remove the coloured cover. Title (serif), then the part in muted text, then a right-aligned `12/230 字`. Show the due count as a plain number with "to review". Drop the English subtitle and lesson count.
- Keep a 2px progress hairline under a row only when progress is above zero.
- Lesson rows: plain muted number, no circle. Title in serif. Right: `3/12`. Remove the `Lesson n · x words · y characters` line, the "mastered" text and the chevrons. A row with no progress shows nothing on the right.
- Lessons/Review switch: same underline tab style as the lesson tabs.

### Lesson tabs

- `.tabs` loses its container: no border and no fill. The selected tab gets ink text and a 2px underline; others are muted. Keep the stacked hanzi and label on phones.

### Write tab, the most important screen (`index.html`, `src/views/write.js`, `showWriteStudy`)

Target order on a phone: tabs, then a single scrolling line of word chips, then the word with its sound button, then the writing box, then the mode switch, then controls, then everything else.

- Word chips: one horizontal scrolling line (no wrap) on phones, wrapping in the landscape sidebar. No borders. Selected is ink with an underline. Keep the status dot.
- Move `#writeStrip` to after `#writeStudy` so the exercises come after the character. Make it a quiet list of text buttons with a plain `Practice` label, no seals. `showWriteStudy` and the exercise flow must still hide and show it correctly.
- `.char` loses its box: no border, fill, padding or shadow.
- Do not repeat the word: when the word has one character, hide the card's `.title` row. For multi-character words keep it, smaller, because it glosses each character. Check other callers of `buildCharCard` and leave their display correct.
- Replace the badges and stroke count with one muted meta line, for example `8 strokes · Learning · written 3×`. Keep the status colour on the status word only.
- Memory trick: plain muted paragraph, with no box and no `Memory trick:` bold label colour.
- Example: remove the left border, fill and `Example sentence` label. It is just the sentence, with pinyin and meaning below.
- Delete the long `Non-stop…` note and the dots legend. Keep the keyboard shortcut line for fine pointers only, muted, under `<details><summary>Keys</summary>`.
- Mode switch: underline style, same as the tabs, with 44px targets.
- Only Play or Next stroke is solid red. Stop, Back and Replay are borderless.
- The stroke box must be fully visible without scrolling on iPhone 16 (393x852) with the word `你好`.
- Landscape layout (1000px and up) stays: the word list on the left, characters on the right.

### Practice menus (`showMenu` in `src/views/practice.js`, review types in `src/views/bookreview.js`)

- `.mode-grid` becomes a single-column hairline list. Each row has the name, and `sub` under it in muted `.8125rem`. Remove the seals here and in `SKILLS` usage. Leave `seal` data in place if other code reads it, otherwise delete it.
- Max width 560px.

### Exercises (`.panel`, `.fc`, `.choice`, `.tile`, `.tone-opt`, reading, typing, dictation)

- `.panel` loses its border, fill and padding. It keeps its gap.
- Answer options keep a hairline border because they are real targets, using `--r`. Right and wrong states stay jade and cinnabar.
- Flashcard: no card box border; the large hanzi floats on the page. The tap area stays the same size.
- `.stats` boxes become plain numbers with labels, no borders. `.rv-row` and similar lists use hairlines, not boxes.
- `.btn` default: no border, `--card2` fill. `.btn.ghost`: no fill. Reduce visible buttons to one primary per screen where a screen shows more than one.

### Dialogs and settings

- Keep dialogs raised (`--card2`). Use `--r` values and 44px close targets. Settings controls use the same underline or simple segmented style as the rest.

### Leave alone

- The printed sheet (`.ps-*` and `@media print`) looks like paper and stays as it is.
- The stroke grid and character colours in the writing box.
- Tone colours, and all pinyin-hide behaviour.

## Rules

- Change the look, not the behaviour: same routes, ids used by code, `data-*` hooks, progress keys and lesson data. Do not touch `src/data/`, `data-src/`, `src/progress/`, `src/sync/`.
- Nothing from book texts enters the repo. No streaks, goals or reminders. No new dependencies.
- Delete CSS and code that nothing uses any more. `styles.css` should end up shorter than it started (571 lines).
- `npm run gen:font` subsets the serif font. Only run it if you add new Chinese characters to static UI text, and avoid adding any.

## Order of work

1. Tokens and base, buttons, topbar.
2. Home, then `sync.mjs` if needed.
3. Books and lesson lists, then tabs.
4. Write tab.
5. Practice menus, then exercises, then dialogs.
6. Check.

## Checks

The worktree has no `node_modules`, so run `npm install` first (with `HTTPS_PROXY=http://127.0.0.1:7897`).

1. `npm test` and `npm run build` pass.
2. With the dev server running (`http://localhost:5173/xiezi/`), `node scripts/tools/debug.mjs <url> <scratch outdir>` shows no JS errors, sideways overflow or targets under 44px at iPhone, Mi Pad and Windows sizes. Fix what it finds.
3. `node scripts/tools/sweep.mjs <url> hsk1 1` reports no errors or empty screens.
4. Look at no more than 6 screenshots in total (tokens are tight): Home and the Write tab at iPhone size, and one in Paper theme.

## Do not

Do not commit or push. Pushing to `main` deploys to the owner's phone, and the owner has not approved that yet. Leave the changes uncommitted in this worktree.
