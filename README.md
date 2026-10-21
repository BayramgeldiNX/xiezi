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

1. Write `lessons-in/lessonNN.tsv`: first line is the Chinese title, then one word per line, tab-separated:
   `word  pinyin  English  example汉字  example pinyin  example English`
2. `npm run add-lesson -- lessons-in/lessonNN.tsv` creates the lesson and lists what to fill in
   (meanings, memory tricks and stroke names for new characters, in `src/data/chars.json`).
3. `npm run gen:data` (stroke shapes + checks) and `npm run gen:font` (font; needs `fonts-src/NotoSerifSC-VF.ttf`, see below).
4. `npm test`, then commit and push. GitHub tests, builds and publishes automatically.

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
| `src/views/` | the tabs: write, dictation, cards, tones, review, account |
| `src/progress/` | progress records (`model.js` is pure logic, `store.js` saves on the device) |
| `src/sync/` | Firebase sign-in and sync |
| `src/data/` | lessons, characters, stroke names; `strokes.gen.json` is generated |
| `scripts/` | data, font, icon, lesson and Firebase tools |
| `reference/` | the original single-page artifact this app grew from |

How progress syncs: every practice result updates one record per item (`w:你` writing, `d:你好` dictation,
`f:` flashcards, `t:` tones). Each device writes only its own part of each record, so devices never overwrite
each other, even when practicing offline at the same time. Totals are added up when shown.
