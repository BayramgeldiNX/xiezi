# Plan 2: debugging on real devices, then new features

Part 1 (built 2026-10-22, overnight): the app at https://bayramgeldinx.github.io/xiezi/ with Lesson 1,
offline support, progress tracking, Review tab, backup file, add-lesson tool, 21 unit tests and auto-publish.
Sync code is written but waits for the Firebase project (your steps below).

---

## Part A: debugging (do first)

### A1. Your morning steps (≈10 minutes)
- [x] **Firebase project:** `learn-chinese-a5c0d` (Firestore region `nam5`, USA; fine for one learner).
- [x] **Email sign-in** enabled.
- [x] `npm run setup:firebase -- learn-chinese-a5c0d` run, rules uploaded (outsiders get 403), published 2026-10-22.
- [ ] **Install** the app: iPhone (Safari → Share → Add to Home Screen), Mi Pad (Chrome → ⋮ → Add to home screen),
      Windows (Edge → ⊕ install icon in the address bar).
- [ ] **Voices:** iPhone Chinese voice; Mi Pad *Speech Services by Google* + Chinese.

### A2. Sync test (all 3 devices)
- [ ] Create the account on one device, sign in on the other two.
- [ ] Trace 你 twice on the iPhone → the Mi Pad shows ✓ Mastered within a few seconds.
- [ ] Airplane mode on iPhone AND Mi Pad, practice on both, then reconnect → both sets of results add up (none lost).
- [ ] Sign out on Windows → progress from other devices disappears there; sign in → it returns.
- [ ] Backup: Save backup on the iPhone, Load backup on Windows → counts merge, no doubles.

### A3. Device checks
**iPhone 16**
- [ ] Opens full screen from the icon; nothing hidden under the Dynamic Island or the home bar.
- [ ] Tracing with a finger: the page doesn't scroll or zoom while drawing.
- [ ] Sign-in form: the keyboard doesn't cover the fields; iCloud Keychain offers to save the password.
- [ ] 🔊 and 🐢 play Chinese; Dictation and Tones read the right syllable.
- [ ] Airplane mode → the app still opens and works.

**Mi Pad 7 Pro**
- [ ] Landscape: word list left, characters right. Portrait: one column.
- [ ] **Rotate in the middle of a word**: the tracing square must redraw at the new size.
      (The test browser couldn't simulate rotation, so this needs the real tablet.)
- [ ] Focus Pen tracing is accepted, including fast strokes; palm on the screen doesn't draw.
- [ ] Split screen / floating window: layout still fits.
- [ ] Chrome installs it as an app (not just a bookmark).

**Windows**
- [ ] Installed app window opens; resizing the window redraws the square.
- [ ] Keyboard: ← → strokes, space, W, P, [ ], Esc; Flashcards space/1/2; Tones 1–4.

### A4. Known risks to watch
| Risk | What to look for | Fix if it happens |
|---|---|---|
| Firestore through the VPN | Chip stays "Offline" while online | Switch Firestore to long-polling (`experimentalForceLongPolling`) |
| iPhone storage clean-up | Progress gone after weeks unused in **Safari** (not the installed app) | Always use the Home Screen icon; sync restores it anyway |
| No Chinese voice on Mi Pad | 🔊 silent | Install Google voice; or Plan B3 (recorded audio) |
| Update stuck on an old version | New lesson doesn't appear | "Update now" toast; otherwise close and reopen the app twice |
| `npm audit` warnings (gRPC) | Server-only Firebase sub-package, not used in the browser | Ignore; re-check when Firebase updates |

### A5. Hardening after the device tests
- [ ] Firestore emulator tests for the security rules (another account can't read your data).
- [ ] Browser end-to-end tests (Playwright): open lesson, trace a character, finish a dictation, check Review.
- [ ] Error reporting: show a small "Something went wrong, tap to reload" banner instead of a blank screen.

---

## Part B: new features (after Part A is green)

Ordered by usefulness for learning; each is its own small release.

1. **Lesson 2+.** You send a photo of the new-words page; Claude writes the word list, meanings, memory tricks
   and stroke names, runs the checks and publishes. (Tool already built: `npm run add-lesson`.)
2. **Daily review (spaced repetition).** Home screen shows "今天复习 · 6 words due" picked by how well and how long ago
   you practiced; a 5-minute mixed session (flashcard → write → dictation).
3. **Streak and calendar.** Days practiced in a row, a month calendar of practice, total characters mastered.
4. **Recorded audio.** Clear recordings per word and sentence, cached offline, used when a device has no Chinese voice.
5. **Printable practice sheets.** PDF 田字格 sheets per lesson with stroke-order rows, for pen-and-paper practice.
6. **Sentence practice.** Use the example sentences: listen and order the words, fill in the missing character.
7. **Settings.** Light/dark/auto, animation speed, hint after N mistakes, bigger grid, sound on/off.
8. **Progress page.** Per-lesson charts: characters mastered over time, dictation scores, hardest characters.

Decisions needed from you before Part B: which of 2–8 matter most, and the Lesson 2 photo.
