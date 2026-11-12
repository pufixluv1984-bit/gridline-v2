import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AVATAR_MAX_BYTES, AVATAR_MIN_SIDE, renderAvatar, sniffImage } from '@/lib/avatar';
import {
  AvatarNetworkError,
  patchAvatarEverywhere,
  removeAvatarPhoto,
  saveAvatarLetters,
  saveAvatarPhoto,
  type AvatarState,
} from '@/lib/api/avatar';
import { initialsOf } from '@/lib/initials';
import { Toast } from '@/ui/Toast';
import { CropWindow, LettersWindow, PickWindow, type Me, type Save, type Step } from './AvatarWindows';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Окна аватара из макета Overlays: «Новое фото профиля» (с загрузкой файла и ошибками), «Кадрирование»,
 * «Аватар без фото». Возвращает функции открытия и элемент, который нужно отрисовать на странице.
 */
export function useAvatarEditor(me: Me | null | undefined) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step | null>(null);
  const [save, setSave] = useState<Save>({ k: 'idle' });
  const [toast, setToast] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reader = useRef<FileReader | null>(null);

  // Картинка кадрирования живёт, пока открыт шаг crop.
  const cropRef = useRef<Extract<Step, { k: 'crop' }> | null>(null);
  const dropCrop = useCallback(() => {
    if (cropRef.current) {
      URL.revokeObjectURL(cropRef.current.url);
      cropRef.current.bmp.close();
      cropRef.current = null;
    }
  }, []);
  useEffect(() => dropCrop, [dropCrop]);

  const go = useCallback(
    (next: Step | null) => {
      if (next?.k !== 'crop') dropCrop();
      else cropRef.current = next;
      setSave({ k: 'idle' });
      setStep(next);
    },
    [dropCrop],
  );

  const close = useCallback(() => {
    reader.current?.abort();
    go(null);
  }, [go]);

  const done = (next: AvatarState, message: string) => {
    if (me) patchAvatarEverywhere(qc, me.id, next);
    go(null);
    setToast(message);
  };

  const fail = (e: unknown) =>
    setSave({
      k: 'error',
      network: e instanceof AvatarNetworkError,
      message: e instanceof AvatarNetworkError ? 'Нет связи с сервером. Фото не сохранено — проверь интернет и повтори.' : (e as Error).message,
    });

  // ── Файл: тип по содержимому → размер → чтение с прогрессом → картинка → минимальная сторона ──
  const takeFile = async (file: File) => {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const kind = sniffImage(head);
    if (!kind) return go({ k: 'problem', problem: { kind: 'format' } });
    if (file.size > AVATAR_MAX_BYTES) return go({ k: 'problem', problem: { kind: 'too_big', size: file.size } });

    go({ k: 'loading', name: file.name, size: file.size, progress: 0 });
    const fr = new FileReader();
    reader.current = fr;
    fr.onprogress = (e) => {
      if (e.lengthComputable) setStep((st) => (st?.k === 'loading' ? { ...st, progress: e.loaded / e.total } : st));
    };
    fr.onerror = () => go({ k: 'problem', problem: { kind: 'broken' } });
    fr.onload = async () => {
      reader.current = null;
      const blob = new Blob([fr.result as ArrayBuffer], { type: `image/${kind}` });
      let bmp: ImageBitmap;
      try {
        bmp = await createImageBitmap(blob);
      } catch {
        return go({ k: 'problem', problem: { kind: 'broken' } });
      }
      if (Math.min(bmp.width, bmp.height) < AVATAR_MIN_SIDE) {
        const { width, height } = bmp;
        bmp.close();
        return go({ k: 'problem', problem: { kind: 'too_small', width, height } });
      }
      go({ k: 'crop', bmp, url: URL.createObjectURL(blob), name: file.name });
    };
    fr.readAsArrayBuffer(file);
  };

  const chooseFile = () => input.current?.click();
  const cancelLoad = useCallback(() => {
    reader.current?.abort();
    reader.current = null;
    go({ k: 'pick' });
  }, [go]);

  const openPhoto = () => go({ k: 'pick' });
  const openLetters = () => go({ k: 'letters' });

  const remove = async () => {
    if (!me?.avatar_path || removing) return;
    setRemoving(true);
    try {
      await removeAvatarPhoto(me.id);
      if (me) patchAvatarEverywhere(qc, me.id, { avatar_color: me.avatar_color, avatar_text: me.avatar_text, avatar_path: null });
      setToast('Фото убрано');
    } catch (e) {
      setToast(null);
      setSave({ k: 'error', network: e instanceof AvatarNetworkError, message: (e as Error).message });
    } finally {
      setRemoving(false);
    }
  };

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void takeFile(f);
      }}
    />
  );

  let modal: ReactNode = null;
  if (step && me) {
    if (step.k === 'pick' || step.k === 'problem' || step.k === 'loading') {
      modal = (
        <PickWindow
          step={step}
          onClose={close}
          onFile={(f) => void takeFile(f)}
          onChoose={chooseFile}
          onLetters={openLetters}
          onCancelLoad={cancelLoad}
          onBack={() => go({ k: 'pick' })}
        />
      );
    } else if (step.k === 'crop') {
      modal = (
        <CropWindow
          key={step.url}
          step={step}
          save={save}
          onClose={close}
          onOther={() => {
            go({ k: 'pick' });
            chooseFile();
          }}
          onSave={async (rect) => {
            setSave({ k: 'saving' });
            try {
              const [s512, s256] = await Promise.all([renderAvatar(step.bmp, rect, 512), renderAvatar(step.bmp, rect, 256)]);
              const path = await saveAvatarPhoto(me.id, { s256, s512 });
              done({ avatar_color: me.avatar_color, avatar_text: me.avatar_text, avatar_path: path }, 'Фото обновлено');
            } catch (e) {
              fail(e);
            }
          }}
        />
      );
    } else {
      modal = (
        <LettersWindow
          me={me}
          save={save}
          onClose={close}
          onSave={async (color, letters) => {
            setSave({ k: 'saving' });
            const text = letters && letters !== initialsOf(me.nickname) ? letters : null;
            try {
              await saveAvatarLetters(me.id, color, text);
              done({ avatar_color: color, avatar_text: text, avatar_path: null }, 'Аватар обновлён');
            } catch (e) {
              fail(e);
            }
          }}
        />
      );
    }
  }

  const element = (
    <>
      {fileInput}
      {modal}
      {toast && <Toast tone="g" title={toast} onDone={() => setToast(null)} />}
    </>
  );

  /** Ошибка «Убрать» показывается рядом с кнопками. */
  const removeError = !step && save.k === 'error' ? save.message : null;

  return { openPhoto, openLetters, remove, removing, removeError, element };
}

