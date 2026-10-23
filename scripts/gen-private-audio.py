"""Record the private book texts (data-src/private/<book>.json, not in the repository) into
data-src/private/audio/<hash>.mp3. scripts/upload-private.mjs then puts them in Firestore, where
only the owner's account can read them. Same voice and file names as scripts/gen-audio.py.
"""
import asyncio
import hashlib
import json
import os
import pathlib
import re

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRIVATE = ROOT / "data-src" / "private"
OUT = PRIVATE / "audio"
VOICE = "zh-CN-XiaoxiaoNeural"


def clean(text):
    return re.sub(r"[AB]: ", "", text).strip()


def name(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def collect():
    texts = set()
    for book in PRIVATE.glob("*.json"):
        for lesson in json.loads(book.read_text(encoding="utf-8"))["lessons"].values():
            for t in lesson.get("texts", []):
                texts.update(clean(line[1]) for line in t["lines"])
            for n in lesson.get("notes", []):
                texts.update(clean(e) for e in n.get("examples", []))
    return sorted(t for t in texts if t)


async def record(text, sem, proxy):
    path = OUT / f"{name(text)}.mp3"
    if path.exists() and path.stat().st_size > 0:
        return False
    async with sem:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, VOICE, proxy=proxy).save(str(path))
                return True
            except Exception as e:
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
    have = sum((OUT / f"{name(t)}.mp3").exists() for t in texts)
    print(f"{have}/{len(texts)} private recordings ({sum(made)} new)")


asyncio.run(main())
