import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/lib/api/profile';

const api = vi.hoisted(() => ({
  updateProfile: vi.fn(() => Promise.resolve()),
  finishProfileSetup: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/api/profile', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/profile')>()),
  ...api,
  welcomeScreen: () =>
    Promise.resolve({
      teams: [
        { id: 'ferrari', code: 'FER', name: 'Феррари', color: '#ED1131' },
        { id: 'mclaren', code: 'MCL', name: 'Макларен', color: '#F47600' },
      ],
      drivers: [{ id: 'hamilton', code: 'HAM', name: 'Льюис Хэмилтон', team_name: 'Феррари' }],
    }),
}));

import { Welcome } from './Welcome';

const profile = (x: Partial<Profile> = {}): Profile => ({
  id: 'u1', nickname: 'VOVA', avatar_color: '#3a3a42', avatar_path: null, avatar_text: null, locale: 'ru',
  setup_done_at: null, in_global_ranking: true, fav_driver: null, fav_team: null, nickname_changed_at: null,
  team_name: null, created_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:00:00Z', ...x,
});

const show = (p: Profile) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Welcome profile={p} />
    </QueryClientProvider>,
  );

describe('окно «Добро пожаловать»', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('только пока окно не пройдено и только если база знает отметку', () => {
    show(profile({ setup_done_at: '2026-11-13T00:00:00Z' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    show(profile({ setup_done_at: undefined }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('«Позже» — только отметка, без правок профиля', async () => {
    show(profile());
    expect(await screen.findByRole('dialog')).toHaveTextContent('Добро пожаловать, VOVA');
    fireEvent.click(screen.getByRole('button', { name: 'Позже' }));
    await waitFor(() => expect(api.finishProfileSetup).toHaveBeenCalledOnce());
    expect(api.updateProfile).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('«Готово» сохраняет ник, команду с её цветом и пилота одним запросом', async () => {
    show(profile());
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Ник'), { target: { value: 'Вова 44' } });
    fireEvent.click(await screen.findByRole('radio', { name: 'Феррари' }));
    fireEvent.change(screen.getByLabelText('Любимый пилот'), { target: { value: 'hamilton' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(api.finishProfileSetup).toHaveBeenCalledOnce());
    expect(api.updateProfile).toHaveBeenCalledWith('u1', { nickname: 'Вова 44', fav_team: 'ferrari', fav_driver: 'hamilton', avatar_color: '#ED1131' });
  });

  it('неверный ник не даёт сохранить', async () => {
    show(profile());
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Ник'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Готово' })).toBeDisabled();
  });
});
