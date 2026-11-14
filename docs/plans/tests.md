# Plan: Tests (小测 · 期中 · 期末)

Status: built. Teachers' rounds 1–3 done; packages W1–W5 built, reviewed and checked by the lead. See "Where it stands" at the end.

## Goal
Every book gets real tests in the place they belong between its lessons: small tests every three lessons,
a mid-book test at the end of each half, one final test at the end. A test must feel like sitting an exam, not like
a worksheet: long, timed, no help, nothing marked until you hand in, a score report and a seal at the end.

Design rules still hold: minimalist and elegant, all four themes, no streaks, goals or reminders.
Tests are always open and never locked.

## The tests

Every test has five parts, in this order.

| Test | 听力 Listening | 词汇 Vocabulary | 语法 Grammar | 阅读 Reading | 书写 Writing | Total | Time allowed |
|---|---|---|---|---|---|---|---|
| 小测 Small test | 12 | 10 | 8 | 12 | 8 | 50 | 30 min |
| 期中 Mid-book test (1 and 2) | 25 | 20 | 15 | 25 | 15 | 100 | 60 min |
| 期末 Final test (15-lesson books) | 45 | 35 | 30 | 45 | 25 | 180 | 105 min |
| 期末 Final test (乐读, 10 lessons) | 38 | 30 | 25 | 37 | 20 | 150 | 90 min |

Where they sit:

A book is two halves. Each half ends with its own mid-book test; the final covers the whole book.

| Book | Small tests after lesson | They cover | 期中 1 after | 期中 2 after | Final after |
|---|---|---|---|---|---|
| 口语入门, HSK 1, HSK 2 (15) | 3, 6, 11, 14 | 1–3, 4–6, 9–11, 12–14 | 8 (covers 1–8) | 15 (covers 9–15) | 15 (whole book) |
| 乐读 (10) | 3, 8 | 1–3, 6–8 | 5 (covers 1–5) | 10 (covers 6–10) | 10 (whole book) |

So a 15-lesson book has 7 tests (4 small, 2 mid, 1 final) and 乐读 has 5. After the last lesson the book page
shows 期中 2 and then 期末.

Rule for any book with `n` lessons: 期中 1 after `h = ceil(n/2)`, 期中 2 after `n`; small tests after 3, 6, …
while below `h − 1`, then after `h+3`, `h+6`, … while below `n`. From the second small test on, one question
in five comes from earlier lessons of the book. Each mid-book test asks only about its own half.

Scoring is in the HSK style: each of the five parts is scaled to 100, the total is out of 500, the pass line is 300 (60%).
Seals: 合格 from 60%, 良好 from 80%, 优秀 from 90%, 满分 at 100%. An unanswered question is wrong.

### What each part asks
All questions come from content the app already has, **public content only** (never `data-src/private/`).

| Part | Kind | Source | Small | Mid | Final 180 | Final 150 |
|---|---|---|---|---|---|---|
| 听力 | 听词 hear a word, pick it or its meaning | lesson words | 3 | 5 | 10 | 8 |
| 听力 | 听句子 hear a sentence, pick its meaning | example sentences + `sentence-en.gen.json` | 3 | 8 | 12 | 10 |
| 听力 | 对话 hear a dialogue, answer the question | workbook `dialogs` | 6 | 12 | 23 | 20 |
| 词汇 | 词义 see a word, pick its meaning | lesson words | 4 | 7 | 12 | 10 |
| 词汇 | 选词 see a meaning, pick the word | lesson words | 3 | 6 | 11 | 10 |
| 词汇 | 选词填空 fill in the word | lesson words + examples | 3 | 7 | 12 | 10 |
| 语法 | 语法 grammar blank | grammar drills | 8 | 15 | 30 | 25 |
| 阅读 | 判断 true or false | workbook `judge` | 4 | 9 | 15 | 13 |
| 阅读 | 回答 pick the reply | workbook `replies` | 4 | 8 | 15 | 12 |
| 阅读 | 短文 text and question | readings' questions | 4 | 8 | 15 | 12 |
| 书写 | 连词成句 build the sentence | buildable sentences | 4 | 7 | 12 | 10 |
| 书写 | 写汉字 write the word by hand from pinyin and meaning | lesson words | 4 | 8 | 13 | 10 |

Every book has enough of every kind for these counts; the tightest are grammar in 口语入门 lessons 1–3
(10 drills for 8 questions) and words in HSK 1 lessons 1–3 (19 words). If a kind still runs short, the other
kinds of the same part fill the gap. A source item appears once in a part; a word may come back in another
part (heard in 听力, its meaning in 词汇, written in 书写). Questions are spread evenly over the lessons covered.

### Exam rules
- **Cover page (试卷):** book, test name, parts, question counts, time, rules, a large seal. Begin starts the clock with a bell.
- **Part cards:** 一、听力 / 二、词汇 / 三、语法 / 四、阅读 / 五、书写, each a full page with a spoken instruction. The clock stops on a part card (the only allowed break).
- **Listening:** each recording plays twice by itself. No replay, no going back.
- **The other four parts:** free movement inside the part. Skip, mark, come back. A finished part cannot be reopened.
- **Answer sheet (答题卡):** opened from the head ("12 / 40"); bubbles fill in ink; marked questions show a dot. On PC it stays in view at the side.
- **No help:** no 拼, no 英, no right or wrong until hand-in. One exception, as on the real HSK 1–2 papers: characters the
  book has not taught yet by that test (no word up to its last lesson has them) carry small pinyin, so a question is never
  unreadable. Taught characters carry none. The builder marks them (`newChars`); HSK 2 counts HSK 1's words as taught.
- **Hand in (交卷):** confirm step with the count of unanswered questions. When time runs out the test hands itself in.
- **Leaving:** the run is saved on the device (paper seed, answers, place, time left). The clock stops while the app is hidden or closed. One run at a time; opening another test asks "continue or give up".
- **PC keys:** `1`–`9` pick a choice, `Enter` next, through `screen.onKey`.

### After handing in
- Score counts up, then the seal stamps down with a thud (plain fade when reduced motion is on).
- **Score report (成绩单):** book, test, date, time taken, the five part scores, total, seal. Printable; "save as picture".
- Passing a final gives the **book certificate (结业证书)**, the same page with a different title.
- **Mistakes:** every wrong or unanswered question with the right answer; "Retry missed" does not change the score.
- **Weak lessons:** the lessons that lost the most points, each a link to the lesson.
- Every *answered* question is recorded with the key its own exercise already uses (`l:`, `ls:`, `wb:`, `q:`, `wf:`, `g:`, `rq:`, `o:`, `d:`), quietly (`{ quiet: true }`). So test answers count for Review and for lesson %, as the practice test's answers do today. No new item keys; `tests/lesson-keys.test.js` must stay unchanged.
- Best result and last result per test are kept and synced. A quiet 新纪录 shows when the best is beaten.

### Where it shows
- Book page (`showBook` in `src/main.js`): a test row between the lessons at its place. Seal (faint outline until passed, red after), name, "Lessons 1–3 · 50 questions · 30 min", best score.
- Address `#/test/<book>/<id>` (`s1`…`s4`, `mid1`, `mid2`, `final`), report at `#/test/<book>/<id>/report`. Back returns to the book.
- A book's Review: the "Practice test" panel becomes a link to that book's Final test. The all-books Review keeps its practice test.
- No new sidebar entry.

## Known limit
Tests reuse questions the owner may already have met in practice, so a test also checks memory of the
exercises. New, unseen test-only questions are possible later (see Later); they are not in this plan.
The real HSK 1–2 picture questions cannot be copied: the app has no pictures for them.

## Design for the code
Words: the screen says **Test**; code says `exam`, so nothing is confused with the unit tests in `tests/`.

- `src/exam/plan.js` (pure): `testsOf(book)` gives each test's id, kind, place, lessons covered, counts per kind, minutes. Sizes come from one table.
- `src/exam/build.js` (pure): `buildPaper(test, book, seed, exclude)` turns source items into **neutral questions**. Three shapes only:
  `choice` (prompt: text and/or audio, options, answer), `order` (tiles, answer), `write` (word, pinyin, meaning).
  Same seed gives the same paper, so a saved run rebuilds exactly. Distractors are made here, following what each existing exercise does today
  (`workbookOf` and `grammarOf` in `src/data/index.js`, `exerciseItems` in `src/progress/lesson-exercises.js`, `fillQuiz`, `listenQuiz`, `vocabQuiz`).
  Each question carries its source id, lesson and the progress key to record.
- `src/exam/grade.js` (pure): `grade(paper, answers)` gives right and total per part, scaled scores, total, seal, missed questions, weak lessons.
- `src/exam/run.js` (pure state): the run: place, answers, marks, clock, which moves are allowed (listening is one-way), save and restore (`xz-exam-run`).
- `src/exam/store.js`: results, localStorage `xz-tests-v1`. Kept per device, like progress items: `mine` (saved on this device) and `others` (from the cloud);
  a record is `{ best, last, tries }`, each result `{ total, parts: [listen, vocab, grammar, read, write], at, secs }`, `tries` the attempts' timestamps.
  The app sees the merge: best = higher total, last = newer, n = the number of distinct attempts (a set cannot count one twice).
  Synced to `users/{uid}/tests/{docId}` as `{ k, d: { [deviceId]: record } }`: a device writes only its own entry, and nothing is sent before the first server copy has arrived.
  (Progress sessions cannot hold this: they are capped by `MAX_SESSIONS`.)
  `firestore.rules` already lets a user read and write everything under `users/{uid}/`, so no rules change and no deploy.
- `src/views/exam.js` + `src/styles/exam.css`: cover, part cards, the three question widgets, answer sheet, clock, hand-in, result, report.
  The existing quizzes mark each answer at once, so the test draws its own widgets and does not use `runRound`. Handwriting uses `src/lib/draw.js`; a word is right by the same rule Dictation uses.
- `src/lib/sfx.js`: a bell and a stamp, made with Web Audio like the rest.
- `src/data/exam-lines.json`: the spoken part instructions (own text), added to what `gen:audio` and `tests/audio.test.js` cover.
- `src/data/exam-exclude.json`: per book, what the teachers ruled out for one kind of question (`fill:<word>`, `order:<sentence>`, `sentence:<sentence>`) and pairs of words that must never be options together. Made by `scripts/tools/gen-exam-exclude.mjs` from `docs/test-audit/`.
- `scripts/tools/apply-test-fixes.mjs`: applies the teachers' accepted question fixes to the lesson files. The book sources in `data-src/` do not carry them, so run it after any re-import of a book.
- `scripts/tools/exam-sample.mjs <book> <test> <seed>`: prints a paper as plain text for proof-reading.
- Docs: `GLOSSARY.md` (Test, Small / Mid-book / Final test, Paper, Test part: not a lesson Part, Run, Score report), `CLAUDE.md`, `src/progress/keys.js` untouched.

## The team

| Role | Model | How many | Job |
|---|---|---|---|
| Lead | Fable (this session) | 1 | Writes every brief, decides every teacher finding, checks every package after its manager, runs the full checks, reports to the owner |
| Teachers | Opus | 4, one per book | Check questions. Read-only; never open `data-src/private/` |
| Workers | Sonnet | 1 per package | Write the code and its unit tests |
| Project managers | Opus | 2: A logic and data, B screens | Review each worker's package against this plan; pass, or a fix list back to the same worker |

Each agent's brief is its section of this file plus the list of files it may read. Token budget is tight:
no agent reads outside its list, renders many images, or re-runs full sweeps.
Workers share this worktree; two workers run together only when their files do not overlap.
A package goes worker → manager (at most two fix rounds, then to the lead) → lead → commit.

### Teachers: what they check
**Round 1, the pool** (while W1 and W2 are built). For the kinds the tests use (dialogues, true or false,
replies, grammar drills, text questions, word meanings, example sentences and their English):
1. Exactly one right answer; no wrong option that is also right.
2. Natural, correct Chinese; pinyin matches.
3. Answerable from what is on the page or heard.
4. Only words taught up to that lesson.
5. Fair with pinyin and English off.
6. No giveaway (the longest option, the only option with the lesson's word).

Output: `docs/test-audit/<book>.json`, flagged items only: `{ id, kind, verdict: "fix" | "exclude" | "near", reason, fix, with }`. The lead's decisions are in `docs/test-audit/decisions.json`.
Fixes may touch workbook options, claims, grammar options and text questions. **Words, examples and readings are never changed**
(progress keys depend on them); a flagged one is excluded from tests instead. The lead decides each finding,
applies the fixes to the lesson files and generates `exam-exclude.json`. A changed question also needs its answer explanation rewritten (`src/data/explain/`).

Result of round 1: 72 questions fixed (68 as the teachers wrote them, 4 rewritten by the lead), about 700 exclusions, 86 word pairs.
Nearly all exclusions are example sentences that several words fit in "fill in the word", or that have two right word orders in "build the sentence".

**Round 2, the papers** (after W1). Each teacher sits two sample papers per size for their book, printed by
`exam-sample.mjs` with fixed seeds, as a student would: wrong options made by the builder that are too close
(你 / 您), repeats, one question giving away another, balance over lessons, a part that is too easy or too hard.
Output: findings for the builder's rules, or more excludes.

### Worker packages

| # | Package | Files | Needs | Manager |
|---|---|---|---|---|
| W1 | Plan, builder, grading, sample tool, unit tests (every book: right counts, no empty kind, no repeats, same seed same paper, fill rule) | `src/exam/{plan,build,grade}.js`, `tests/exam-*.test.js`, `scripts/tools/exam-sample.mjs` | none | A |
| W2 | Results store, sync, rules, emulator check | `src/exam/store.js`, `src/sync/sync.js`, `firestore.rules`, `tests/exam-store.test.js`, `scripts/e2e/sync.mjs` | none | A |
| W3 | Run state and the test screen up to hand-in: route, cover, part cards, widgets, listening rules, clock, answer sheet, save and resume | `src/exam/run.js`, `src/views/exam.js`, `src/styles/exam.css`, `src/main.js`, `index.html`, `src/data/exam-lines.json`, `tests/exam-run.test.js` | W1 | B |
| W4 | Result: stamp, sounds, mistakes, retry, weak lessons, recording answers, score report, certificate, print and picture | `src/views/exam.js`, `src/views/exam-report.js`, `src/styles/exam.css`, `src/lib/sfx.js` | W2, W3 | B |
| W5 | Book page rows and seals, Review's practice test link, PC layout and keys, `sweep.mjs` and `debug.mjs` know the new pages, glossary and notes | `src/main.js`, `src/views/bookreview.js`, `src/styles/desktop.css`, `scripts/tools/*`, `GLOSSARY.md`, `CLAUDE.md` | W3 | B |

### Managers: what "pass" means
- The package does what its row and this plan say; nothing extra.
- `npm test` passes; the lesson-keys snapshot is unchanged.
- No book text in the repo; no owner email; no existing words, examples or readings changed.
- Screens: all four themes, iPhone 16 / Mi Pad / Windows sizes, tap targets 44px or more, no sideways scroll, reduced motion respected, glossary words used.

## Order of work
1. **Owner approves this file.**
2. Teachers round 1, W1 and W2 run together. Manager A reviews W1 and W2. Lead checks, decides the findings, applies fixes.
3. Teachers round 2 on sample papers. Builder fixes (W1's worker).
4. W3. Manager B. Lead checks.
5. W4 and W5 together. Manager B. Lead checks.
6. Lead, whole thing: `npm test`, `npm run check`, `npm run build`, `gen:audio` (proxy), `sweep.mjs`, `debug.mjs`, sync emulator check,
   stamp and paper animations in headless Edge, one small test sat from cover to report.
7. Report to the owner, with what was and was not checked. A pull request to `main` only on the owner's word. New Firestore rules need a deploy.

## Risks
- **iPhone audio:** recordings that start by themselves need a tap first. Begin and Next are those taps; this must be tried on the real iPhone PWA.
- **Length on a phone:** the final is 105 minutes. Saving the run and the break on part cards are what make it bearable.
- **Thin pools:** HSK 1 lessons 1–3 have 19 words, so small test 1 uses nearly all of them; retakes will repeat.
- **Cost:** about 8 teacher runs, 5 worker runs plus fix rounds, 5 manager reviews. This is a large run for a tight token budget.

## Later (not in this plan)
- New test-only questions, written in the books' style and never shown in practice, so tests have unseen questions.
- A 部首 part for 乐读 tests.
- A paper version of a whole test through the print page.

## Where it stands
- Round 1 (the pool): 72 questions fixed in the lesson files, about 700 exclusions, 86 word pairs.
- Round 2 (twelve sample papers): about a quarter of the questions were flagged, mostly repeats and leaks between questions.
  From it: one leak index per paper, each word tested once, teacher-written wrong options for fill-in
  (`src/data/exam-fill.json`, from `docs/test-audit/fill-<book>.json`), build-the-sentence only from single-clause sentences,
  pinyin on every option when one option has an untaught character, a man's voice for the man's dialogue lines.
- Round 3 (eight new papers, 890 questions): 75 flagged, about one in twelve (round 2: one in four).
  What is left is mostly repeats in 小测 1 of HSK 1 and 口语入门, where three beginner lessons do not hold 50 different questions
  (the builder relaxes its no-repeat rules there and says so: `paper.relaxed`), two-right replies, and a few source questions
  listed in `docs/test-audit/round3-<book>.json`.
- The order of building is grammar, listen, vocab, read, write (grammar has no other kind to fall back on); the paper keeps the usual order.
- Not done: new test-only questions, a 部首 part for 乐读, a paper version of a whole test (see Later).
