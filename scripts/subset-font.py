"""Cut Noto Serif SC down to only the characters the app shows.

Scans index.html and everything in src/ for characters, keeps weights 500-700,
and writes src/fonts/NotoSerifSC-sub.woff2 (a few hundred KB instead of 25 MB).

Needs: python -m pip install --user fonttools brotli
and the full font at fonts-src/NotoSerifSC-VF.ttf (see README).
"""
import io
import pathlib
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_FONT = ROOT / "fonts-src" / "NotoSerifSC-VF.ttf"
OUT = ROOT / "src" / "fonts" / "NotoSerifSC-sub.woff2"
SCAN = [ROOT / "index.html", *(p for p in (ROOT / "src").rglob("*") if p.suffix in {".js", ".json", ".css", ".html"})]

if not SRC_FONT.exists():
    sys.exit(f"Missing {SRC_FONT}. Download it first (see README).")

text = set()
for p in SCAN:
    text.update(p.read_text(encoding="utf-8"))
# Printable ASCII and common punctuation are always kept so mixed text renders in one font.
text.update(chr(c) for c in range(0x20, 0x7F))
text.update("，。！？：；、“”‘’（）《》·…—～ āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü")
chars = "".join(sorted(c for c in text if c.isprintable()))
han = sum(1 for c in chars if "㐀" <= c <= "鿿")

font = TTFont(SRC_FONT, lazy=False)
opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(text=chars)
sub.subset(font)
# Subset first, then limit the weight axis (the other order trips a fontTools bug).
font = instancer.instantiateVariableFont(font, {"wght": (500, 700)})
OUT.parent.mkdir(parents=True, exist_ok=True)
buf = io.BytesIO()
font.flavor = "woff2"
font.save(buf)
OUT.write_bytes(buf.getvalue())
print(f"{OUT.relative_to(ROOT)}: {han} Chinese characters, {len(buf.getvalue()) // 1024} KB")
