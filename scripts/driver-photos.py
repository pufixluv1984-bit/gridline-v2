"""Фото пилотов для сайта из набора владельца.

Вход:  public/assets/f1_photos/full/<КОД>.jpg — студийное фото в полный рост на чёрном фоне (набор 14.11.2026);
       public/assets/f1_photos/full/<КОД>.png — уже вырезанное фото «голова и плечи» (первый набор: BOT, PER).
Выход: public/assets/f1_photos/<КОД>.png   — кадр «голова и грудь» 300×262, фон прозрачный (мастер);
       public/assets/webp/drivers/<КОД>.webp — 275×240 для карточек, подключается в src/lib/assets.ts.

Запуск из корня репозитория (нужны Pillow и numpy):
    python -I scripts/driver-photos.py            # все пилоты из full/
    python -I scripts/driver-photos.py NOR LIN    # только эти

Фон: почти чёрные пиксели (≤ 2), связанные с краем кадра, — прозрачные; тёмное внутри силуэта (волосы, чёрные
комбинезоны) не трогается. Артефакты JPEG у края убираются (фон дорастает в пиксели ≤ 14, не дальше 4 px),
край мягкий, тёмная кайма снимается.
Масштаб: у всех одинаковая ширина головы (HEAD_W) — фото из разных наборов выглядят одного размера.
Кадр: макушка на 6% от верха, центр по голове; плечи у боковых краёв плавно уходят в прозрачность (FADE),
чтобы в широких карточках не было видно вертикального среза.
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
HEAD_W = 128     # ширина головы в кадре, px
FRAME_W, FRAME_H = 300, 262
TOP_GAP = 0.06   # отступ над макушкой
FADE = 0.17      # доля ширины кадра у каждого бокового края, где плечи уходят в прозрачность
OUT_H = 240


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


def widths(al: np.ndarray) -> tuple[int, np.ndarray]:
    on = al > 128
    top = int(np.where(on.any(axis=1))[0][0])
    w = np.array([(int(np.ptp(np.where(r)[0])) + 1) if r.any() else 0 for r in on])
    return top, w


def normalize(rgba: Image.Image) -> Image.Image:
    """Масштаб так, чтобы ширина головы была HEAD_W."""
    al = np.asarray(rgba)[..., 3]
    top, w = widths(al)
    guess = int(w[top:top + 40].max() * 0.8)  # голова примерно такой высоты до шеи
    head = int(w[top:top + max(guess, 40)].max())
    k = HEAD_W / head
    return rgba.resize((round(rgba.width * k), round(rgba.height * k)), Image.LANCZOS)


def frame(rgba: Image.Image) -> Image.Image:
    al = np.asarray(rgba)[..., 3]
    top, _ = widths(al)
    head = al[top:top + int(HEAD_W * 0.8)] > 128
    xs = np.where(head.any(axis=0))[0]
    cx = int(xs.mean()) if len(xs) else al.shape[1] // 2
    y0 = top - int(FRAME_H * TOP_GAP)
    x0 = cx - FRAME_W // 2
    out = rgba.crop((x0, y0, x0 + FRAME_W, y0 + FRAME_H))
    # Плавный уход в прозрачность у боковых краёв.
    a = np.asarray(out).astype(np.float32)
    x = (np.arange(FRAME_W) + 0.5) / FRAME_W
    edge = np.minimum(x, 1 - x) / FADE
    m = np.clip(edge, 0, 1)
    m = m * m * (3 - 2 * m)
    a[..., 3] *= m[None, :]
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def main() -> None:
    only = {c.upper() for c in sys.argv[1:]}
    for f in sorted(os.listdir(FULL)):
        code, ext = os.path.splitext(f)
        if ext.lower() not in ('.jpg', '.png') or (only and code.upper() not in only):
            continue
        code = code.upper()
        src = Image.open(os.path.join(FULL, f))
        rgba = cutout(src) if ext.lower() == '.jpg' else src.convert('RGBA')
        master = frame(normalize(rgba))
        master.save(os.path.join(MASTER, f'{code}.png'), optimize=True)
        out_w = round(FRAME_W * OUT_H / FRAME_H)
        master.resize((out_w, OUT_H), Image.LANCZOS).save(os.path.join(WEBP, f'{code}.webp'), quality=84, method=6)
        print(code)


if __name__ == '__main__':
    main()
