import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/ui/Modal';
import b from '@/ui/Button.module.css';
import { intlLocale, t } from '@/i18n';

export type Summary = {
  event_id: number;
  round: number;
  name: string;
  predict: number;
  fantasy: number | null;
  provisional: boolean;
  league: { id: string; name: string; rank: number | null; prev_rank: number | null; members: number } | null;
};

const SEEN_KEY = 'gridline.summary.seen';
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};
const fmt = (n: number) => Number(n).toLocaleString(intlLocale(), { maximumFractionDigits: 1 });

/** Макет Overlays, «Итоги этапа»: показывается один раз после того, как этап посчитан. */
export function StageSummary({ summary }: { summary: Summary | null | undefined }) {
  const navigate = useNavigate();
  const [seen, setSeen] = useState(readSeen);
  const [copied, setCopied] = useState(false);
  if (!summary || seen === String(summary.event_id)) return null;

  const total = Number(summary.predict) + Number(summary.fantasy ?? 0);
  const lg = summary.league;
  const moved = lg?.rank && lg.prev_rank ? lg.prev_rank - lg.rank : null;
  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, String(summary.event_id));
    } catch {
      /* без хранилища окно появится снова — не страшно */
    }
    setSeen(String(summary.event_id));
  };
  const share = async () => {
    const text = t('summary.share', { race: summary.name, pts: fmt(total) }) + (lg?.rank ? t('summary.shareLeague', { rank: lg.rank, league: lg.name }) : '');
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* отмена «Поделиться» — ничего не делаем */
    }
  };

  return (
    <Modal
      title={t('summary.title')}
      onClose={close}
      actions={
        <>
          <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={share}>{copied ? t('summary.copied') : t('summary.share.btn')}</button>
          <button type="button" className={`${b.cta} ${b.sm}`} onClick={() => { close(); navigate(lg ? `/league/${lg.id}` : '/breakdown'); }}>
            {lg ? t('summary.toTable') : t('summary.breakdown')}
          </button>
        </>
      }
    >
      <div className="eyebrow" style={{ marginTop: -8 }}>{summary.name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span className="num" style={{ fontSize: 56, fontWeight: 600, lineHeight: 1 }}>+{fmt(total)}</span>
        <span className="mute">{t('common.points')}</span>
        {lg?.rank && (
          <span className={`mv ${moved && moved > 0 ? 'up' : moved && moved < 0 ? 'dn' : 'eq'}`} style={{ marginLeft: 'auto', fontSize: 14 }}>
            {moved && moved > 0 ? '▲' : moved && moved < 0 ? '▼' : ''} {lg.prev_rank && lg.prev_rank !== lg.rank ? `${lg.prev_rank} → ` : ''}{t('summary.place', { rank: lg.rank })}
          </span>
        )}
      </div>
      <div>
        <div className="kvr" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <span>{t('summary.predictions')}</span><b className="num">+{fmt(summary.predict)}</b>
        </div>
        {summary.fantasy != null && (
          <div className="kvr" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <span>{t('summary.fantasy')}</span><b className="num">{Number(summary.fantasy) >= 0 ? '+' : ''}{fmt(summary.fantasy)}</b>
          </div>
        )}
      </div>
      {summary.provisional && <div className="mute" style={{ fontSize: 12.5 }}>{t('summary.provisional')}</div>}
    </Modal>
  );
}
