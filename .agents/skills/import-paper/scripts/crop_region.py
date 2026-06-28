"""裁剪 PNG 的指定区域，放大后保存，便于逐区域看清细节。
用法: python crop_region.py <input.png> <output.png> <x> <y> <w> <h> [scale]"""
import sys
import fitz
from PIL import Image

# 用 PIL 更直接
inp, out, x, y, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 1.5

im = Image.open(inp)
crop = im.crop((x, y, x + w, y + h))
if scale != 1:
    crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
crop.save(out)
print(f"{out}: {crop.width}x{crop.height} (from {w}x{h} @{scale}x)")
