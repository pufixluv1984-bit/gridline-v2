import { useQuery } from '@tanstack/react-query';
import { clientErrors, isSiteAdmin } from '@/lib/api/admin';
import { formatDateTime } from '@/lib/time/format';
import { Skeleton } from '@/ui/game';
import { Content, PageTitle } from '@/ui/Page';
import { t } from '@/i18n';

/** Админ: журнал ошибок сайта (миграция 0026) — что и у кого падало за 30 дней. */
export default function AdminErrorsPage() {
  const admin = useQuery({ queryKey: ['is-admin'], queryFn: isSiteAdmin, staleTime: Infinity });
  const q = useQuery({ queryKey: ['admin', 'errors'], queryFn: clientErrors, enabled: admin.data === true });

  if (admin.isLoading) return <><PageTitle title={t('adm.title')} sub={t('adm.errors')} /><Content><Skeleton h={200} /></Content></>;
  if (!admin.data) {
    return (
      <>
        <PageTitle title={t('adm.title')} sub={t('adm.errors')} />
        <Content><div className="empty-state"><h3>{t('adm.only')}</h3></div></Content>
      </>
    );
  }

  const rows = q.data ?? [];
  return (
    <>
      <PageTitle title={t('adm.title')} sub={t('adm.errors')} />
      <Content>
        <section className="card rise">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
            <h2 className="h">{t('adm.errors')}</h2>
            <span className="mute" style={{ fontSize: 13 }}>{t('adm.errorsNote')}</span>
          </div>
          {q.isLoading ? (
            <Skeleton h={160} />
          ) : q.error ? (
            <div className="alert bad" role="alert">{(q.error as Error).message}</div>
          ) : !rows.length ? (
            <div className="empty-state"><h3>{t('adm.errorsNone')}</h3></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((r) => (
                <details key={r.id} className="slot" style={{ display: 'block', padding: '12px 16px' }}>
                  <summary style={{ cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'baseline' }}>
                    <span className="mute num" style={{ fontSize: 12 }}>{formatDateTime(r.at)}</span>
                    <span className={`chip ${r.kind === 'crash' ? 'red' : ''}`}>{t(`adm.kind.${r.kind}`)}</span>
                    <b style={{ fontWeight: 600, fontSize: 14, wordBreak: 'break-word', flex: '1 1 320px' }}>{r.message}</b>
                    <span className="mute" style={{ fontSize: 12 }}>
                      {r.path ?? '/'} · {r.nickname ?? t('adm.guest')} · {(r.release ?? 'dev').slice(0, 7)}
                    </span>
                  </summary>
                  {r.agent && <div className="mute" style={{ fontSize: 12, marginTop: 10 }}>{r.agent}</div>}
                  {r.stack && (
                    <pre style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-soft)' }}>{r.stack}</pre>
                  )}
                </details>
              ))}
            </div>
          )}
        </section>
      </Content>
    </>
  );
}
