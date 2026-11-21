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
- Design: minimalist and elegant, with theme Auto as default: 春 Spring by day, 漆 Lacquer at night (follows the device); 墨 Ink and 宣纸 Paper are optional (setting key `xz-theme2`, `data-theme` on `<html>`). No streaks, goals or reminders.
- Token budget is tight: read only the files a task touches, avoid rendering many images, and don't re-run full sweeps unless asked.

## Stack and layout
- Vite + vite-plugin-pwa (generateSW, `registerType: prompt`), base `/xiezi/`. Plain JS modules, no framework.
- `src/main.js` and `src/app.js`: hash router and home. Pages: `#/` home, `#/books`, `#/book/<id>`, `#/lesson/<id>/<tab>`, `#/review` (all books), `#/search`, `#/shelf`, `#/pdf/<id>/<page>`, `#/typing`, `#/print/<id>`, `#/test/<book>/<id>` (a test: `s1`…, `mid1`, `mid2`, `final`) and `#/test/<book>/<id>/report` (best score report).
  The route waits for `loadStrokes()` before lesson and print pages.
- `src/pwa.js`: updates install on a calm page or the next page change.
- PC layout (`src/styles/desktop.css`): only at 1200px or wider with a mouse, so phones and tablets never get it. A sidebar (`.side` in `index.html`, current section set by `markSide` in `main.js`), wider pages, and a key number on each quiz choice.
  The sidebar folds to a rail of seals (button or `Ctrl+B`; `data-rail` on `<html>`, saved per device in `xz-rail`, `setRail` in `main.js`). The slide is a CSS transition on `--side`.
  Global keys live in the `keydown` handler in `main.js`: `/` search, `Esc` back, then the screen's own keys (`screen.key`), then `1`–`9` pick a choice and `Enter` is Next (`quizKey`).
- `src/lib/screen.js`: what is on screen now. A screen registers what must end when you leave it (`onLeave`: a mic, a timer) and its keys and resize handlers (`onKey`, `onResize`); page, tab and exercise changes call `leave()`. main.js routes keys and resizes through it instead of knowing each view.
- `src/views/`: one file per screen.
  - `practice.js`: lesson modes; `available()` (in `progress/lesson-exercises.js`) hides modes that cannot run.
  - `quiz-round.js`: `runRound(cfg)`, the loop one-question-at-a-time exercises share (head, focus, Next bar, score, session, results with Again / Retry missed, `then` for Review chains). An exercise only draws and checks one item. Used by `choiceQuiz` (and everything built on it), Speak, Build the sentence, Tones and Notebook review.
  - `write.js`: stroke animation, with a Non-stop loop that runs until Stop.
  - `cards.js`, `typing.js`, `dictation.js`, `tones.js`, `reading.js`.
  - `bookreview.js`: review and the HSK-style practice test.
  - `workbook.js`: workbook quizzes. `hanzi.js`: character lessons and pronunciation tips.
  - `search.js`: search all words (matcher in `lib/search.js`).
  - `notebook.js`, `notebook-review.js`: Notebook (生词本) at `#/notebook[/<word>]`: words saved from daily life, with a word page and four review types (flashcards, listening, writing, sentence gap). Practice has its own address, `#/notebook/-/<review|flash|listen|write|gap>`, so Back returns to the list.
  - `radicals.js`, `radicals-practice.js`: Radicals (部首) at `#/radicals` and `#/radical/<r>`: 81 core radicals in 6 stages (the first, Basic shapes, holds 一 十 八 儿 大 小), with cards, find-the-radical and guess-the-meaning practice (progress key `bs:<r>`; helpers in `lib/radical-quiz.js`).
    Data: hand-written `data/radicals-core.json` (`kind` meaning/shape, `guess`, `lesson`), and `radical-families.gen.json` from `scripts/gen-radicals.mjs` (run by `gen:data`).
    Lessons: `radical-lesson.js` at `#/radical/<r>/learn/<step>` (6 steps, 7 for radicals with look-alike `twins` in `radicals-core.json`: a "Tell them apart" step with a small drill; done key `bsl:<r>`). The last step is a 10-word check (`pickLessonWords` picks new or missed family words each time; Spot / Meaning questions alternate in one round; each answer saves `bsw:<char>`, `bs:<r>` once at the end); `node scripts/tools/radical-sweep.mjs <url>` plays every Radicals screen. Find never offers a radical that sits inside the character: `char-inside.gen.json` (all components of each character, from `gen-radicals.mjs`) is checked in `pickRadicalDistractors`, and twins are offered first. Pictures in `public/radicals/`: `pic/<hex>.svg` (own drawings) and `ancient/` (public-domain forms from Wikimedia Commons via `scripts/fetch-ancient.mjs`, credits in `ancient.gen.json`), shown with CSS mask, cached at runtime.
  - `exam.js`, `exam-result.js`, `exam-report.js`: tests at `#/test/<book>/<id>`: cover, timed questions with an answer sheet, hand-in and result, then the score report (成绩单). The book page shows a row for each test between the lessons (`src/exam/rows.js`); a book's Review links to its final test.
  - `shelf.js`, `pdfview.js`: Shelf (书架) at `#/shelf` and the one-page reader at `#/pdf/<id>[/<pdfPage>]` (swipe, tap edges, arrows, pinch/double-tap zoom; last page per device in `xz-pdf-place`). Owner only: pages are WebP images in owner-only Firestore `books/<book>/pages/<id>-<NNN>` (`img`, `w`, `h`, `v`; uploaded by `upload:pages`), read over REST with the user's token by `bookPage()` in `sync/sync.js` (not through the SDK, so Firestore's offline cache does not keep a second copy) and cached once in IndexedDB `xz-pages` (`src/pdf/store.js`: `getPage`, `getThumbs`, `prefetch`, `saveBook`, `removeOffline`; a page older than `img.v` in `book-pdfs.json` is refetched). **Smooth opening:** `warmBooks()` (sync.js) loads the SDK, waits for auth and keeps the ID-token header ready (renewed before it expires), so `bookPage` and `bookThumbs` start at once; it runs when the Shelf opens, at startup for the owner (idle) and on pointerdown on a Shelf row, which also starts that book's saved page and preview chunk (`openHint`). **Previews:** Firestore `books/<book>/thumbs/<id>-<k>` holds 40 small WebPs (`imgs`) with the full page sizes (`w`, `h`); page n is chunk `floor((n-1)/40)`, index `(n-1)%40` (`chunkOf` in `src/pdf/queue.js`), cached in `xz-pages` as `<id>-t<k>`. A sheet shows its preview softened (CSS blur) at the exact page shape, and the sharp page fades in over it after `img.decode()`. **One queue** (`src/pdf/queue.js`, pure and tested): 3 downloads at a time, ordered by `pagePrio`/`thumbPrio` (current page, current chunk, pages ±1, +2..+5 and −2, background); `setFocus` re-orders what waits when the page changes; a key already cached or in flight is never fetched twice. **Background save:** once the page on screen and its neighbours are in, `saveBook` fetches the rest of the open book (chunks, then pages, nearest first) 2 at a time behind anything the reader asks for; it pauses while the app is hidden, waits when offline, stops when signed out, and keeps going after the reader is closed. Manage on the Shelf shows "Saving n / total" or "Saved on this device" and Remove saved copy. `isOwner()`/`ownerStatus()` read `owners/{uid}`; the answer is kept in `xz-owner` and decides whether the Shelf links (sidebar, Home) and the lesson "Book p. N" / "Workbook p. N" links show; signed-out and non-owner users get one quiet line. Page map (lesson → PDF page, printed page runs) in `src/data/book-pdfs.json`, helpers in `src/pdf/pages.js`. pdf.js is gone; the old `xz-pdf` IndexedDB is deleted once at startup. Back returns to the lesson.
  - `charsheet.js`: the 字 character card for any character (not only the books'): parts open their own cards, with a trail (换 › 奂 › 央; Back and Esc go up one step), a verdict line from `lib/char-kind.js` (in your books / common / part / radical side form / basic shape), and a sound family.
  - `printsheet.js`, `account.js`.
- `src/lib/`:
  - `pinyin.js`: syllable splitter, handles üe and erhua.
  - `search.js`: `matchesWord` (汉字, pinyin with or without tones, English).
  - `speech.js`: recordings first, then TTS; `addRecordings` adds private audio.
  - `sfx.js`: sound effects made with Web Audio (no files), settings `sfx` and `sfxVolume`. Taps tick by themselves; writing quizzes get stroke sounds in `makeWriter`; answers and finished exercises sound through `progress.setHooks` (`record(key, result, { sfx | quiet })`, rules in `sfx-pick.js`).
  - `typing-check.js`, `draw.js`, `compare.js`, `settings.js`, `theme.js`.
  - `qpinyin.js`: the 拼 Pinyin and 英 English switches in quizzes. English comes from `data/sentence-en.gen.json` (made by `scripts/gen-sentence-en.mjs` from lesson `en` fields plus hand translations in `data/sentence-en/part-*.json`; `--todo N` lists new untranslated sentences).
- `src/exam/`: tests. `plan.js` (where they sit and how big), `build.js` (picks a paper from lesson content), `grade.js` (scores and seals), `run.js` (one sitting, saved on the device), `store.js` (results, synced), `rows.js` (book-page rows).
- `src/sync/`:
  - `sync.js`: Firebase sync; `bookContent()` reads private book content.
  - `content.js`: turns private texts into readings.
- `src/notebook/store.js`: Notebook words (localStorage `xz-notebook-v1`), synced to `users/{uid}/notebook/{word}` as field-level patches. Its schedule is the progress key `nb:<word>`; Notebook never records book keys.
- `src/lib/dict.js`: `lookup(word)` from the book words, then CC-CEDICT shards in `public/dict/` (made by `scripts/gen-dict.mjs`, CC BY-SA 4.0). `charParts`, `soundFamily` and the tier (8th field of `chars.json`: how many CC-CEDICT words use the character, 2+ = common) come from `chars.json`; `charSenses`, `wordsWithChar` and `searchDict` (the "Not in your books" results of `#/search`) from the shards. After changing tiers: `CHARS_ONLY=1 HANZI=<makemeahanzi file> node scripts/gen-dict.mjs` rebuilds `chars.json` without downloading CC-CEDICT again. Stroke data for any character: `public/strokes/` (generated at build by `scripts/gen-public-strokes.mjs`, gitignored) and `ensureChars()` in `data/strokes.js`.
- `scripts/notebook.mjs` (`count`, `list`, `save <file>`, `hook`; `--emulator --uid`), `.claude/skills/fill-notebook/` and the SessionStart hook in `.claude/settings.json`: Claude fills new Notebook words with a sentence and memory tricks. `scripts/lib-firebase.mjs` holds the shared login and owner lookup (uid cached in `.cache/owner-uid`).
- `src/progress/`: progress model and store. `keys.js` lists every kind of progress key (w:, d:, nb:, bs:…) and what it means for lesson % and sounds. The store tracks what is not yet uploaded (`unsent`, `sentFor`), so sync sends only changes.
  - `lesson-exercises.js`: the one place that knows what each lesson exercise asks and which keys it records (`exerciseItems`), lesson % and what is open (`lessonParts`, `lessonLeft`), and whether an exercise can run (`available`). Views take their rounds from it; `tests/lesson-keys.test.js` snapshots every lesson's keys. Terms: `GLOSSARY.md`.
- `src/data/`:
  - `books/<id>/book.json` plus `lessonNN.json`.
  - `strokes.js`: `loadStrokes()` loads the big `strokes.gen.json` on demand; `stroke-chars.gen.json` is the small list of characters that have strokes.
  - `chars.json`, `similar.json`, `radicals.json`, `glossary.json`, `stroke-names.json`.
  - Generated `*.gen.json` files.
- `firestore.rules`:
  - Per-user sync doc `users/{uid}/meta/place`: last place, newest wins across devices.
  - Owner-only: `owners/{uid}` and `books/{book}/**`, readable only if an `owners/{uid}` doc exists.
  - The rest is per-user progress.

## Books
| id | book | lessons |
|---|---|---|
| `kouyu-rumen` | 汉语口语速成 · 入门篇 (Short-term Spoken Chinese · Threshold, vol. 1) | 15 |
| `hsk1` | HSK 标准教程 1 (textbook + workbook) | 15 |
| `hsk2` | HSK 标准教程 2 (textbook + workbook) | 15 |
| `ledu` | 乐读 1 (LEDU Writing: strokes, radicals and how characters are built) | 10 |

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
   Then add look-alikes and radicals, and apply `<book>-chars.txt` with `scripts/tools/apply-chars.mjs`.
3. `npm run gen:data` must report all stroke counts OK. Then run `npm run check`.
4. `npm run gen:font` (subset font) and `npm run gen:audio` (edge-tts, needs the proxy).
5. Private content: `npm run gen:private-audio`, then `npm run upload:private`.
6. Book page images (for the Shelf on every device): `python scripts/tools/render-book-pages.py "$HOME/Documents/Books/app/pages" 1600 [ids]` (WebP, each under 900 KB, never in the repo), then `npm run upload:pages [-- ids] [--dry]` (needs the proxy). Safe to re-run: it writes only missing or changed pages. Raise `img.v` in `book-pdfs.json` to replace images. Blurred previews for instant display: `python scripts/tools/render-book-pages.py --thumbs "$HOME/Documents/Books/app/pages" [300] [ids]` (shrinks the pages already rendered, about 7 KB each), then `npm run upload:pages -- --thumbs [ids] [--dry]` bundles 40 pages per doc into `books/<book>/thumbs/<id>-<k>` (`from`, `imgs`, `w`, `h`, `v`, `sig`; `img.thumbs` in `book-pdfs.json`).

## Tools for common jobs
- **Tests:** papers are built from lesson content. `src/data/exam-exclude.json` and `exam-fill.json` are generated from `docs/test-audit/` by `scripts/tools/gen-exam-exclude.mjs` and `gen-exam-fill.mjs`.
  - Run `scripts/tools/apply-test-fixes.mjs` after any re-import of a book.
  - `node scripts/tools/exam-sample.mjs <book> <test> <seed>` prints a paper.
- **New PDFs (scanned books):** scans have no text layer, so render the pages to images and read them.
  - Command: `python scripts/tools/pdf-pages.py <scratch-dir> 1100 "<pdf>"...` (needs PyMuPDF).
  - Read a few pages at a time; images are the most expensive input.
  - First page: find the lesson number and title. Then write the public, grammar and workbook sources and the private JSON (see Books).
- **Sounds (recordings):**
  - `npm run gen:audio` records every word, sentence and reading with edge-tts (voice `zh-CN-XiaoxiaoNeural`) into `public/audio/<hash>.mp3`. Only missing files are recorded.
  - Run it with `HTTPS_PROXY=http://127.0.0.1:7897`. Private book lines use `npm run gen:private-audio`.
  - In the app, `src/lib/speech.js` plays the recording and falls back to the device's TTS (`speechSynthesis`).
  - `npm test` checks that audio covers all the data.
- **Microphone (speaking practice):** `speak()` in `src/views/practice.js`.
  - It uses the Web Speech `SpeechRecognition` when available (Chrome, Edge, Android).
  - Otherwise (iPhone PWA) it records with the mic so you can listen back and compare.
  - The mic needs HTTPS or localhost.
- **Writing (stroke order):**
  - `src/lib/draw.js` wraps `hanzi-writer`; stroke data comes from the `hanzi-writer-data` package.
  - Stroke names: `scripts/stroke-types.mjs` guesses them, and `node scripts/tools/stroke-eval.mjs` measures its accuracy against the hand-checked names (currently 88%).
  - Character meanings, tips and stroke-name fixes: `node scripts/tools/apply-chars.mjs data-src/<book>-chars.txt`.
- **Debugging:** all checks run in headless Edge over CDP, with no installs needed.
  - `node scripts/tools/sweep.mjs <url> <book> <lessons>`: opens every lesson tab and every mode, and reports JS errors and empty screens.
  - `node scripts/tools/debug.mjs <url> <outdir>`: checks every page at iPhone 16, Mi Pad (portrait and landscape) and Windows sizes for errors, sideways overflow and tap targets under 44px.
  - `node --use-env-proxy scripts/tools/livecheck.mjs "<text>"`: checks whether the live site already has a change.
  - URL is `http://localhost:5173/xiezi/` for dev, or the live URL.
  - "Bug still there on my phone" is usually the old PWA cache: check with livecheck, then reopen the app twice.

## Build, test, ship
- `npm run dev` (or preview_start `xiezi-dev`), `npm test` (vitest), `npm run build`.
- Live checks after deploy: `npm run test:edge` and `node scripts/e2e/screens.mjs <url> <outdir>`.
  Sync check: `npm run emulators`, then `npm run test:sync`.
- The hidden browser pane pauses requestAnimationFrame, so test animations in headless Edge (scripts/e2e).
- PWA cache: an old install can show old bugs until it updates. Audio is cached at runtime (`xz-audio`), not precached.
