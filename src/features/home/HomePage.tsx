import { IconCrosshair } from '@/ui/icons';
import { Card, Content, PageTitle, PillLink, PrimaryLink, Toolbar, ToolbarDivider } from '@/ui/Page';
import s from '@/ui/Page.module.css';

/**
 * Главная. В фазе 0 — только каркас: заголовок и панель из макета Main.
 * Блоки (чемпионат, следующий этап, таймер, лига, фэнтези) появятся в фазе 1 из данных базы.
 */
export default function HomePage() {
  return (
    <>
      <PageTitle title="Главная" sub="Сезон 2026" />
      <Toolbar>
        <PrimaryLink to="/predict" icon={<IconCrosshair />}>
          Сделать прогноз
        </PrimaryLink>
        <ToolbarDivider />
        <PillLink to="/" end>
          Главная
        </PillLink>
        <PillLink to="/league">Лига друзей</PillLink>
        <PillLink to="/fantasy">Фэнтези-лига</PillLink>
        <PillLink to="/results">Результаты</PillLink>
        <PillLink to="/schedule">Календарь</PillLink>
      </Toolbar>
      <Content>
        <Card>
          <div className="eyebrow">Gridline v2 · каркас</div>
          <h2 className={s.h} style={{ marginTop: 12 }}>
            Сайт собирается по фазам
          </h2>
          <p className="mute" style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.5, maxWidth: 560 }}>
            Вход и каркас готовы. Прогнозы, лиги, расписание с таймером и рейтинг появятся к Гран-при Лас-Вегаса.
          </p>
        </Card>
      </Content>
    </>
  );
}
