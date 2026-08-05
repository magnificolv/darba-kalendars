#!/usr/bin/env python3
"""Zoom icon C: detect purple calendar body, crop dark padding hard, scale up."""
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw
from pathlib import Path
import numpy as np

remake = Path('/home/mag/projects/darba-kalendars/icons/remake')
out = Path('/home/mag/projects/darba-kalendars/icons')
src = remake / 'c.png'
im = Image.open(src).convert('RGB')
w, h = im.size
s = min(w, h)
im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
arr = np.asarray(im, dtype=np.float32)

# Calendar content: elevated purple/blue vs near-black void
r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
bri = arr.max(axis=2)
# purple-ish OR bright enough (amber cell, lines)
is_purp = (b > 40) * (b > r * 0.85) * (b > g * 0.9)
is_amber = (r > 120) * (g > 70) * (r > b)
is_line = bri > 55
mask = (is_purp + is_amber + is_line) > 0

# morphological-ish: expand mask a bit via max filter
from PIL import ImageFilter as IF
mask_img = Image.fromarray((mask.astype(np.uint8) * 255))
mask_img = mask_img.filter(IF.MaxFilter(9))
mask = np.asarray(mask_img) > 0

ys, xs = np.where(mask)
print('content pixels', len(xs))
x0, x1 = int(xs.min()), int(xs.max()) + 1
y0, y1 = int(ys.min()), int(ys.max()) + 1
print('tight bbox', x0, y0, x1, y1, 'frac', (x1 - x0) / s, (y1 - y0) / s)

# small pad so we keep glow
pad = max(4, int(s * 0.012))
x0 = max(0, x0 - pad)
y0 = max(0, y0 - pad)
x1 = min(s, x1 + pad)
y1 = min(s, y1 + pad)

cropped = im.crop((x0, y0, x1, y1))
cw, ch = cropped.size
# square crop centered on content
side = max(cw, ch)
sq = Image.new('RGB', (side, side), (14, 18, 36))
sq.paste(cropped, ((side - cw) // 2, (side - ch) // 2))

# Scale to fill 98% of final icon
target = 1024
fill = 0.98
inner = int(target * fill)
scaled = sq.resize((inner, inner), Image.Resampling.LANCZOS)
canvas = Image.new('RGB', (target, target), (14, 18, 36))
off = (target - inner) // 2
canvas.paste(scaled, (off, off))

canvas = ImageEnhance.Color(canvas).enhance(1.1)
canvas = ImageEnhance.Contrast(canvas).enhance(1.05)
canvas = ImageEnhance.Brightness(canvas).enhance(1.03)

tag = 'v375'


def exp(img, size):
    return img.resize((size, size), Image.Resampling.LANCZOS)


canvas.save(remake / 'FINAL.png')
canvas.save(out / 'CHOSEN-05-preview.png')
for name, size in [
    (f'icon-192-{tag}.png', 192),
    (f'icon-512-{tag}.png', 512),
    (f'icon-512-maskable-{tag}.png', 512),
    (f'apple-touch-icon-{tag}.png', 180),
    (f'favicon-32-{tag}.png', 32),
]:
    exp(canvas, size).save(out / name, format='PNG', optimize=True)
    print('wrote', name)

exp(canvas, 192).save(out / 'icon-192.png')
exp(canvas, 512).save(out / 'icon-512.png')
exp(canvas, 512).save(out / 'icon-512-maskable.png')
exp(canvas, 180).save(out / 'apple-touch-icon.png')
exp(canvas, 32).save(out / 'favicon-32.png')

# before/after
orig = Image.open(src).convert('RGB').resize((256, 256), Image.Resampling.LANCZOS)
now = canvas.resize((256, 256), Image.Resampling.LANCZOS)
cmp = Image.new('RGB', (532, 286), (12, 14, 20))
cmp.paste(orig, (10, 10))
cmp.paste(now, (276, 10))
d = ImageDraw.Draw(cmp)
d.text((10, 270), 'before', fill=(150, 150, 160))
d.text((276, 270), 'zoomed #3', fill=(251, 191, 36))
cmp.save(remake / '_rollback_compare.png')
print('frac filled roughly', fill)
print('OK')
