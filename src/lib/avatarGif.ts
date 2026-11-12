// Анимированная аватарка: GIF раскладывается на кадры (gifuct-js), каждый кадр кадрируется
// по той же рамке, что и обычное фото, и собирается обратно в GIF 256×256 (gifenc).
// Модуль грузится только когда выбран GIF (динамический import в useAvatarEditor).
import { decompressFrames, parseGIF } from 'gifuct-js';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { t } from '@/i18n';

/** Готовый GIF не больше этого (корзина avatars принимает до 2 МБ). */
export const GIF_MAX_BYTES = 1.9 * 1024 * 1024;
/** Больше кадров не берём: длинные GIF прореживаем. */
export const GIF_MAX_FRAMES = 150;

export class GifTooHeavyError extends Error {
  constructor() {
    super(t('avatar.gifTooHeavy'));
  }
}

type Rect = { sx: number; sy: number; side: number };

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  return { c, ctx };
}

/**
 * Кадрирует анимированный GIF. step — брать каждый step-й кадр (задержки пропущенных суммируются,
 * скорость анимации не меняется). Если результат тяжелее GIF_MAX_BYTES — прореживает сильнее.
 */
export async function renderAvatarGif(buf: ArrayBuffer, rect: Rect, size = 256, background = '#15151a'): Promise<Blob> {
  const gif = parseGIF(buf);
  const frames = decompressFrames(gif, true);
  if (!frames.length) throw new Error('broken');
  const W = gif.lsd.width;
  const H = gif.lsd.height;

  for (let step = Math.max(1, Math.ceil(frames.length / GIF_MAX_FRAMES)); step <= 8; step *= 2) {
    const comp = canvas(W, H);
    const patch = canvas(1, 1);
    const out = canvas(size, size);
    out.ctx.imageSmoothingQuality = 'high';
    const enc = GIFEncoder();
    let saved: ImageData | null = null;
    let delay = 0;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      // Как убрать предыдущий кадр (disposal): 2 — очистить его область, 3 — вернуть как было до него.
      const prev = frames[i - 1];
      if (prev?.disposalType === 2) comp.ctx.clearRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height);
      else if (prev?.disposalType === 3 && saved) comp.ctx.putImageData(saved, 0, 0);
      if (f.disposalType === 3) saved = comp.ctx.getImageData(0, 0, W, H);

      // putImageData не смешивает прозрачность — поэтому кадр через отдельный холст и drawImage.
      patch.c.width = f.dims.width;
      patch.c.height = f.dims.height;
      patch.ctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height), 0, 0);
      comp.ctx.drawImage(patch.c, f.dims.left, f.dims.top);

      delay += Math.max(f.delay, 20);
      if (i % step !== step - 1 && i !== frames.length - 1) continue;

      out.ctx.fillStyle = background;
      out.ctx.fillRect(0, 0, size, size);
      out.ctx.drawImage(comp.c, rect.sx, rect.sy, rect.side, rect.side, 0, 0, size, size);
      const rgba = out.ctx.getImageData(0, 0, size, size).data;
      const palette = quantize(rgba, 256);
      enc.writeFrame(applyPalette(rgba, palette), size, size, { palette, delay });
      delay = 0;
      // Не подвешиваем вкладку на длинных GIF.
      if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
    }
    enc.finish();
    const blob = new Blob([new Uint8Array(enc.bytes())], { type: 'image/gif' });
    if (blob.size <= GIF_MAX_BYTES) return blob;
  }
  throw new GifTooHeavyError();
}
