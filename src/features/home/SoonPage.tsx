import { Card, Content, PageTitle } from '@/ui/Page';
import s from '@/ui/Page.module.css';
import { t } from '@/i18n';

/** Заглушка раздела, который делается в следующих фазах (docs/ARCHITECTURE.md, «Фазы»). */
export function SoonPage({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageTitle title={title} sub={t('common.season', { year: 2026 })} />
      <Content>
        <Card>
          <div className="eyebrow">{t('soon.phase', { n: phase })}</div>
          <h2 className={s.h} style={{ marginTop: 12 }}>
            {t('soon.title')}
          </h2>
          <p className="mute" style={{ margin: '10px 0 0', fontSize: 15 }}>
            {t('soon.text', { n: phase })}
          </p>
        </Card>
      </Content>
    </>
  );
}
