import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { AVATAR_COLORS, clampOffset, cleanLetters, coverScale, cropRect, formatMb, problemText, type FileProblem } from '@/lib/avatar';
import type { AvatarState } from '@/lib/api/avatar';
import { initialsOf } from '@/lib/initials';
import { Avatar } from '@/ui/Avatar';
import { Modal } from '@/ui/Modal';
import b from '@/ui/Button.module.css';
import s from './AvatarEditor.module.css';

// Окна аватара из макета Overlays. Состояние и сохранение — в useAvatarEditor.

/** Сторона рамки кадрирования на экране (макет Overlays, .crop .mask). */
const BOX = 168;

export type Me = AvatarState & { id: string; nickname: string };

export type Step =
  | { k: 'pick' }
  | { k: 'problem'; problem: FileProblem }
  | { k: 'loading'; name: string; size: number; progress: number }
  | { k: 'crop'; bmp: ImageBitmap; url: string; name: string }
  | { k: 'letters' };

export type Save = { k: 'idle' } | { k: 'saving' } | { k: 'error'; network: boolean; message: string };

const IconUpload = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
);
const IconImageBad = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </svg>
);
const IconZoom = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2M8.5 11h5M11 8.5v5" />
  </svg>
);

function Spinner() {
  return <i className={s.spn} aria-hidden="true" />;
}


// ─────────────────────────────── «Новое фото профиля» ───────────────────────────────
export function PickWindow({
  step,
  onClose,
  onFile,
  onChoose,
  onLetters,
  onCancelLoad,
  onBack,
}: {
  step: Extract<Step, { k: 'pick' | 'problem' | 'loading' }>;
  onClose: () => void;
  onFile: (f: File) => void;
  onChoose: () => void;
  onLetters: () => void;
  onCancelLoad: () => void;
  onBack: () => void;
}) {
  const [over, setOver] = useState(false);
  const loading = step.k === 'loading';

  let body: ReactNode;
  let actions: ReactNode;
  if (step.k === 'loading') {
    const pct = Math.round(step.progress * 100);
    body = (
      <div className={s.frow}>
        <div className={s.sk} aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.fname}>{step.name}</div>
          <div className="mute" style={{ fontSize: 12.5, margin: '3px 0 9px' }}>
            {formatMb(step.size)} · {pct}%
          </div>
          <div className={s.pbar} role="progressbar" aria-label="Загрузка файла" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={{ transform: `scaleX(${step.progress})` }} />
          </div>
        </div>
      </div>
    );
    actions = (
      <>
        <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={onCancelLoad}>
          Отменить загрузку
        </button>
        <button type="button" className={`${b.cta} ${b.sm}`} disabled>
          Сохранить
        </button>
      </>
    );
  } else if (step.k === 'problem') {
    const t = problemText(step.problem);
    body = (
      <div className={`${s.drop} ${s.err}`} role="alert">
        <span className={`${s.bigico} ${s.red}`}>
          <IconImageBad />
        </span>
        <b>{t.title}</b>
        <span className="mute" style={{ fontSize: 13 }}>
          {t.text}
        </span>
      </div>
    );
    actions = (
      <>
        <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={onBack}>
          Отмена
        </button>
        <button type="button" className={`${b.cta} ${b.sm}`} onClick={onChoose}>
          Выбрать другой файл
        </button>
      </>
    );
  } else {
    body = (
      <div
        className={`${s.drop} ${over ? s.over : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
      >
        <span className={s.bigico}>
          <IconUpload />
        </span>
        <b>Перетащи фото сюда</b>
        <span className="mute" style={{ fontSize: 13 }}>
          JPG или PNG, квадрат от 256 px, до 2 МБ
        </span>
        <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} style={{ marginTop: 4 }} onClick={onChoose}>
          Выбрать файл
        </button>
      </div>
    );
    actions = (
      <>
        <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={onLetters}>
          Использовать буквы
        </button>
        <button type="button" className={`${b.cta} ${b.sm}`} disabled>
          Сохранить
        </button>
      </>
    );
  }

  return (
    <Modal title="Новое фото профиля" onClose={loading ? onCancelLoad : onClose} wide closeButton={!loading} actions={actions}>
      {body}
    </Modal>
  );
}

// ─────────────────────────────── «Кадрирование» ───────────────────────────────
export function CropWindow({
  step,
  save,
  onClose,
  onOther,
  onSave,
}: {
  step: Extract<Step, { k: 'crop' }>;
  save: Save;
  onClose: () => void;
  onOther: () => void;
  onSave: (rect: { sx: number; sy: number; side: number }) => void;
}) {
  const { bmp } = step;
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const busy = save.k === 'saving';
  const k = coverScale(bmp.width, bmp.height, BOX);

  const set = (v: { zoom: number; x: number; y: number }) => {
    const zoom = Math.min(3, Math.max(1, v.zoom));
    setView({ zoom, ...clampOffset(bmp.width, bmp.height, { box: BOX, zoom, x: v.x, y: v.y }) });
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) set({ zoom: view.zoom, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 24 : 8;
    const moves: Record<string, [number, number, number]> = {
      ArrowLeft: [-step, 0, 0],
      ArrowRight: [step, 0, 0],
      ArrowUp: [0, -step, 0],
      ArrowDown: [0, step, 0],
      '+': [0, 0, 0.1],
      '=': [0, 0, 0.1],
      '-': [0, 0, -0.1],
    };
    const m = moves[e.key];
    if (!m || busy) return;
    e.preventDefault();
    set({ zoom: view.zoom + m[2], x: view.x + m[0], y: view.y + m[1] });
  };

  const save_ = () => onSave(cropRect(bmp.width, bmp.height, { box: BOX, ...view }));

  return (
    <Modal
      title="Кадрирование"
      onClose={onClose}
      busy={busy}
      wide
      closeButton
      actions={
        <>
          <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={onOther} disabled={busy}>
            Другое фото
          </button>
          <button type="button" className={`${b.cta} ${b.sm} ${busy ? s.ld : ''}`} onClick={save_} disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Сохраняем…
              </>
            ) : save.k === 'error' ? (
              'Повторить'
            ) : (
              'Сохранить'
            )}
          </button>
        </>
      }
    >
      <div
        className={`${s.crop} ${busy ? s.dis : ''}`}
        role="group"
        aria-label="Кадр: двигай фото мышью или стрелками, масштаб — плюс и минус"
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => !busy && set({ ...view, zoom: view.zoom - e.deltaY * 0.0015 })}
        onKeyDown={onKey}
      >
        <img
          src={step.url}
          alt=""
          draggable={false}
          className={s.pic}
          style={{
            width: bmp.width * k,
            height: bmp.height * k,
            transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          }}
        />
        <div className={s.mask} aria-hidden="true" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} className={busy ? s.dis : ''}>
        <span className="mute" style={{ display: 'flex' }}>
          <IconZoom />
        </span>
        <input
          type="range"
          className={s.rng}
          min={1}
          max={3}
          step={0.01}
          value={view.zoom}
          disabled={busy}
          aria-label="Масштаб"
          style={{ ['--p' as string]: `${((view.zoom - 1) / 2) * 100}%` }}
          onChange={(e) => set({ ...view, zoom: Number(e.target.value) })}
        />
      </div>
      <div className="help" style={{ margin: 0 }}>
        Двигай фото и меняй масштаб, чтобы лицо было в рамке.
      </div>
      {save.k === 'error' && (
        <div className="alert bad" role="alert">
          {save.message}
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────── «Аватар без фото» ───────────────────────────────
export function LettersWindow({
  me,
  save,
  onClose,
  onSave,
}: {
  me: Me;
  save: Save;
  onClose: () => void;
  onSave: (color: string, letters: string) => void;
}) {
  const [color, setColor] = useState(me.avatar_color);
  const [letters, setLetters] = useState(me.avatar_text ?? initialsOf(me.nickname));
  const busy = save.k === 'saving';

  return (
    <Modal
      title="Аватар без фото"
      onClose={onClose}
      busy={busy}
      wide
      closeButton
      actions={
        <>
          <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="button" className={`${b.cta} ${b.sm} ${busy ? s.ld : ''}`} onClick={() => onSave(color, letters)} disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Сохраняем…
              </>
            ) : save.k === 'error' ? (
              'Повторить'
            ) : (
              'Сохранить'
            )}
          </button>
        </>
      }
    >
      <div className={s.avprev}>
        <Avatar nickname={me.nickname} color={color} text={letters || null} size={84} radius={24} fontSize={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{me.nickname}</div>
          <div className="mute" style={{ fontSize: 13, marginTop: 4 }}>
            Так тебя видят в таблице и лобби
          </div>
        </div>
      </div>
      <div className={busy ? s.dis : ''}>
        <span className="lab">Цвет</span>
        <div className={s.swr} role="radiogroup" aria-label="Цвет аватара">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={c}
              className={`${s.sw} ${c === color ? s.on : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      <div className={busy ? s.dis : ''}>
        <label className="lab" htmlFor="ava-letters">
          Буквы
        </label>
        <input
          id="ava-letters"
          className="in"
          type="text"
          style={{ height: 46 }}
          value={letters}
          maxLength={2}
          autoComplete="off"
          onChange={(e) => setLetters(cleanLetters(e.target.value))}
        />
        <div className="help">До двух символов. По умолчанию — первые буквы ника.</div>
      </div>
      {me.avatar_path && (
        <div className="alert info">
          <span>Фото будет убрано, вместо него — буквы.</span>
        </div>
      )}
      {save.k === 'error' && (
        <div className="alert bad" role="alert">
          {save.message}
        </div>
      )}
    </Modal>
  );
}
