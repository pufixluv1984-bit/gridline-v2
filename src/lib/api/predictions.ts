import { getSupabase } from '../supabase';

export type PredictionInput = {
  eventId: number;
  qualy: string[] | null; // 3 driverId; null — блок не заполнен (дедлайны по блокам)
  race: string[] | null; // 10 driverId
  sprint: string[] | null; // 3 driverId, только спринт-этапы
  fastestLap: string | null;
  firstDnf: string | null; // driverId или 'none'
  poleWins: boolean | null;
  safetyCar: boolean | null;
  dnfMany: boolean | null;
  boost: 'qualy' | 'race' | 'bonus' | null;
};

/** Отправить или изменить прогноз. Дедлайн, повторы и состав проверяет база. */
export async function savePrediction(p: PredictionInput): Promise<void> {
  const { error } = await getSupabase()
    .from('predictions')
    .upsert(
      {
        event_id: p.eventId,
        qualy: p.qualy,
        race: p.race,
        sprint: p.sprint,
        fastest_lap: p.fastestLap,
        first_dnf: p.firstDnf,
        pole_wins: p.poleWins,
        safety_car: p.safetyCar,
        dnf_many: p.dnfMany,
        boost_block: p.boost,
      },
      { onConflict: 'user_id,event_id' },
    );
  if (!error) return;
  if (error.hint === 'block_closed') throw new Error(error.message);
  if (error.hint === 'deadline_passed' || error.code === '42501') throw new Error('Приём прогнозов на этот этап закрыт.');
  if (error.hint === 'duplicate_driver') throw new Error('Один пилот стоит на двух местах.');
  if (error.hint === 'incomplete') throw new Error('Заполни все места.');
  if (error.hint === 'boost_used') throw new Error('Бустер уже стоит на другом этапе этого окна — один на каждые 5 этапов.');
  if (error.hint === 'unknown_driver') throw new Error('В прогнозе пилот, которого нет в заявке. Обнови страницу.');
  throw new Error('Не получилось отправить. Попробуй ещё раз.');
}
