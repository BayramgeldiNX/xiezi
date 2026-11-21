# Render book PDFs to WebP pages for the owner-only upload (npm run upload:pages). Never goes in the repo.
#   python scripts/tools/render-book-pages.py <out-dir> <width> [ids...]
# Writes <out-dir>/<id>/<NNN>.webp (1-based) and <out-dir>/<id>/manifest.json [{n, w, h, bytes}].
import sys, os, io, json, warnings
warnings.filterwarnings("ignore")
import pymupdf
from PIL import Image

SRC = os.path.join(os.path.expanduser("~"), "Documents", "Books", "app")
ALL = ["kouyu", "ledu", "hsk1-tb", "hsk1-wb", "hsk2-tb", "hsk2-wb"]
LIMIT = 900 * 1024
QUALITY = int(os.environ.get("QUALITY", "72"))

out, width = sys.argv[1], int(sys.argv[2])
ids = sys.argv[3:] or ALL
grand = 0
for pid in ids:
    doc = pymupdf.open(os.path.join(SRC, pid + ".pdf"))
    d = os.path.join(out, pid)
    os.makedirs(d, exist_ok=True)
    man, total, biggest = [], 0, 0
    for i, page in enumerate(doc):
        z = width / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        q = QUALITY
        while True:
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=q, method=6)
            if buf.tell() <= LIMIT or q <= 30:
                break
            q -= 6
        data = buf.getvalue()
        with open(os.path.join(d, f"{i+1:03d}.webp"), "wb") as f:
            f.write(data)
        man.append({"n": i + 1, "w": im.width, "h": im.height, "bytes": len(data)})
        total += len(data)
        biggest = max(biggest, len(data))
    with open(os.path.join(d, "manifest.json"), "w") as f:
        json.dump(man, f)
    grand += total
    print(f"{pid}: {len(man)} pages, {total/1e6:.1f} MB, largest {biggest/1024:.0f} KB", flush=True)
print(f"total {grand/1e6:.1f} MB")
