#!/usr/bin/env python3
"""Rollback to liked icon C, zoomed so margins are smaller."""
from PIL import Image, ImageEnhance, ImageDraw
from pathlib import Path
import numpy as np

remake = Path('/home/mag/projects/darba-kalendars/icons/remake')
out = Path('/home/mag/projects/darba-kalendars/icons')
src = remake / 'c.png'
if not src.exists():
    src = remake / 'c-bleed.png'
print('source', src, src.exists())

im = Image.open(src).convert('RGBA')
w, h = im.size
s = min(w, h)
im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))

arr = np.asarray(im.convert('RGB'), dtype=np.int16)
bri = arr.max(axis=2)
mask = bri > 22
# purple-ish pixels count as content too
purp = (arr[:, :, 2] > arr[:, :, 1] + 4) * (arr[:, :, 0] > 15)
mask = np.logical_or(mask, purp.astype(bool))
ys, xs = np.where(mask)
x0, x1 = int(xs.min()), int(xs.max()) + 1
y0, y1 = int(ys.min()), int(ys.max()) + 1
print('bbox', x0, y0, x1, y1, 'content', x1 - x0, y1 - y0, 'of', s)

pad = int(s * 0.015)
x0 = max(0, x0 - pad)
y0 = max(0, y0 - pad)
x1 = min(s, x1 + pad)
y1 = min(s, y1 + pad)
cropped = im.crop((x0, y0, x1, y1))

# ~2% margin each side — calendar almost fills icon
target = 1024
margin_frac = 0.02
inner = int(target * (1 - 2 * margin_frac))
cw, ch = cropped.size
scale = inner / max(cw, ch)
nw, nh = int(cw * scale + 0.5), int(ch * scale + 0.5)
scaled = cropped.resize((nw, nh), Image.Resampling.LANCZOS)

bg = (14, 18, 36)
canvas = Image.new('RGB', (target, target), bg)
ox = (target - nw) // 2
oy = (target - nh) // 2
if scaled.mode == 'RGBA':
    canvas.paste(scaled, (ox, oy), scaled)
else:
    canvas.paste(scaled, (ox, oy))

canvas = ImageEnhance.Color(canvas).enhance(1.12)
canvas = ImageEnhance.Contrast(canvas).enhance(1.06)
canvas = ImageEnhance.Brightness(canvas).enhance(1.04)

tag = 'v375'


def exp(im, size):
    return im.resize((size, size), Image.Resampling.LANCZOS)


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

# compare previous small vs zoomed
old = remake / 'c.png'
a = Image.open(old).convert('RGB').resize((256, 256), Image.Resampling.LANCZOS)
b = canvas.resize((256, 256), Image.Resampling.LANCZOS)
cmp = Image.new('RGB', (532, 286), (12, 14, 20))
cmp.paste(a, (10, 10))
cmp.paste(b, (276, 10))
d = ImageDraw.Draw(cmp)
d.text((10, 270), 'old small', fill=(150, 150, 160))
d.text((276, 270), 'zoomed #3', fill=(251, 191, 36))
cmp.save(remake / '_rollback_compare.png')
print('OK rollback zoomed')
