---
name: add-book
description: Add a whole new textbook (scanned PDFs) to xiezi, from extraction to the Shelf, with 3 Sonnet agents, 1 Opus check and the main session as lead. Use when the owner says they added a new book.
---

# Add a new book

The owner gives you the scans (one PDF per lesson, or one big PDF), the book name and, if they know it, the lesson range.
You are the **lead** (main session). The owner may be asleep: decide everything yourself, commit, open the PR, merge after CI and upload.
Never type a password or create an account. Never write the owner's email in a file.
Read `CLAUDE.md` first (the rules, the pipeline and the commands).

## 0. Plan (lead, before any agent starts)
1. Find the facts cheaply. Render **only the first page of each PDF** at 600 px to learn each lesson's number and title. Also check: is this a later volume of a book already in `src/data/books/`? Is there a workbook? Is it a writing book like `ledu`?
2. Pick:
   - **Book id:** `<name>-<n>` for a later volume, for example `kouyu-rumen-2`.
   - **Lessons:** numbered as printed. A book may start above lesson 1.
   - **Color and `order`:** check how `order` is used, and raise the following books' orders by one.
3. Write `data-src/<id>-plan.md` (gitignored). Copy `data-src/kouyu2-plan.md` and change:
   - the paths, the book id and the lesson range;
   - the agent split, about 60 pages per agent;
   - the size guide, taken from the nearest existing book.
   Keep every hard rule from it.
4. Create `data-src/<id>-parts/STATUS.md`. Log one line per finished step there, with the time and `get_usage`.
5. Before leaving a long job: call `request_keep_awake` (until session_idle), and set a CronCreate resume timer for just after the limit resets (+5 min).
6. Tell the owner the cost up front:
   - extraction is about 30–60% of one 5-hour limit;
   - the Opus check is about 15%;
   - integration and tests are about 15%.

## 1. Phase A: extraction (3 Sonnet agents, in parallel, background)
- Each agent gets the plan file path plus its lessons. That is the whole brief; the plan holds everything else.
- **Claim files:** an agent writes `NN-claim.txt` before starting a lesson and skips lessons claimed by another agent.
- **Resume rule:** skip lessons that have `NN-report.md`, and redo a lesson that has files but no report.
- **Token rules:**
  - render each page once at 1100 px and look at it once;
  - exercise pages get one glance;
  - finish and validate one lesson before starting the next.
- **Per lesson, the agent writes** `NN-public.txt`, `NN-grammar.txt`, `NN-workbook.txt`, `NN-chars.txt`, `NN-private.json`, `NN-report.md`, and `NN-extra.json` if the lesson has one. The report gives the PDF page of the lesson's first page and its printed page number, for the Shelf.
- **Pinyin:** the agents write tone sandhi as the existing data does.
- **Words shared with an earlier volume:** keep that volume's pinyin and English. If the sense differs, add "(also: …)".
- **If an agent looks dead:** check whether its files are still changing before you relaunch it. Agents paused by PC sleep come back, so don't relaunch blindly.

## 2. Phase B: check (1 Opus agent, text only)
Run it after all reports exist. Open a page image only to settle one doubt. For every lesson:
1. Every question has exactly one right answer, listed first. Wrong options are really wrong, and no option gives the answer away.
2. **Workbook D questions match their dialogue:** who says what, and 他/她/男的/女的 point to the right speaker. Vol. 2 shipped 11 that didn't.
3. Pinyin, tones and sandhi are right; the English is natural and the Chinese examples are natural.
4. **Copyright:** compare public against private, line by line. Nothing printed is reused or closely translated.
5. Words: no duplicates inside a lesson, and shared words match the earlier volume.
6. Fix small things in the parts directly. Write `review.md` with a verdict per lesson.

## 3. Phase C: integration (the lead does it, or 1 Sonnet agent that logs `C<n> done` in STATUS)
Follow plan steps 1–11:
- `book.json`.
- For a later volume, `PRIOR` in `src/exam/plan.js`.
- Concatenate the parts into `data-src/<id>-*.txt` and the private JSON.
- Snapshot `chars.json`, then run `import-book.mjs`.
- Run `apply-chars.mjs`, check stroke names by hand, and confirm no existing entry changed.
- Add to `similar.json`, `radicals.json` and `glossary.json`, adding keys only.
- Then run:
  - `npm run gen:data` (all stroke counts OK);
  - `node scripts/gen-sentence-en.mjs --todo 50` (translate new sentences into a new `data/sentence-en/part-N.json`).
- **Answer explanations, the step the first plan forgot:**
  1. `node scripts/explain.mjs skeleton`.
  2. Write `why`/`not` for every new question in `src/data/explain/<id>-{grammar,comprehension}.json`, using Sonnet agents in batches of about 100.
  3. `node scripts/explain.mjs build`.
  `tests/explain.test.js` must stay as it is; never weaken it.
- **Tests:**
  - `exam-exclude.json` and `exam-fill.json` get empty entries for the new book.
  - `exam-sample.mjs <id> s1|mid1|final 1` builds papers with no empty parts.
  - `apply-test-fixes.mjs` already crashed on old audit files before Vol. 2; note it and skip it.
- **Recordings and font**, with the proxy and in the background: `gen:font`, `gen:audio`, `gen:private-audio`. Then look at `git status` for deleted `public/audio` files and explain each one.
- **Checks:**
  - `npm test` passes fully, and `npm run build` succeeds;
  - `node scripts/tools/sweep.mjs http://localhost:5173/xiezi/ <id> <first>-<last>` finds no errors;
  - `git diff --stat` shows no change in the other books' lessons.

## 4. Phase D: ship (lead)
1. Commit with the noreply author and the Co-Authored-By line, push a `claude/<id>` branch, open a PR, merge after CI passes, and confirm the deploy with `livecheck.mjs "<a new lesson title>"`.
2. Run `npm run upload:private`. If it says "Found 2 accounts", run it again with `--email` set to the owner's address from your context. Type it in the command only, never in a file.

## 5. Shelf (lead, same day)
1. Merge the scans into one PDF in `~/Documents/Books/`.
2. Clean it with `python ~/Documents/Books/tools/clean_scans3.py`.
3. **Check contact sheets of every page.** Fix sideways photos with `--fix "N:cw|ccw"`, and two-page photos with `N:crop=x0-x1`.
4. Copy the small output to `~/Documents/Books/app/<shelf-id>.pdf`.
5. Add an entry to `src/data/book-pdfs.json`:
   - lessons → PDF page, taken from the reports;
   - `printed` anchors;
   - a `note` naming missing pages;
   - `img {v:1, w:1600, thumbs {v:1, per:40}}`.
   Keep the existing entries' formatting.
6. Add the id to `ALL` in `scripts/tools/render-book-pages.py`.
7. Render the pages, then run `npm run upload:pages -- <shelf-id>`. Do the same with `--thumbs`.
8. A `--dry` run must report 0 to write.
9. Commit, PR, merge, livecheck.

## Finish
- Update STATUS.md.
- Tell the owner, in a few lines:
  - the counts (words, readings, questions, new characters);
  - what was fixed;
  - what is left;
  - to reopen the app twice so the PWA updates.
