import { PillLink, Toolbar } from '@/ui/Page';

/** Панель вкладок лобби (макеты Lobby-*). */
export function LobbyTabs({ active, leagueId }: { active: 'create' | 'invite' | 'join'; leagueId?: string }) {
  return (
    <Toolbar>
      <PillLink to="/lobby/create">Создать лобби</PillLink>
      {leagueId && <PillLink to={`/lobby/${leagueId}/invite`}>Пригласить друзей</PillLink>}
      {leagueId && <PillLink to={`/lobby/${leagueId}/waiting`}>Комната ожидания</PillLink>}
      <PillLink to="/lobby/join">Войти по коду</PillLink>
      {leagueId && active !== 'join' && <PillLink to={`/league/${leagueId}`}>Таблица лиги</PillLink>}
    </Toolbar>
  );
}
