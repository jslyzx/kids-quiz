"""把 PDF 每页渲染成高清 PNG，供视觉识别用（借鉴 codex 的 Poppler 做法，改用 PyMuPDF）。
用法: python render_pdf_pages.py <input.pdf> <output_dir> [dpi]
默认 300 DPI（高清，足够看清数字）。"""
import sys
import os

if len(sys.argv) < 3:
    print("用法: python render_pdf_pages.py <input.pdf> <output_dir> [dpi]")
    sys.exit(1)

pdf_path = sys.argv[1]
out_dir = sys.argv[2]
dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 300

os.makedirs(out_dir, exist_ok=True)

import fitz  # PyMuPDF

doc = fitz.open(pdf_path)
print(f"PDF: {pdf_path}")
print(f"页数: {len(doc)}")
zoom = dpi / 72
matrix = fitz.Matrix(zoom, zoom)

base = os.path.splitext(os.path.basename(pdf_path))[0]
page_count = len(doc)
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=matrix)
    out = os.path.join(out_dir, f"{base}_p{i+1}.png")
    pix.save(out)
    print(f"  第{i+1}页 → {out} ({pix.width}x{pix.height})")

doc.close()
print(f"完成，共渲染 {page_count} 页 @ {dpi}DPI")
