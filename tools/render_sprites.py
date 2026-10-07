"""Validate sprite grids, render a preview sheet, and export SVG assets."""
import json, sys, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding="utf-8"))
pal = data["palette"]
colors = {c["id"]: c["hex"] for c in data["avatarColors"]}


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb2hex(c):
    return "#%02X%02X%02X" % c


def shade(h, f):
    r, g, b = hex2rgb(h)
    if f < 0:
        return rgb2hex(tuple(int(v * (1 + f)) for v in (r, g, b)))
    return rgb2hex(tuple(int(v + (255 - v) * f) for v in (r, g, b)))


def colour(ch, primary):
    if ch == ".":
        return None
    if ch == "A":
        return primary
    if ch == "a":
        return shade(primary, -0.2)
    if ch == "L":
        return shade(primary, 0.4)
    return pal[ch]


def check(name, rows, n):
    assert len(rows) == n, f"{name}: {len(rows)} rows"
    for i, r in enumerate(rows):
        assert len(r) == n, f"{name} row {i}: len {len(r)}"
        for ch in r:
            assert ch in ".AaL" or ch in pal, f"{name} row {i}: bad char {ch}"


def to_svg(rows, primary):
    n = len(rows)
    rects = []
    for y, r in enumerate(rows):
        x = 0
        while x < n:
            c = colour(r[x], primary)
            if c is None:
                x += 1
                continue
            x2 = x
            while x2 < n and colour(r[x2], primary) == c:
                x2 += 1
            rects.append(f'<rect x="{x}" y="{y}" width="{x2 - x}" height="1" fill="{c}"/>')
            x = x2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" '
            f'shape-rendering="crispEdges">' + "".join(rects) + "</svg>")


def paint(img, rows, primary, ox, oy, s):
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            c = colour(ch, primary)
            if c:
                for dy in range(s):
                    for dx in range(s):
                        img.putpixel((ox + x * s + dx, oy + y * s + dy), hex2rgb(c))


os.makedirs(out, exist_ok=True)
S = 8
avs = data["avatars"]
icons = data["icons"]
PER_ROW = 10  # icons per preview row
icon_rows = (len(icons) + PER_ROW - 1) // PER_ROW
sheet = Image.new("RGB", (len(avs) * 16 * S // 2 + 40, 2 * 16 * S + icon_rows * (12 * 6 + 8) + 60), hex2rgb("#F6F0FF"))
for i, a in enumerate(avs):
    check(a["id"], a["rows"], 16)
    prim = colors[a["color"]]
    paint(sheet, a["rows"], prim, 10 + (i % 6) * (16 * S + 4), 10 + (i // 6) * (16 * S + 10), S)
    open(os.path.join(out, f"avatar-{a['id']}.svg"), "w").write(to_svg(a["rows"], prim))
for i, (k, rows) in enumerate(icons.items()):
    check(k, rows, 12)
    paint(sheet, rows, "#FFFFFF", 10 + (i % PER_ROW) * (12 * 6 + 6), 2 * (16 * S + 10) + 20 + (i // PER_ROW) * (12 * 6 + 8), 6)
    open(os.path.join(out, f"icon-{k}.svg"), "w").write(to_svg(rows, "#FFFFFF"))
sheet.save(os.path.join(out, "preview.png"))
print("ok", len(avs), "avatars", len(icons), "icons")
