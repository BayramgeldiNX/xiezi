# 写字本 · Xiězìběn

白怀诚's Chinese writing book: stroke order, dictation (听写), flashcards, tones and review for
*汉语口语速成 · 入门篇*. An installable web app (PWA) for iPhone, Mi Pad and Windows that works offline
and syncs progress between devices.

**Live app:** https://bayramgeldinx.github.io/xiezi/

## Install on your devices

| Device | How |
|---|---|
| iPhone 16 | Open the link in **Safari** → Share button → **Add to Home Screen** → Add |
| Mi Pad 7 Pro | Open the link in **Chrome** → ⋮ menu → **Add to home screen** → Install |
| Windows | Open the link in **Edge** or **Chrome** → install icon (⊕) in the address bar → Install |

Then open 写字本 from the icon. It runs full screen and works without internet.

**Chinese voice (for 🔊):**
- iPhone: Settings → Accessibility → Spoken Content → Voices → Chinese → download one (e.g. Tingting).
- Mi Pad: install *Speech Services by Google*, then Settings → Additional settings → Text-to-speech → Google → install Chinese (Mandarin).

## Sync between devices (one-time setup)

1. Go to https://console.firebase.google.com → **Create a project**. Name it `xiezi`, accept the terms,
   turn **off** Google Analytics, and finish. Note the **project ID** it shows (e.g. `xiezi-1a2b3`).
2. In the project: **Build → Authentication → Get started → Email/Password → Enable → Save**.
3. On the PC, with Clash Verge on:
   ```
   npm run setup:firebase -- <project-id>
   git commit -am "Connect Firebase" && git push
   ```
4. After about 2 minutes the app updates itself ("A new version is ready" → Update now).
   In the app tap **Sign in to sync** → type your email and a new password → **Create account**.
   On the other devices use the same email and password with **Sign in**.

## Adding a lesson

Each book is a folder `src/data/books/<book-id>/` with `book.json` (title, part, English name, cover color)
and one `lessonNN.json` per lesson. Lesson 1 of 汉语口语速成 · 入门篇 is in `src/data/books/kouyu-rumen/`.

1. Write `lessons-in/lessonNN.tsv`: first line is the Chinese title, then one word per line, tab-separated:
   `word  pinyin  English  example汉字  example pinyin  example English`
2. `npm run add-lesson -- <book-id> lessons-in/lessonNN.tsv` creates the lesson and lists what to fill in
   (meanings, memory tricks and stroke names for new characters, in `src/data/chars.json`).
3. Optional: reading texts in the lesson file's `"readings"` (lines with `who`, `hz`, `py`, `en`, plus
   multiple-choice `questions`). Words used in texts that aren't lesson words go in `src/data/glossary.json`.
4. `npm run gen:data` (stroke shapes + checks), `npm run gen:font` (font; needs `fonts-src/NotoSerifSC-VF.ttf`,
   see below) and `npm run gen:audio` (records new words and sentences with the neural voice; needs
   `python -m pip install --user edge-tts`).
5. `npm test`, then commit and push. GitHub tests, builds and publishes automatically.

Character details (parts, radical, origin) come from the open Make Me a Hanzi dictionary. `npm run gen:data`
builds them when it's downloaded once:
`curl -L -o data-src/makemeahanzi-dictionary.txt https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt`.
Look-alike characters are hand-picked in `src/data/similar.json`; radical names in `src/data/radicals.json`.

The font tool needs the full font once:
`curl -L -o fonts-src/NotoSerifSC-VF.ttf "https://github.com/google/fonts/raw/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf"`
and `python -m pip install --user fonttools brotli`.

## Development

```
npm install
npm run dev        # http://localhost:5173/xiezi/  (also on your Wi-Fi: see the "Network" address)
npm test           # unit tests
npm run build      # production build into dist/
npm run preview    # serve the build (to test offline mode)
```

| Folder | What's in it |
|---|---|
| `src/views/` | lesson tabs (write, dictation, cards, tones, review), `skills.js` (Writing, Listening, Speaking, Vocabulary sections), account |
| `src/progress/` | progress records (`model.js` is pure logic, `store.js` saves on the device) |
| `src/sync/` | Firebase sign-in and sync |
| `src/data/` | `books/<id>/` (book + lessons), characters, stroke names; `strokes.gen.json` is generated |
| `scripts/` | data, font, icon, lesson and Firebase tools |
| `reference/` | the original single-page artifact this app grew from |

How progress syncs: every practice result updates one record per item (`w:你` writing, `d:你好` dictation,
`f:` flashcards, `t:` tones). Each device writes only its own part of each record, so devices never overwrite
each other, even when practicing offline at the same time. Totals are added up when shown.
