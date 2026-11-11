import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminSetResult, isSiteAdmin } from '@/lib/api/admin';
import { predictScreen, scheduleScreen, screenKeys } from '@/lib/api/screens';
import { serverNow } from '@/lib/time/useServerNow';
import { DriverTile, Skeleton } from '@/ui/game';
import { IconWarn } from '@/ui/icons';
import { Modal } from '@/ui/Modal';
import { Content, PageTitle } from '@/ui/Page';
import b from '@/ui/Button.module.css';
import m from '@/ui/Modal.module.css';

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

  const save = useMutation({
    mutationFn: () => adminSetResult(ev!.id, session, order, session === 'race' ? fastest || null : null),
    onSuccess: () => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['screen'] });
    },
  });

  if (admin.isLoading) return <><PageTitle title="Админ" sub="Ручной ввод" /><Content><Skeleton h={200} /></Content></>;
  if (!admin.data) {
    return (
      <>
        <PageTitle title="Админ" sub="Ручной ввод" />
        <Content><div className="empty-state"><h3>Только для админа сайта</h3><p>Результаты подтягиваются из Jolpica автоматически.</p></div></Content>
      </>
    );
  }

  const drivers = (roster.data?.drivers ?? []).filter((d) => d.active || order.includes(d.id));
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const toggle = (id: string) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const minCount = session === 'race' ? 10 : 3;

  return (
    <>
      <PageTitle title="Админ" sub="Ручной ввод результата" />
      <Content>
        <section className="card rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 320px' }}>
            <label className="lab" htmlFor="adm-ev">Этап</label>
            <select id="adm-ev" className="in" value={ev?.id ?? ''} onChange={(e) => { setEvId(Number(e.target.value)); setOrder([]); setFastest(''); save.reset(); }}>
              {started.map((e) => <option key={e.id} value={e.id}>{e.round}. {e.name}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <span className="lab">Сессия</span>
            <div className="seg2" role="group">
              <button type="button" className={session === 'qualy' ? 'on' : ''} onClick={() => { setSession('qualy'); save.reset(); }}>Квалификация</button>
              <button type="button" className={session === 'race' ? 'on' : ''} onClick={() => { setSession('race'); save.reset(); }}>Гонка</button>
            </div>
          </div>
          <div className="alert info" style={{ flex: '1 1 100%' }}>
            <IconWarn size={18} />
            <div>Нажимай пилотов в порядке финиша: первый клик — P1. Повторный клик убирает пилота. Нужно минимум {minCount}. Результат заменит то, что пришло из Jolpica, станет окончательным, и очки пересчитаются во всех лигах.</div>
          </div>
        </section>

        <div className="row" style={{ alignItems: 'flex-start' }}>
          <section className="card rise" style={{ ['--i' as string]: 1, flex: '2 1 640px', minWidth: 0 }}>
            <h2 className="h">Пилоты</h2>
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
            <h2 className="h">Порядок · {order.length}</h2>
            <ol style={{ margin: 0, paddingLeft: 26, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {order.map((id) => <li key={id} className="num">{byId.get(id)?.name ?? id}</li>)}
            </ol>
            {session === 'race' && (
              <div>
                <label className="lab" htmlFor="adm-fl">Быстрый круг</label>
                <select id="adm-fl" className="in" value={fastest} onChange={(e) => setFastest(e.target.value)}>
                  <option value="">— не указан —</option>
                  {order.map((id) => <option key={id} value={id}>{byId.get(id)?.name ?? id}</option>)}
                </select>
              </div>
            )}
            {save.isSuccess && <div className="alert ok">Сохранено. Строк очков: {save.data}.</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className={`${b.cta} ${b.sm}`} disabled={!ev || order.length < minCount} onClick={() => setConfirm(true)}>Сохранить результат</button>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={() => { setOrder([]); setFastest(''); }} disabled={!order.length}>Сбросить</button>
            </div>
          </section>
        </div>
      </Content>

      {confirm && ev && (
        <Modal
          title="Сохранить результат?"
          icon={<IconWarn size={24} />}
          onClose={() => setConfirm(false)}
          busy={save.isPending}
          actions={
            <>
              <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={() => setConfirm(false)} disabled={save.isPending}>Отмена</button>
              <button type="button" className={`${b.cta} ${b.sm}`} onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</button>
            </>
          }
        >
          <p className={m.text}>
            {ev.name}, {session === 'race' ? 'гонка' : 'квалификация'}: {order.length} пилотов, P1 — {byId.get(order[0]!)?.name}.
            Очки пересчитаются во всех лигах. Ручной результат считается окончательным — синхронизация с Jolpica его не перезапишет.
          </p>
          {save.error && <div className="alert bad" role="alert">{save.error.message}</div>}
        </Modal>
      )}
    </>
  );
}
