"""Фото пилотов для сайта из набора владельца.

Вход:  public/assets/f1_photos/full/<КОД>.jpg — студийное фото в полный рост на чёрном фоне (как прислал владелец).
Выход: public/assets/f1_photos/<КОД>.png   — кадр «голова и грудь», фон прозрачный (мастер);
       public/assets/webp/drivers/<КОД>.webp — 240×240 для карточек (до 120px при 2×), подключается в src/lib/assets.ts.

Запуск из корня репозитория (нужны Pillow и numpy):
    python -I scripts/driver-photos.py            # все пилоты из full/
    python -I scripts/driver-photos.py NOR LIN    # только эти

Фон: почти чёрные пиксели (≤ 2), связанные с краем кадра, — прозрачные; тёмное внутри силуэта (волосы, чёрные
комбинезоны) не трогается. Артефакты JPEG у края убираются (фон дорастает в пиксели ≤ 14, не дальше 4 px),
край мягкий, тёмная кайма снимается. Кадр: макушка на 6% от верха, сторона 262 px исходника, центр — по голове.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL = os.path.join(ROOT, 'public', 'assets', 'f1_photos', 'full')
MASTER = os.path.join(ROOT, 'public', 'assets', 'f1_photos')
WEBP = os.path.join(ROOT, 'public', 'assets', 'webp', 'drivers')

BG_MAX = 2       # фон: яркость не выше
SOFT_MAX = 14    # артефакты JPEG у края
GROW_PX = 4
SIDE = 262       # сторона кадра в пикселях исходника (440×1265)
TOP_GAP = 0.06   # отступ над макушкой
OUT = 240


def cutout(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    lum = a.max(axis=2)
    h, w = lum.shape
    dark = Image.fromarray(np.where(lum <= BG_MAX, 255, 0).astype(np.uint8)).copy()
    for x in range(w):
        for y in (0, h - 1):
            if dark.getpixel((x, y)) == 255:
                ImageDraw.floodfill(dark, (x, y), 128)
    for y in range(h):
        for x in (0, w - 1):
            if dark.getpixel((x, y)) == 255:
                ImageDraw.floodfill(dark, (x, y), 128)
    bg = np.asarray(dark) == 128
    soft = lum <= SOFT_MAX
    for _ in range(GROW_PX):
        grown = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
        bg = bg | (grown & soft)
    alpha = np.where(bg, 0.0, 1.0)
    near = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))) < 255
    edge = near & ~bg
    ramp = np.clip((lum - 8) / 45.0, 0, 1)
    alpha = np.where(edge, np.minimum(alpha, ramp), alpha)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255
    alpha = np.where(bg & (alpha < 0.5), 0, alpha)
    safe = np.maximum(alpha, 0.35)[..., None]
    rgb = np.clip(np.where(edge[..., None], a / safe, a), 0, 255)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')


def frame(rgba: Image.Image) -> Image.Image:
    al = np.asarray(rgba)[..., 3]
    top = int(np.where(al.max(axis=1) > 128)[0][0])
    head = al[top:top + 130] > 128
    xs = np.where(head.any(axis=0))[0]
    cx = int(xs.mean()) if len(xs) else al.shape[1] // 2
    y0 = top - int(SIDE * TOP_GAP)
    x0 = cx - SIDE // 2
    return rgba.crop((x0, y0, x0 + SIDE, y0 + SIDE))


def main() -> None:
    only = {c.upper() for c in sys.argv[1:]}
    for f in sorted(os.listdir(FULL)):
        code, ext = os.path.splitext(f)
        if ext.lower() != '.jpg' or (only and code.upper() not in only):
            continue
        code = code.upper()
        master = frame(cutout(Image.open(os.path.join(FULL, f))))
        master.save(os.path.join(MASTER, f'{code}.png'), optimize=True)
        master.resize((OUT, OUT), Image.LANCZOS).save(os.path.join(WEBP, f'{code}.webp'), quality=84, method=6)
        print(code)


if __name__ == '__main__':
    main()
