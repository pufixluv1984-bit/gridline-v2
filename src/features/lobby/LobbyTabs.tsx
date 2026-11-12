import { PillLink, Toolbar } from '@/ui/Page';
import { t } from '@/i18n';

/** Панель вкладок лобби (макеты Lobby-*). */
export function LobbyTabs({ active, leagueId }: { active: 'create' | 'invite' | 'join'; leagueId?: string }) {
  return (
    <Toolbar>
      <PillLink to="/lobby/create">{t('lobby.create')}</PillLink>
      {leagueId && <PillLink to={`/lobby/${leagueId}/invite`}>{t('lobby.inviteSub')}</PillLink>}
      {leagueId && <PillLink to={`/lobby/${leagueId}/waiting`}>{t('lobby.waitingSub')}</PillLink>}
      <PillLink to="/lobby/join">{t('lobby.joinSub')}</PillLink>
      {leagueId && active !== 'join' && <PillLink to={`/league/${leagueId}`}>{t('lobby.leagueTable')}</PillLink>}
    </Toolbar>
  );
}
