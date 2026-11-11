import { getSupabase } from '../supabase';

export type PredictionInput = {
  eventId: number;
  qualy: string[]; // 3 driverId
  race: string[]; // 10 driverId
  fastestLap: string | null;
};

/** Отправить или изменить прогноз. Дедлайн, повторы и состав проверяет база. */
export async function savePrediction(p: PredictionInput): Promise<void> {
  const { error } = await getSupabase()
    .from('predictions')
    .upsert(
      { event_id: p.eventId, qualy: p.qualy, race: p.race, fastest_lap: p.fastestLap },
      { onConflict: 'user_id,event_id' },
    );
  if (!error) return;
  if (error.hint === 'deadline_passed' || error.code === '42501') throw new Error('Приём прогнозов закрыт: квалификация уже началась.');
  if (error.hint === 'duplicate_driver') throw new Error('Один пилот стоит на двух местах.');
  if (error.hint === 'incomplete') throw new Error('Заполни все места.');
  if (error.hint === 'unknown_driver') throw new Error('В прогнозе пилот, которого нет в заявке. Обнови страницу.');
  throw new Error('Не получилось отправить. Попробуй ещё раз.');
}
