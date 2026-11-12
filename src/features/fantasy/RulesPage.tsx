import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CHIPS } from '@/lib/api/fantasy';
import { Content, PageTitle } from '@/ui/Page';
import pg from '@/ui/Page.module.css';
import { FantasyTabs } from './FantasyTabs';
import { t, t as tr } from '@/i18n';

// Правила — по docs/FANTASY-FORMULA.md (главнее текста экрана «Правила» в макете).
const scoring = (): [string, string, string][] => [
  [t('rules.sc1'), t('rules.sc1d'), t('rules.sc1v')],
  [t('rules.sc2'), t('rules.sc2d'), t('rules.sc2v')],
  [t('rules.sc3'), t('rules.sc3d'), t('rules.sc3v')],
  [t('rules.sc4'), t('rules.sc4d'), '+5'],
  [t('rules.sc5'), t('rules.sc5d'), '−10'],
  [t('rules.sc6'), t('rules.sc6d'), '−20'],
  [t('rules.sc7'), t('rules.sc7d'), t('rules.sc7v')],
  [t('rules.sc8'), t('rules.sc8d'), t('rules.sc8v')],
  [t('rules.sc9'), t('rules.sc9d'), '×0.5'],
];
const limits = (): [string, string, string][] => [
  [t('rules.lim1'), t('rules.lim1d'), '$100M'],
  [t('rules.lim2'), t('rules.lim2d'), '5'],
  [t('rules.lim3'), t('rules.lim3d'), '2'],
  [t('rules.lim4'), t('rules.lim4d'), '×2'],
  [t('rules.lim5'), t('rules.lim5d'), 'FP1'],
  [t('rules.lim6'), t('rules.lim6d'), t('rules.lim6v')],
  [t('rules.lim7'), t('rules.lim7d'), '−10'],
  [t('rules.lim8'), t('rules.lim8d'), '±0.6'],
];
const chipRules = (): Record<string, string> => ({
  wildcard: t('rules.chip.wildcard'),
  limitless: t('rules.chip.limitless'),
  final_fix: t('rules.chip.final_fix'),
  autopilot: t('rules.chip.autopilot'),
  no_negative: t('rules.chip.no_negative'),
  extra_drs: t('rules.chip.extra_drs'),
});
const faq = (): [string, string][] => [
  [t('rules.faq1'), t('rules.faq1a')],
  [t('rules.faq2'), t('rules.faq2a')],
  [t('rules.faq3'), t('rules.faq3a')],
  [t('rules.faq4'), t('rules.faq4a')],
  [t('rules.faq5'), t('rules.faq5a')],
  [t('rules.faq6'), t('rules.faq6a')],
];

/** Макет Fantasy-Rules: как играть, очки, ограничения, чипы, вопросы. */
export default function RulesPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <PageTitle title={t('fan.title')} sub={t('fan.tab.rules')} />
      <FantasyTabs action={<Link className={pg.btn} to="/fantasy/squad">{t('fan.editSquad')}</Link>} />
      <Content>
        <section className="card rise" style={{ ['--i' as string]: 0 }}>
          <div className="eyebrow">{t('rules.howTo')}</div>
          <div className="num" style={{ fontSize: 32, fontWeight: 600, margin: '14px 0 22px', letterSpacing: '-.01em' }}>{t('rules.motto')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {[
              [tr('rules.step1'), tr('rules.step1a')],
              [tr('rules.step2'), tr('rules.step2a')],
              [tr('rules.step3'), tr('rules.step3a')],
              [tr('rules.step4'), tr('rules.step4a')],
            ].map(([n, d], i) => (
              <div key={n} className="step">
                <b>{i + 1}</b>
                <div><div style={{ fontWeight: 600 }}>{n}</div><div className="mute" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{d}</div></div>
              </div>
            ))}
          </div>
        </section>

        <div className="row">
          <KvCard i={1} title={t('rules.scoring')} sub={t('rules.scoringSub')} rows={scoring()} />
          <KvCard i={2} title={t('rules.limits')} sub={t('rules.limitsSub')} rows={limits()} />
        </div>

        <section className="card rise" style={{ ['--i' as string]: 3 }}>
          <h2 className="h">{t('fan.sq.chips')}</h2>
          <div className="mute" style={{ fontSize: 14, margin: '6px 0 18px' }}>{t('fan.sq.chipRule')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
            {CHIPS.map((c) => (
              <div key={c.id} className="chipc">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="code act">{c.code}</span><b style={{ fontSize: 16 }}>{c.name}</b></div>
                <div className="mute" style={{ fontSize: 14, lineHeight: 1.55 }}>{chipRules()[c.id]}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card rise" style={{ ['--i' as string]: 4 }}>
          <h2 className="h">{t('rules.faq')}</h2>
          <div style={{ marginTop: 14 }}>
            {faq().map(([q, a], i) => (
              <div key={q} className="kv" style={{ display: 'block', padding: 0 }}>
                <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '16px 0', background: 'none', border: 0, color: 'inherit', font: '600 16px var(--font-text)', textAlign: 'left', cursor: 'pointer' }}>
                  <span>{q}</span><span className="mute" style={{ fontSize: 20 }}>{open === i ? '−' : '+'}</span>
                </button>
                {open === i && <div className="mute" style={{ padding: '0 0 18px', fontSize: 15, lineHeight: 1.6, maxWidth: 820 }}>{a}</div>}
              </div>
            ))}
          </div>
        </section>
      </Content>
    </>
  );
}

function KvCard({ i, title, sub, rows }: { i: number; title: string; sub: string; rows: [string, string, string][] }) {
  return (
    <section className="card rise" style={{ ['--i' as string]: i, flex: '1 1 520px' }}>
      <h2 className="h">{title}</h2>
      <div className="mute" style={{ fontSize: 14, margin: '6px 0 14px' }}>{sub}</div>
      {rows.map(([n, note, v]) => (
        <div key={n} className="kv">
          <span>{n}<span className="mute" style={{ display: 'block', fontSize: 13, marginTop: 3 }}>{note}</span></span>
          <b className="num" style={{ whiteSpace: 'nowrap' }}>{v}</b>
        </div>
      ))}
    </section>
  );
}
