# Render every page of scanned PDFs to JPEG so Claude can read them: python scripts/tools/pdf-pages.py <outdir> <width> <pdf>...
import sys, os, fitz
out, width = sys.argv[1], int(sys.argv[2])
for src in sys.argv[3:]:
    tag = "D" + os.path.basename(src).split()[-1].split(".")[0]
    doc = fitz.open(src)
    for i, page in enumerate(doc):
        z = width / page.rect.width
        pix = page.get_pixmap(matrix=fitz.Matrix(z, z))
        pix.save(os.path.join(out, f"{tag}-p{i+1:02d}.jpg"), jpg_quality=80)
    print(tag, len(doc), page.rect)
