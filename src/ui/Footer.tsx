import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dataUpdatedAt } from '@/lib/api/screens';
import { env } from '@/lib/env';
import { ago } from '@/lib/time/format';
import { useServerNow } from '@/lib/time/useServerNow';
import { IconFlagBold } from './icons';
import s from './Footer.module.css';

// Контакты автора (docs/PRODUCT.md, «Решено ещё»).
const TELEGRAM = 'https://t.me/pufixluv';
const X = 'https://x.com/pufixluv';
const VERSION = 'v0.1';
/** Статическая страница public/privacy.html (её же указываем в Google Auth Platform). */
export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy.html`;

function Author() {
  return (
    <>
      Сделано <b>pufixluv</b> для друзей ·{' '}
      <a href={TELEGRAM} target="_blank" rel="noreferrer">
        Telegram
      </a>{' '}
      ·{' '}
      <a href={X} target="_blank" rel="noreferrer">
        X
      </a>{' '}
      · {VERSION} · сезон 2026
    </>
  );
}

/** Полный футер — на экранах с боковой панелью. Текст про неофициальный проект обязателен (правило 10). */
export function Footer() {
  return (
    <footer className={s.foot}>
      <div className={s.top}>
        <div className={s.brand}>
          <div className={s.logo}>
            <span className={s.mark}>
              <IconFlagBold size={18} />
            </span>
            Gridline
          </div>
          <div className={s.tag}>
            Игра прогнозов и фэнтези-лига по Формуле-1 для друзей и компаний. Играем на выходных, без рекламы и денег.
          </div>
          <DataFreshness />
        </div>
        <nav className={s.cols} aria-label="Ссылки в подвале">
          <div className={s.col}>
            <div className={s.colHead}>Игра</div>
            <Link to="/predict">Прогноз этапа</Link>
            <Link to="/league">Лига друзей</Link>
            <Link to="/rules">Правила начисления</Link>
          </div>
          <div className={s.col}>
            <div className={s.colHead}>Фэнтези</div>
            <Link to="/fantasy/squad">Мой состав</Link>
            <Link to="/fantasy/market">Рынок</Link>
            <Link to="/fantasy">Лидерборд</Link>
            <Link to="/fantasy/rules">Правила и гайд</Link>
          </div>
          <div className={s.col}>
            <div className={s.colHead}>Календарь</div>
            <Link to="/schedule">Расписание</Link>
            <Link to="/results">Результаты</Link>
            <Link to="/tracks">Трассы</Link>
          </div>
          <div className={s.col}>
            <div className={s.colHead}>Проект</div>
            <Link to="/settings">Профиль и настройки</Link>
            <Link to="/lobby/create">Создать лобби</Link>
            <a href={TELEGRAM} target="_blank" rel="noreferrer">
              Предложить идею или сообщить о баге
            </a>
            <a href={PRIVACY_URL}>Политика конфиденциальности</a>
          </div>
        </nav>
      </div>
      <div className={s.bottom}>
        <p>
          Gridline — неофициальный фан-проект о Формуле-1. Он не связан с Formula 1, FIA и командами и не является их
          продуктом. Названия, логотипы и фотографии принадлежат их владельцам и используются только в информационных
          целях. Сайт некоммерческий и сделан для друзей-болельщиков.
        </p>
        <p>Данные результатов и календаря: Jolpica F1 API.</p>
        <p className={s.by}>
          <Author />
        </p>
      </div>
    </footer>
  );
}

/** Макет Main: «Данные F1 обновлены N минут назад» — время последней успешной синхронизации. */
function DataFreshness() {
  const q = useQuery({ queryKey: ['data-updated-at'], queryFn: dataUpdatedAt, enabled: env.supabaseConfigured, staleTime: 5 * 60_000 });
  const now = useServerNow();
  if (!q.data) return null;
  return (
    <span className={s.pill}>
      <i aria-hidden="true" />
      Данные F1 обновлены {ago(q.data, now)}
    </span>
  );
}

/** Тонкий футер — на экранах входа и ошибок. */
export function MiniFooter({ center = false }: { center?: boolean }) {
  return (
    <footer className={`${s.mini} ${center ? s.miniCenter : ''}`}>
      <span>Gridline — неофициальный фан-проект о Формуле-1, не связан с Formula 1, FIA и командами</span>
      <span className={s.miniRight}>
        <span>
          Сделано <b style={{ color: '#b4b4bc', fontWeight: 600 }}>pufixluv</b> · {VERSION}
        </span>
        <a href={PRIVACY_URL}>Конфиденциальность</a>
        <a href={TELEGRAM} target="_blank" rel="noreferrer">
          Сообщить о баге
        </a>
      </span>
    </footer>
  );
}
