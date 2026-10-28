# 写字本 (xiezi) — notes for Claude

A Chinese-learning PWA: stroke-order writing, words, listening, reading, typing and review, built from textbooks.
Live at https://bayramgeldinx.github.io/xiezi/. Pushing to `main` runs GitHub Actions, which deploys to GitHub Pages.
The owner uses it on iPhone 16 (home-screen PWA), Mi Pad 7 Pro and Windows. Progress syncs through Firebase
(project `learn-chinese-a5c0d`, email/password sign-in).

## Rules (always)
- **Copyright:** book texts (dialogues, grammar notes and exercises as printed) never go into this repo or the public site.
  They live in gitignored `data-src/private/` and owner-only Firestore. Public data is word lists plus my own sentences,
  readings and exercises written "in the book's style".
- Never enter passwords or create accounts for the owner. Never put the owner's email in the repo.
- Commits use the noreply author `327002913+BayramgeldiNX@users.noreply.github.com` and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The owner is in China on a VPN: proxy `http://127.0.0.1:7897`. Network scripts need `HTTPS_PROXY` set, and Node needs `--use-env-proxy`.
- Design: minimalist and elegant, with the dark "Ink" theme as default. No streaks, goals or reminders.
- Token budget is tight: read only the files a task touches, avoid rendering many images, and don't re-run full sweeps unless asked.

## Stack and layout
- Vite + vite-plugin-pwa (generateSW, `registerType: prompt`), base `/xiezi/`. Plain JS modules, no framework.
- `src/main.js` and `src/app.js`: hash router and home. `src/pwa.js`: updates install on a calm page or the next page change.
- `src/views/`: one file per screen.
  - `practice.js`: lesson modes; `modeAvailable()` hides modes that have no content.
  - `write.js`: stroke animation, with a Non-stop loop that runs until Stop.
  - `cards.js`, `typing.js`, `dictation.js`, `tones.js`, `reading.js`.
  - `bookreview.js`: review and the HSK-style practice test.
  - `workbook.js`: workbook quizzes. `hanzi.js`: character lessons and pronunciation tips.
  - `charsheet.js`, `printsheet.js`, `account.js`.
- `src/lib/`:
  - `pinyin.js`: syllable splitter, handles üe and erhua.
  - `speech.js`: recordings first, then TTS; `addRecordings` adds private audio.
  - `typing-check.js`, `draw.js`, `compare.js`, `settings.js`, `theme.js`.
- `src/sync/`:
  - `sync.js`: Firebase sync; `bookContent()` reads private book content.
  - `content.js`: turns private texts into readings.
- `src/progress/`: progress model and store.
- `src/data/`:
  - `books/<id>/book.json` plus `lessonNN.json`.
  - `chars.json`, `similar.json`, `radicals.json`, `glossary.json`, `stroke-names.json`.
  - Generated `*.gen.json` files.
- `firestore.rules`:
  - Owner-only: `owners/{uid}` and `books/{book}/**`, readable only if an `owners/{uid}` doc exists.
  - The rest is per-user progress.

## Books
| id | book | lessons |
|---|---|---|
| `kouyu-rumen` | 汉语口语速成 · 入门篇 (Short-term Spoken Chinese · Threshold, vol. 1) | 15 |
| `hsk1` | HSK 标准教程 1 (textbook + workbook) | 15 |
| `hsk2` | HSK 标准教程 2 (textbook + workbook) | 15 |

Progress keys (`w:你` and others) depend on the words. **Don't change existing lessons' words, examples or readings.**

## Adding or changing book content
Sources live in `data-src/`:
- `<book>-public.txt`: lines `# n title | en`, then word lines, then `## rid title | py | en` followed by reading lines, then `? q | right / wrong…`.
- `<book>-grammar.txt`: `# n`, `= point | en`, `_ sentence ___ | opts | en`.
- `<book>-workbook.txt`: `D lines / lines | q | opts` (dialog), `J text | claim | ✓/x` (judge), `R q | a` (reply).
- `<book>-extra.json`: extra fields merged per lesson (hanzi lessons, pronunciation tips).
- `<book>-chars.txt`: character meanings and memory tips.
- `private/<book>.json`: **private** book texts and notes (gitignored).

Pipeline:
1. `node scripts/import-book.mjs <book> <public.txt> <grammar.txt> <workbook.txt> [extra.json]` writes the lesson JSON.
2. New characters: stroke names are pre-filled by `scripts/stroke-types.mjs` (about 95% right), so check them by hand.
   Then add look-alikes and radicals.
3. `npm run gen:data` must report all stroke counts OK. Then run `npm run check`.
4. `npm run gen:font` (subset font) and `npm run gen:audio` (edge-tts, needs the proxy).
5. Private content: `npm run gen:private-audio`, then `npm run upload:private`.

## Build, test, ship
- `npm run dev` (or preview_start `xiezi-dev`), `npm test` (vitest), `npm run build`.
- Live checks after deploy: `npm run test:edge` and `node scripts/e2e/screens.mjs <url> <outdir>`.
  Sync check: `npm run emulators`, then `npm run test:sync`.
- The hidden browser pane pauses requestAnimationFrame, so test animations in headless Edge (scripts/e2e).
- PWA cache: an old install can show old bugs until it updates. Audio is cached at runtime (`xz-audio`), not precached.
