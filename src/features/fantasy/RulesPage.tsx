import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CHIPS } from '@/lib/api/fantasy';
import { Content, PageTitle } from '@/ui/Page';
import pg from '@/ui/Page.module.css';
import { FantasyTabs } from './FantasyTabs';

// Правила — по docs/FANTASY-FORMULA.md (главнее текста экрана «Правила» в макете).
const SCORING: [string, string, string][] = [
  ['Место в гонке', '1-е место — 25, затем 18, 15, 12, 10, 8, 6, 4, 2, 1', 'до 25'],
  ['Место в квалификации', '1-е место — 10, затем 9, 8 … 1 за 10-е', 'до 10'],
  ['Позиции со старта', 'По решётке после штрафов, старт с пит-лейн — как 20-е место', '±1, до ±8'],
  ['Быстрый круг', 'Только если пилот финишировал в топ-10', '+5'],
  ['Сход', 'Не классифицирован (прошёл меньше 90% дистанции)', '−10'],
  ['Дисквалификация', 'Пилоту −20 и конструктору ещё −20', '−20'],
  ['Спринт', 'Места 8-7-6-5-4-3-2-1, позиции ±1 до ±5, сход −5', 'до 8'],
  ['Конструктор', 'Сумма двух пилотов; оба в Q3 +5, один +2, оба вылетели в Q1 −3', 'сумма'],
  ['Короткая гонка', 'Пройдено меньше 75% дистанции — очки за места пополам', '×0.5'],
];
const LIMITS: [string, string, string][] = [
  ['Бюджет', 'Цены меняются после каждого этапа', '$100M'],
  ['Пилоты в составе', 'Из любых команд', '5'],
  ['Конструкторы в составе', 'Любые два', '2'],
  ['DRS-буст', 'Один пилот на этап; не выбрали — прошлый, иначе самый дорогой', '×2'],
  ['Закрытие составов', 'Со стартом первой сессии уик-энда (FP1 или спринт-квалификации)', 'FP1'],
  ['Бесплатные замены', 'Первая сборка — без ограничений, перед вторым этапом 2, потом +1 за этап, копится до двух', 'до 2'],
  ['Штраф за замену', 'Каждая сверх бесплатных; считаются по итогу, вернуть обратно — бесплатно', '−10'],
  ['Цены', 'По очкам на миллион за 3 этапа: недорогие ±0.6, дорогие ±0.3; не ниже $3M', '±0.6'],
];
const CHIP_RULES: Record<string, string> = {
  wildcard: 'Любые замены на этапе без штрафа. Не на первом этапе.',
  limitless: 'Один этап без лимита бюджета и штрафов, потом возвращается прежний состав. Не на первом этапе.',
  final_fix: 'Одна замена пилота после закрытия составов и до старта гонки, в пределах бюджета. Не на первом этапе.',
  autopilot: 'DRS ×2 автоматически получает лучший по очкам пилот состава.',
  no_negative: 'Все минусовые строки пилотов и конструкторов обнуляются (штраф за замены остаётся).',
  extra_drs: 'Пилот с DRS-бустом получает ×3 вместо ×2.',
};
const FAQ: [string, string][] = [
  ['Когда закрывается состав?', 'Со стартом первой сессии уик-энда — FP1 (или спринт-квалификации). Так нельзя подстроиться под практику. Точное время — на экранах «Мой состав» и «Рынок».'],
  ['Что будет, если пилот сойдёт?', 'Он получит −10 за сход и потеряет позиции со старта (не больше −8). Очки второго пилота у конструктора остаются. DRS ×2 на сошедшем умножает и минус.'],
  ['Пилота заменил резервист — что со слотом?', 'Замену можно поставить бесплатно до закрытия. Если не успели, сайт сам засчитает очки резервиста его команды.'],
  ['Меняются ли цены?', 'Да, после каждого этапа, когда результат стал окончательным. Изменение и причина видны на экране «Рынок».'],
  ['Что если не успел собрать состав?', 'Остаётся состав прошлого этапа, DRS переносится на того же пилота. Чип на такой этап не включается.'],
  ['Можно ли играть в обе игры сразу?', 'Да. Прогнозы и фэнтези считаются отдельно; лига в режиме «Оба» ведёт две таблицы.'],
];

/** Макет Fantasy-Rules: как играть, очки, ограничения, чипы, вопросы. */
export default function RulesPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <PageTitle title="Фэнтези-лига" sub="Правила и гайд" />
      <FantasyTabs action={<Link className={pg.btn} to="/fantasy/squad">Изменить состав</Link>} />
      <Content>
        <section className="card rise" style={{ ['--i' as string]: 0 }}>
          <div className="eyebrow">Как играть</div>
          <div className="num" style={{ fontSize: 32, fontWeight: 600, margin: '14px 0 22px', letterSpacing: '-.01em' }}>Собери состав, поставь ×2, не потрать лишнего</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {[
              ['Собери состав', '5 пилотов и 2 конструктора на бюджет $100M.'],
              ['Назначь DRS ×2', 'Один пилот получает удвоенные очки этапа.'],
              ['Следи за заменами', 'Бесплатные копятся до двух, каждая лишняя −10 очков.'],
              ['Включи чип', 'Каждый чип можно использовать один раз за сезон.'],
            ].map(([t, d], i) => (
              <div key={t} className="step">
                <b>{i + 1}</b>
                <div><div style={{ fontWeight: 600 }}>{t}</div><div className="mute" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{d}</div></div>
              </div>
            ))}
          </div>
        </section>

        <div className="row">
          <KvCard i={1} title="Как считаются очки" sub="Очки пилота и конструктора за этап" rows={SCORING} />
          <KvCard i={2} title="Состав и бюджет" sub="Ограничения, которые проверяет база" rows={LIMITS} />
        </div>

        <section className="card rise" style={{ ['--i' as string]: 3 }}>
          <h2 className="h">Чипы</h2>
          <div className="mute" style={{ fontSize: 14, margin: '6px 0 18px' }}>Один чип за этап, каждый — один раз за сезон. Отменить можно до закрытия составов.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
            {CHIPS.map((c) => (
              <div key={c.id} className="chipc">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="code act">{c.code}</span><b style={{ fontSize: 16 }}>{c.name}</b></div>
                <div className="mute" style={{ fontSize: 14, lineHeight: 1.55 }}>{CHIP_RULES[c.id]}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card rise" style={{ ['--i' as string]: 4 }}>
          <h2 className="h">Частые вопросы</h2>
          <div style={{ marginTop: 14 }}>
            {FAQ.map(([q, a], i) => (
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
