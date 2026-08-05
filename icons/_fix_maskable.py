#!/usr/bin/env python3
"""Fix phone icon: Android adaptive masks crop full-bleed content.
Create safe-zone maskable icon (calendar ~76% of canvas). PC 'any' stays zoomed."""
from PIL import Image, ImageEnhance
from pathlib import Path

out = Path('/home/mag/projects/darba-kalendars/icons')
# Current zoomed (PC-good) icon is the source
src = out / 'CHOSEN-05-preview.png'
im = Image.open(src).convert('RGB')
w, h = im.size
s = min(w, h)
im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))

# Maskable: Android safe zone ≈ 66% diameter, keep calendar ~76% so nothing clips
target = 1024
content_frac = 0.76  # inner content within safe zone
inner = int(target * content_frac)
scaled = im.resize((inner, inner), Image.Resampling.LANCZOS)
canvas = Image.new('RGB', (target, target), (14, 18, 36))
off = (target - inner) // 2
canvas.paste(scaled, (off, off))

tag = 'v375'
canvas.save(out / f'icon-512-maskable-{tag}.png', format='PNG', optimize=True)
canvas.save(out / 'icon-512-maskable.png', format='PNG', optimize=True)
# also smaller maskable preview
canvas.resize((192, 192), Image.Resampling.LANCZOS).save(out / 'icon-192-maskable.png', format='PNG', optimize=True)

# Also slightly less zoomed "any" for launchers that don't use maskable (older Android)
# keep current any as-is (PC looks good), but produce a phone-safe any at 88%:
any_safe = int(target * 0.88)
s2 = im.resize((any_safe, any_safe), Image.Resampling.LANCZOS)
c2 = Image.new('RGB', (target, target), (14, 18, 36))
o2 = (target - any_safe) // 2
c2.paste(s2, (o2, o2))
c2.save(out / f'icon-512-any-safe-{tag}.png', format='PNG', optimize=True)
print('OK maskable safe-zone + phone-safe any')

for p in [out / f'icon-512-maskable-{tag}.png', out / f'icon-512-any-safe-{tag}.png']:
    print(p.name, Image.open(p).size)
