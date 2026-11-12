import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PredictScreen } from '@/lib/api/screens';

// Экран прогноза рендерится целиком: ловит ошибки порядка объявлений и падения при разборе данных,
// которые не видят типы и линтер (сбой 12.11.2026 при загрузке сохранённого прогноза).
const future = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const drivers = ['norris', 'piastri', 'max_verstappen', 'russell', 'leclerc', 'hamilton', 'albon', 'sainz', 'gasly', 'alonso', 'antonelli'].map((id, i) => ({
  id, code: id.slice(0, 3).toUpperCase(), name: `Пилот ${id}`, number: i + 1, active: true,
  team_id: 'mclaren', team_code: 'MCL', team_name: 'Макларен', color: '#ff8000',
}));

let current: PredictScreen;
vi.mock('@/lib/api/screens', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/screens')>()),
  predictScreen: () => Promise.resolve(current),
}));
vi.mock('@/lib/time/useServerNow', () => ({ useServerNow: () => Date.now(), serverNow: () => Date.now() }));

import PredictPage from './PredictPage';

function screenData(split: boolean, withPrediction: boolean): PredictScreen {
  return {
    event: {
      id: 1, round: 22, name: 'Гран-при Катара', slug: 'lusail', country: 'Катар', circuit: 'Lusail', is_sprint: split,
      status: 'scheduled', deadline: future(24), season_rounds: 24, split_deadlines: split,
      deadlines: { qualy: future(24), sprint: split ? future(30) : null, race: future(48) }, next_deadline: future(24),
      sessions: [],
    },
    drivers,
    prediction: withPrediction
      ? { qualy: ['norris', 'piastri', 'russell'], race: drivers.slice(0, 10).map((d) => d.id), sprint: null, fastest_lap: 'norris', updated_at: future(-1) }
      : null,
    league: null,
    submissions: [],
    boost_used: null,
    last: null,
    notices: [],
  } as unknown as PredictScreen;
}

async function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PredictPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.findByText('Твой прогноз');
}

describe('PredictPage', () => {
  afterEach(cleanup);

  it('по-старому, с сохранённым прогнозом', async () => {
    current = screenData(false, true);
    expect(await renderPage()).toBeInTheDocument();
  });

  it('по блокам, спринт-этап, без прогноза', async () => {
    current = screenData(true, false);
    expect(await renderPage()).toBeInTheDocument();
    expect(await screen.findByText(/Спринт · топ-3/)).toBeInTheDocument();
  });
});
