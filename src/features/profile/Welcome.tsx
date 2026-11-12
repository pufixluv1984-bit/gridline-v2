import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { teamLogo, type TeamCode } from '@/lib/assets';
import { updateProfile, type Profile } from '@/lib/api/profile';
import { getSupabase } from '@/lib/supabase';
import { Modal } from '@/ui/Modal';
import b from '@/ui/Button.module.css';
import m from '@/ui/Modal.module.css';

const DONE_KEY = 'gridline.welcome.done';
const readDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
};

type Team = { id: string; code: string; name: string; color: string };

/** Макет Overlays, «Добро пожаловать»: при первом входе выбрать любимую команду (цвет профиля). */
export function Welcome({ profile }: { profile: Profile | null | undefined }) {
  const qc = useQueryClient();
  const [done, setDone] = useState(readDone);
  const [pick, setPick] = useState<string | null>(null);
  const show = !!profile && !profile.fav_team && !done;
  const teams = useQuery({
    queryKey: ['teams', 'current'],
    queryFn: async () => {
      const { data, error } = await getSupabase().from('teams' as never).select('id, code, name, color').order('name');
      if (error) throw error;
      return data as unknown as Team[];
    },
    enabled: show,
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: (t: Team) => updateProfile(profile!.id, { fav_team: t.id, avatar_color: t.color }),
    onSuccess: () => {
      finish();
      void qc.invalidateQueries({ queryKey: ['profile'] });
      void qc.invalidateQueries({ queryKey: ['screen'] });
    },
  });
  if (!show) return null;

  function finish() {
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* без хранилища окно появится снова, пока команда не выбрана */
    }
    setDone(true);
  }
  const chosen = teams.data?.find((t) => t.id === pick) ?? null;

  return (
    <Modal
      title={`Добро пожаловать, ${profile!.nickname}`}
      onClose={finish}
      busy={save.isPending}
      actions={
        <>
          <button type="button" className={`${b.cta} ${b.sm} ${b.ghost}`} onClick={finish} disabled={save.isPending}>Позже</button>
          <button type="button" className={`${b.cta} ${b.sm}`} disabled={!chosen || save.isPending} onClick={() => chosen && save.mutate(chosen)}>
            {save.isPending ? 'Сохраняем…' : 'Готово'}
          </button>
        </>
      }
    >
      <p className={m.text}>Выбери любимую команду: от неё зависит цвет профиля и плитки в таблице. Потом можно поменять в профиле.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }} role="radiogroup" aria-label="Любимая команда">
        {(teams.data ?? []).map((t) => {
          const logo = teamLogo(t.code as TeamCode);
          const on = pick === t.id;
          return (
            <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setPick(t.id)}
              className={`slot ${on ? 'act' : ''}`}
              style={{ flexDirection: 'column', gap: 8, padding: '12px 8px', textAlign: 'center', borderColor: on ? t.color : undefined }}>
              {logo ? <img src={logo} alt="" width={36} height={36} style={{ objectFit: 'contain' }} /> : <i style={{ width: 36, height: 36, borderRadius: 10, background: t.color }} />}
              <b style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</b>
            </button>
          );
        })}
      </div>
      {save.error && <div className="alert bad" role="alert">{save.error.message}</div>}
    </Modal>
  );
}
