"""Record every word, character, sentence and reading line with a natural neural voice.

Uses edge-tts (Microsoft's neural voice zh-CN-XiaoxiaoNeural). Files go to public/audio/<hash>.mp3
and the list of recordings to src/data/audio.gen.json. Existing recordings are kept, so re-running
after adding a lesson only records the new text.

Needs: python -m pip install --user edge-tts   (and internet; uses HTTPS_PROXY if set)
"""
import asyncio
import hashlib
import json
import os
import pathlib
import re

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data"
OUT = ROOT / "public" / "audio"
MANIFEST = DATA / "audio.gen.json"
VOICE = "zh-CN-XiaoxiaoNeural"


def clean(text):
    # Must match speech.js: dialogue labels are not read aloud.
    return re.sub(r"[AB]: ", "", text).strip()


def collect():
    texts = set()
    for lesson in sorted(DATA.glob("books/*/lesson*.json")):
        data = json.loads(lesson.read_text(encoding="utf-8"))
        for w in data["words"]:
            texts.add(w["w"])
            if w.get("ex", {}).get("hz"):
                texts.add(clean(w["ex"]["hz"]))
        for r in data.get("readings", []):
            for line in r["lines"]:
                texts.add(line["hz"])
    texts.update(json.loads((DATA / "chars.json").read_text(encoding="utf-8")).keys())
    texts.update(json.loads((DATA / "glossary.json").read_text(encoding="utf-8")).keys())
    for plain, *chars in json.loads((DATA / "tone-sets.json").read_text(encoding="utf-8")):
        texts.update(c for c in chars if c)
    return sorted(t for t in texts if t)


def name(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


async def record(text, sem, proxy):
    path = OUT / f"{name(text)}.mp3"
    if path.exists() and path.stat().st_size > 0:
        return False
    async with sem:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, VOICE, proxy=proxy).save(str(path))
                return True
            except Exception as e:  # network hiccups: retry
                if attempt == 2:
                    print(f"  failed: {text} ({e})")
                    path.unlink(missing_ok=True)
                await asyncio.sleep(1.5)
    return False


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    texts = collect()
    proxy = os.environ.get("HTTPS_PROXY") or None
    sem = asyncio.Semaphore(4)
    made = await asyncio.gather(*(record(t, sem, proxy) for t in texts))
    manifest = {t: name(t) for t in texts if (OUT / f"{name(t)}.mp3").exists()}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    # Remove recordings no longer used by any text.
    keep = set(manifest.values())
    for f in OUT.glob("*.mp3"):
        if f.stem not in keep:
            f.unlink()
    size = sum(f.stat().st_size for f in OUT.glob("*.mp3"))
    print(f"{len(manifest)}/{len(texts)} recordings ({sum(made)} new), {size // 1024} KB in public/audio/")


asyncio.run(main())
