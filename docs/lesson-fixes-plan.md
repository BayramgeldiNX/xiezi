# Lesson fixes plan: getting stuck, and a Pinyin on/off switch

Owner's report (2026-11-05): "I tried doing the lessons but it has a lot of problems. It gets stuck in the
Words section, the Exercises section and the Reading section. In the test there is no pinyin show/hide,
so it is hard to learn."

The owner uses an iPhone 16 home-screen PWA, a Mi Pad 7 Pro and Windows, from China over a VPN.
Read `CLAUDE.md` first (copyright, commit identity, tight token budget, Ink theme, no streaks).

This plan comes from reading the code, not from a live repro. **Step 0 is to confirm each problem in
headless Edge before fixing it.** If a problem does not reproduce, say so in the final report instead of
"fixing" it blindly.

---

## Step 0: reproduce

- `npm run dev`, then `node scripts/tools/sweep.mjs http://localhost:5173/xiezi/ hsk1 1-3`, and the same for
  `kouyu-rumen` and `ledu`. Note any JS errors or empty screens on the Words, Exercises and Read tabs.
- At iPhone size (393×852), by hand in headless Edge (see `scripts/e2e/`): open a lesson, then
  Words → Flashcards / Match / Word quiz; Exercises → every card; Read → Read texts, Read & answer, Build the
  sentence; Review → Practice test. Answer a question and check that **Next is visible without scrolling**.
- Signed-out and "Firebase unreachable" (block `*.googleapis.com` over CDP, `Network.setBlockedURLs`) for Read → Read texts.

---

## Problems found and fixes

### A. Reading: "Read texts" can hang on "Loading the book…" forever
**Where:** `withBook()` in `src/views/practice.js:203`, `lessonContent()` in `src/sync/content.js`,
`bookContent()` in `src/sync/sync.js:166`.
**Why:** when the owner is signed in, the Read texts screen waits for Firestore before showing *anything*,
including the app's own practice texts. There is no timeout. From China, when the VPN is slow or off, the
Firebase SDK load or `getDoc` can hang for a very long time, so the screen sits on "Loading the book…".
The same wait sits under Grammar ("Loading the book's notes…"), but that one does not block the questions.
**Fix:**
1. Show the practice texts (`readings`) at once. Add the book's texts to the list when they arrive.
2. Wrap `lessonContent()` in a timeout (about 8 s) with `Promise.race`. On timeout show the existing
   "Couldn't load the book's texts. Check your internet or VPN." note with a **Try again** button.
   Don't put the timed-out result in the cache (`content.js` already drops non-"ok" results).

### B. Reading: "Listen to all" can freeze on one line
**Where:** `say()` and `tts()` in `src/lib/speech.js:54-92`; the loop in `reader()` in `src/views/reading.js:113`.
**Why:** `say()` returns a promise that only resolves on `ended` / `error` / TTS `onend`. If an mp3 stalls
(network, PWA cache) without an error, or iOS `speechSynthesis` never fires `onend` (a known iOS bug), or
`stopSpeech()` replaces the source before `ended`, the promise never settles. The reader then waits forever
with one line highlighted and the Stop button showing.
**Fix:** in `say()` and `tts()`, resolve after a safety timeout (for example `2.5 s + 0.35 s per character`,
doubled when slow) and resolve `false` when `stopSpeech()` / a newer `say()` takes over (keep the resolver
and call it from `stopSpeech`). Callers keep their own `token` checks.

### C. After answering, Next can be off screen (feels stuck on phones)
**Where:** `choiceQuiz()` in `src/views/practice.js:262`, also `orderGame()` in `reading.js` and `speak()`.
**Why:** after a tap, the answer box and the Next button appear under the choices.
`$("#qNext").focus({ preventScroll: true })` keeps the page still, so on an iPhone the Next button is often
below the fold. Nothing seems to happen after answering. This hits every quiz: Words, Exercises, Read & answer and the Test.
**Fix:** after answering, scroll the Next button into view
(`scrollIntoView({ block: "nearest", behavior: "smooth" })`), or better, put the controls row in a sticky
bottom bar inside the quiz panel (`position: sticky; bottom: 0` with safe-area padding, matching the Ink theme).
Do the same in `orderGame()` and `speak()`.

### D. No way out of a question you can't answer
**Where:** `choiceQuiz()`.
**Why:** Next only appears after a choice is tapped. On a dialogue question (Exercises → Dialogues, Test
part 1), if the sound didn't play (iOS blocks autoplay on the first sound, or the voice is missing), the
learner can't answer honestly and the text isn't shown until after answering.
**Fix:** add a quiet **"不知道 · Don't know"** ghost button next to Back. It counts as missed, reveals the
answer and shows Next. For dialogue items also add **"Show the text"** (a `<details>`, like the Read & answer
peek). Opening it before answering is allowed, and it shows the lines (with pinyin, see E).

### E. No pinyin on/off in quizzes and the test (the main request)
**Where:** every `choiceQuiz` user: `practice.js` (grammar, sentences), `workbook.js` (dialog / judge /
reply / fill), `reading.js` (`textQuiz`, `orderGame`), `bookreview.js` (Review and the Practice test).
Only the text reader has a Pinyin / English toggle today (`reading.js:73`, pref `xz-reader`).
**Why:** questions show Chinese only. Workbook and grammar items have **no pinyin in the data**
(e.g. `{"text":"我家有四口人…","claim":"他有两个女儿。","ok":false}`), so learners can't read them.
**Fix:**
1. Add `sentencePy(hz)` to `src/lib/pinyin.js` (or a new `src/lib/sentence-py.js`). Segment with
   `makeSegmenter(DICT)` (as `reading.js` does), use the word's `py` from `DICT` (right for most
   polyphones, like 了 / 得 / 都), fall back to `CHARINFO[c].py` per character, and keep punctuation. Pass the result through `tonePy`.
   Add a vitest for a few sentences from the data, including 不 and 一.
2. One shared setting, `pinyin` (`"show" | "hide"`), in `src/lib/settings.js` `DEFAULTS`. Default is `"show"`
   (the owner is a learner). Reuse it for the reader instead of `xz-reader.py`, migrating the old value once.
3. A small **拼 Pinyin** toggle (the same `.seg` style as the reader) in the header row of `choiceQuiz`,
   `orderGame`, `speak` and the Review / Test screens. Toggling flips a `hide-py` class on the panel at once,
   with no re-render, so it works mid-question. Remember it.
4. Show pinyin under every Chinese prompt and choice. Use the data's `py` when it exists (words, `ex.py`,
   reading lines) and `sentencePy` otherwise (workbook, grammar `q`, Read & answer options). Use a `.q-py` line
   under each prompt and a small `.c-py` line inside each choice button, both hidden by `.hide-py`.
   - **Don't** show pinyin where the pinyin *is* the answer: `read-pinyin` (How do you read it?), Dictation from
     pinyin, Tones. There, keep the toggle hidden.
   - In Build the sentence, show pinyin on the chips only when the toggle is on.
5. The English line (`d.en` in grammar, `w.ex.en` in fill) can use the same switch idea later. Not needed now.

### F. Words: Flashcards feel endless
**Where:** `src/views/cards.js`.
**Why:** the deck is *every* word in the lesson (often 30 to 50), and "Again" pushes the card back, so the
deck only ends when every card is "Got it". There is no finish button, only Back, which drops the session
without saving it.
**Fix:** deal rounds of **12 cards** (the rest wait for the next round), and add a **Finish** link that saves
the session so far and shows the results. Show "Round 1 of 4 · 7 left".
Also `cardsKey()` (`cards.js:77`) acts whenever the Words tab is open, even when the cards screen isn't, and
`main.js:359` then calls `preventDefault`, which swallows space and Enter on other Words screens. Return
`false` unless `#fcCard` is on screen.

### G. Words: Match pairs can't be finished
**Where:** `matchGame()` in `practice.js:334`.
**Why:** two words in one round can share the same English (for example `ledu/lesson08` has two
"happy"). The tiles look the same, but only the "right" one matches, so the learner is stuck guessing.
**Fix:** when choosing the 6 words, skip a word whose `en` (or `w`) is already in the set.

### H. No "what's next" after an exercise
**Where:** `showResults()` in `practice.js:321`, the cards end screen, and the `orderGame` end screen.
**Why:** the results screen offers Again / Retry missed / Back. After Back, the learner lands on the mode
grid and has to choose again. Several screens in a row with no clear path read as "stuck".
**Fix:** add a primary **"Next: <next mode name>"** button that opens the next available mode of the same
tab (`SKILLS[P.skill].modes` filtered by `modeAvailable`). On the tab's last mode, go to the next tab
(词 → 练 → 读 …) through `showTab`. Keep it calm: one button, no streaks or praise screens.

---

## Order of work
1. Step 0 (reproduce). Write down what you saw.
2. C, D (quiz flow), then A, B (reading hangs), then F, G (words), then E (pinyin), then H.
3. One commit per letter. Use the noreply author and the `Co-Authored-By` line from `CLAUDE.md`.

## Done means
- `npm test` and `npm run check` pass. The new `sentencePy` test passes.
- The sweep (Step 0 commands) shows no errors on any tab for hsk1, kouyu-rumen and ledu.
- `node scripts/tools/debug.mjs http://localhost:5173/xiezi/ <scratch>` shows no new overflow or small tap targets.
- At iPhone size: every quiz's Next is visible after answering. Read texts shows practice texts at once with
  Firebase blocked. The Pinyin toggle works mid-question in Exercises and in Review → Practice test, and it is remembered.
- Don't change lesson words, examples or readings (progress keys depend on them).
- Don't push or deploy. Report back with what reproduced, what changed and anything left.
