import { Card, Content, PageTitle } from '@/ui/Page';
import s from '@/ui/Page.module.css';

/** Заглушка раздела, который делается в следующих фазах (docs/ARCHITECTURE.md, «Фазы»). */
export function SoonPage({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageTitle title={title} sub="Сезон 2026" />
      <Content>
        <Card>
          <div className="eyebrow">Фаза {phase}</div>
          <h2 className={s.h} style={{ marginTop: 12 }}>
            Раздел в работе
          </h2>
          <p className="mute" style={{ margin: '10px 0 0', fontSize: 15 }}>
            Этот экран появится в фазе {phase}.
          </p>
        </Card>
      </Content>
    </>
  );
}
