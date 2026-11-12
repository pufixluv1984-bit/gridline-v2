import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminSetResult, adminSetSafetyCar, isSiteAdmin } from '@/lib/api/admin';
import { predictScreen, scheduleScreen, screenKeys } from '@/lib/api/screens';
import { serverNow } from '@/lib/time/useServerNow';
import { DriverTile, Skeleton } from '@/ui/game';
import { IconWarn } from '@/ui/icons';
import { Modal } from '@/ui/Modal';
import { Content, PageTitle } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import m from '@/ui/Modal.module.css';
import { t } from '@/i18n';
import { SESSION_NAMES } from '@/lib/time/format';

/**
 * Ручной ввод результата при сбое Jolpica — только админ сайта (решение владельца, PRODUCT.md §7).
 * Права проверяет база (admin_set_result); экран лишь собирает порядок пилотов.
 * Отдельного макета нет — собран из элементов Predict и Results.
 */
export default function AdminResultsPage() {
  const qc = useQueryClient();
  const admin = useQuery({ queryKey: ['is-admin'], queryFn: isSiteAdmin, staleTime: Infinity });
  const schedule = useQuery({ queryKey: screenKeys.schedule(), queryFn: scheduleScreen });
  const now = serverNow();
  const started = (schedule.data?.events ?? []).filter((e) => e.deadline && Date.parse(e.deadline) < now);
  const [evId, setEvId] = useState<number | null>(null);
  const ev = started.find((e) => e.id === evId) ?? started[started.length - 1] ?? null;
  const roster = useQuery({ queryKey: ['admin-roster', ev?.id], queryFn: () => predictScreen(ev!.id), enabled: !!ev });
  const [session, setSession] = useState<'race' | 'qualy'>('race');
  const [order, setOrder] = useState<string[]>([]);
  const [fastest, setFastest] = useState<string>('');
  const [confirm, setConfirm] = useState(false);

  const sc = useMutation({
    mutationFn: (value: boolean) => adminSetSafetyCar(ev!.id, value),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['screen'] }),
  });

  const save = useMutation({
    mutationFn: () => adminSetResult(ev!.id, session, order, session === 'race' ? fastest || null : null),
    onSuccess: () => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['screen'] });
    },
  });

  if (admin.isLoading) return <><PageTitle title={t('adm.title')} sub={t('adm.manual')} /><Content><Skeleton h={200} /></Content></>;
  if (!admin.data) {
    return (
      <>
        <PageTitle title={t('adm.title')} sub={t('adm.manual')} />
        <Content><div className="empty-state"><h3>{t('adm.only')}</h3><p>{t('adm.onlyText')}</p></div></Content>
      </>
    );
  }

  const drivers = (roster.data?.drivers ?? []).filter((d) => d.active || order.includes(d.id));
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const toggle = (id: string) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const minCount = session === 'race' ? 10 : 3;

  return (
    <>
      <PageTitle title={t('adm.title')} sub={t('adm.manualResult')} />
      <Content>
        <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 320px' }}>
            <label className="lab" htmlFor="adm-ev">{t('adm.event')}</label>
            <select id="adm-ev" className="in" value={ev?.id ?? ''} onChange={(e) => { setEvId(Number(e.target.value)); setOrder([]); setFastest(''); save.reset(); }}>
              {started.map((e) => <option key={e.id} value={e.id}>{e.round}. {e.name}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <span className="lab">{t('adm.session')}</span>
            <div className="seg2" role="group">
              <button type="button" className={session === 'qualy' ? 'on' : ''} onClick={() => { setSession('qualy'); save.reset(); }}>{SESSION_NAMES.qualy}</button>
              <button type="button" className={session === 'race' ? 'on' : ''} onClick={() => { setSession('race'); save.reset(); }}>{SESSION_NAMES.race}</button>
            </div>
          </div>
          <div className="alert info" style={{ flex: '1 1 100%' }}>
            <IconWarn size={18} />
            <div>{t('adm.help', { n: minCount })}</div>
          </div>
        </section>

        <section className="card rise" style={{ ['--i' as string]: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <h2 className="h">{t('adm.sc')}</h2>
            <div className="mute" style={{ fontSize: 13, marginTop: 4 }}>{t('adm.scHelp')}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} disabled={!ev || sc.isPending} onClick={() => sc.mutate(true)}>{t('adm.was')}</button>
            <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} disabled={!ev || sc.isPending} onClick={() => sc.mutate(false)}>{t('adm.wasNot')}</button>
            {sc.isSuccess && <span className="chip green">{t('adm.savedSc', { v: sc.variables ? t('adm.wasLow') : t('adm.wasNotLow') })}</span>}
            {sc.error && <span className="chip red">{sc.error.message}</span>}
          </div>
        </section>

        <div className="row" style={{ alignItems: 'flex-start' }}>
          <section className="card rise" style={{ ['--i' as string]: 2, flex: '2 1 640px', minWidth: 0 }}>
            <h2 className="h">{t('adm.drivers')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 10, marginTop: 16 }}>
              {drivers.map((d) => {
                const pos = order.indexOf(d.id);
                return (
                  <button key={d.id} type="button" className={`slot ${pos >= 0 ? 'act' : ''}`} style={{ flexDirection: 'column', textAlign: 'center', padding: '12px 8px', gap: 6 }} onClick={() => toggle(d.id)}>
                    <DriverTile driver={d} size={52} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{d.code}</div>
                    <div className="num" style={{ fontSize: 12, color: 'var(--gold)', minHeight: 14 }}>{pos >= 0 ? `P${pos + 1}` : ''}</div>
                  </button>
                );
              })}
              {roster.isLoading && <Skeleton h={120} />}
            </div>
          </section>

          <section className="card rise" style={{ ['--i' as string]: 2, flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="h">{t('adm.order', { n: order.length })}</h2>
            <ol style={{ margin: 0, paddingLeft: 26, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {order.map((id) => <li key={id} className="num">{byId.get(id)?.name ?? id}</li>)}
            </ol>
            {session === 'race' && (
              <div>
                <label className="lab" htmlFor="adm-fl">{t('adm.fl')}</label>
                <select id="adm-fl" className="in" value={fastest} onChange={(e) => setFastest(e.target.value)}>
                  <option value="">{t('adm.flNone')}</option>
                  {order.map((id) => <option key={id} value={id}>{byId.get(id)?.name ?? id}</option>)}
                </select>
              </div>
            )}
            {save.isSuccess && <div className="alert ok">{t('adm.saved', { n: save.data })}</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className={`${b.cta} ${b.sm}`} disabled={!ev || order.length < minCount} onClick={() => setConfirm(true)}>{t('adm.save')}</button>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={() => { setOrder([]); setFastest(''); }} disabled={!order.length}>{t('adm.reset')}</button>
            </div>
          </section>
        </div>
      </Content>

      {confirm && ev && (
        <Modal
          title={t('adm.confirm')}
          icon={<IconWarn size={24} />}
          onClose={() => setConfirm(false)}
          busy={save.isPending}
          actions={
            <>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={() => setConfirm(false)} disabled={save.isPending}>{t('common.cancel')}</button>
              <button type="button" className={`${b.cta} ${b.sm}`} onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t('common.saving') : t('common.save')}</button>
            </>
          }
        >
          <p className={m.text}>
            {t('adm.confirmText', { ev: ev.name, session: (SESSION_NAMES[session] ?? '').toLowerCase(), n: order.length, p1: byId.get(order[0]!)?.name })}{' '}
            {t('adm.confirmNote')}
          </p>
          {save.error && <div className="alert bad" role="alert">{save.error.message}</div>}
        </Modal>
      )}
    </>
  );
}
