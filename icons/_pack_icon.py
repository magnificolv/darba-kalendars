#!/usr/bin/env python3
"""Pack remake icon variants into PWA sizes. Prefer variant C if present."""
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw
from pathlib import Path
import numpy as np

remake = Path('/home/mag/projects/darba-kalendars/icons/remake')
out = Path('/home/mag/projects/darba-kalendars/icons')
prefer = 'c'  # user picked 3


def content_bbox(im, thr=28):
    arr = np.asarray(im.convert('RGB'), dtype=np.int16)
    bri = arr.max(axis=2)
    mask = bri > thr
    purp = (arr[:, :, 2] > arr[:, :, 1] + 5) & (arr[:, :, 0] > 20)
    mask = mask | purp
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return (0, 0, im.width, im.height)
    pad = 2
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(im.width, int(xs.max()) + pad + 1)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(im.height, int(ys.max()) + pad + 1)
    return (x0, y0, x1, y1)


def full_bleed(path, boost=1.22, color=1.4, contrast=1.18):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    bbox = content_bbox(im)
    im = im.crop(bbox)
    # Fill entire square edge-to-edge
    filled = im.resize((max(im.size), max(im.size)), Image.Resampling.LANCZOS)
    filled = filled.resize((max(filled.size), max(filled.size)), Image.Resampling.LANCZOS)
    # Force exact square from content
    s = max(im.size)
    filled = im.resize((s, s), Image.Resampling.LANCZOS)
    rgb = filled.convert('RGB')
    rgb = ImageEnhance.Color(rgb).enhance(color)
    rgb = ImageEnhance.Brightness(rgb).enhance(boost)
    rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.2, percent=130, threshold=2))
    return rgb


def score(im):
    arr = np.asarray(im, dtype=np.float32)
    mx = arr.max(axis=2)
    mn = arr.min(axis=2)
    sat = (mx - mn).mean()
    bri = mx.mean()
    corners = (
        arr[0:8, 0:8].mean()
        + arr[0:8, -8:].mean()
        + arr[-8:, 0:8].mean()
        + arr[-8:, -8:].mean()
    )
    return sat * 1.6 + bri + corners * 0.15


def exp(img, size):
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main():
    variants = []
    for name in ['a', 'b', 'c']:
        p = remake / f'{name}.png'
        if not p.exists():
            print('missing', p)
            continue
        v = full_bleed(p)
        v.save(remake / f'{name}-bleed.png')
        variants.append((name, v))
        print(name, 'ok', v.size, 'score', round(score(v), 1))

    by_name = {n: v for n, v in variants}
    if prefer in by_name:
        best_name, best = prefer, by_name[prefer]
    else:
        best_name, best = max(variants, key=lambda t: score(t[1]))
    print('SELECTED', best_name)

    th = 180
    strip = Image.new('RGB', (th * len(variants) + 20 + 10 * (len(variants) - 1), th + 50), (12, 14, 20))
    d = ImageDraw.Draw(strip)
    for i, (name, im) in enumerate(variants):
        t = im.resize((th, th), Image.Resampling.LANCZOS)
        x = 10 + i * (th + 10)
        strip.paste(t, (x, 10))
        mark = ' *' if name == best_name else ''
        d.text((x + 4, th + 18), f'{i+1}:{name.upper()}{mark}', fill=(251, 191, 36))
    strip.save(remake / '_pick.png')

    tag = 'v373'
    mapping = {
        f'icon-192-{tag}.png': 192,
        f'icon-512-{tag}.png': 512,
        f'icon-512-maskable-{tag}.png': 512,
        f'apple-touch-icon-{tag}.png': 180,
        f'favicon-32-{tag}.png': 32,
    }
    for name, size in mapping.items():
        exp(best, size).save(out / name, format='PNG', optimize=True)
        print('wrote', name)

    exp(best, 192).save(out / 'icon-192.png')
    exp(best, 512).save(out / 'icon-512.png')
    exp(best, 512).save(out / 'icon-512-maskable.png')
    exp(best, 180).save(out / 'apple-touch-icon.png')
    exp(best, 32).save(out / 'favicon-32.png')
    exp(best, 512).save(out / 'CHOSEN-05-preview.png')
    best.save(remake / 'FINAL.png')
    print('DONE')


if __name__ == '__main__':
    main()
