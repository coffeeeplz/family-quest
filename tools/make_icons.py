"""Draw the app icons (pixel rabbit on a pastel tile) from the sprite data."""
import json, sys, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding="utf-8"))
pal = data["palette"]
rabbit = next(a for a in data["avatars"] if a["id"] == "rabbit")
PRIMARY = "#FFB3D1"

def rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def tile(size, cell, bg="#FFE0EE", border=True):
    """size px square; sprite drawn with `cell` px per dot, centred."""
    img = Image.new("RGB", (size, size), rgb(bg))
    px = img.load()
    if border:
        b = max(cell // 2, 2)
        ink = rgb(pal["K"])
        for i in range(size):
            for j in range(b):
                px[i, j] = ink; px[i, size - 1 - j] = ink; px[j, i] = ink; px[size - 1 - j, i] = ink
    off = (size - 16 * cell) // 2
    for y, row in enumerate(rabbit["rows"]):
        for x, ch in enumerate(row):
            if ch == ".": continue
            c = rgb(PRIMARY if ch == "A" else pal[ch])
            for dy in range(cell):
                for dx in range(cell):
                    px[off + x * cell + dx, off + y * cell + dy] = c
    return img

os.makedirs(out, exist_ok=True)
tile(192, 10).save(os.path.join(out, "icon-192.png"))
tile(512, 26).save(os.path.join(out, "icon-512.png"))
# maskable: keep the art inside the central safe zone, no border
tile(512, 18, border=False).save(os.path.join(out, "icon-maskable-512.png"))
tile(180, 9, border=False).save(os.path.join(out, "apple-touch-icon.png"))
tile(64, 3, border=False).save(os.path.join(out, "favicon.png"))
print("icons ok")
