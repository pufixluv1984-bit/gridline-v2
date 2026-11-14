import { Link } from 'react-router-dom';
import { Skeleton } from '@/ui/game';
import { Content, PageTitle } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import { t } from '@/i18n';

/** Пока данные лобби грузятся: заглушки вместо пустой формы, которая потом пропадала. */
export function LobbyLoading({ sub }: { sub: string }) {
  return (
    <>
      <PageTitle title={t('common.friendsLeague')} sub={sub} />
      <Content>
        <Skeleton h={140} />
        <Skeleton h={320} />
      </Content>
    </>
  );
}

/**
 * Страницу лобби открыл не участник (обычно ему переслали адрес из строки браузера вместо ссылки-приглашения).
 * Данные лиги база ему не отдаёт — объясняем, что нужно, и ведём ко входу по коду.
 */
export function LobbyNoAccess({ sub }: { sub: string }) {
  return (
    <>
      <PageTitle title={t('common.friendsLeague')} sub={sub} />
      <Content>
        <div className="empty-state">
          <h3>{t('lobby.notMember')}</h3>
          <p>{t('lobby.notMemberText')}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className={`${b.cta} ${b.sm}`} to="/lobby/join">{t('common.joinByCode')}</Link>
            <Link className={`${b.cta} ${b.sm} ${b.ghost}`} to="/league">{t('league.toMine')}</Link>
          </div>
        </div>
      </Content>
    </>
  );
}
