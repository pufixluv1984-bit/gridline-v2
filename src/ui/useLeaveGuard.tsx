import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import b from './Button.module.css';
import m from './Modal.module.css';
import { t } from '@/i18n';

/**
 * Предупреждение о неотправленных изменениях (прогноз, фэнтези-состав).
 * - Закрытие или перезагрузка вкладки — системный вопрос браузера (beforeunload).
 * - Переход по ссылке внутри сайта (меню, вкладки, кнопки-ссылки) — наше окно «Остаться / Уйти без сохранения».
 * Кнопку «назад» браузера HashRouter перехватить не даёт — там окна нет.
 */
export function useLeaveGuard(active: boolean, text: string) {
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // В фазе захвата, раньше React Router: ссылка не успеет сменить экран.
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank') return;
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('#/') || href === window.location.hash) return;
      e.preventDefault();
      e.stopPropagation();
      setTo(href);
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [active]);

  const element = to ? (
    <Modal
      title={t('leave.title')}
      onClose={() => setTo(null)}
      actions={
        <>
          <button
            type="button"
            className={`${b.cta} ${b.sm} ${b.ghost}`}
            onClick={() => {
              const target = to;
              setTo(null);
              window.location.hash = target.slice(1);
            }}
          >
            {t('leave.go')}
          </button>
          <button type="button" className={`${b.cta} ${b.sm}`} onClick={() => setTo(null)}>
            {t('leave.stay')}
          </button>
        </>
      }
    >
      <p className={m.text}>{text}</p>
    </Modal>
  ) : null;

  return element;
}
