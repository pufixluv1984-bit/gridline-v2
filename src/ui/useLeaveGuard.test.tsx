import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useLeaveGuard } from './useLeaveGuard';

function Page({ dirty }: { dirty: boolean }) {
  const guard = useLeaveGuard(dirty, 'Прогноз не отправлен');
  return (
    <>
      <a href="#/league">Лига</a>
      <a href="#send">К кнопке</a>
      {guard}
    </>
  );
}

describe('предупреждение о неотправленных изменениях', () => {
  afterEach(() => {
    cleanup();
    window.location.hash = '';
  });

  it('без изменений ссылка работает как обычно', () => {
    render(<Page dirty={false} />);
    fireEvent.click(screen.getByText('Лига'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('с изменениями спрашивает: «Остаться» оставляет на месте, «Уйти» уводит', () => {
    window.location.hash = '#/predict';
    render(<Page dirty />);
    fireEvent.click(screen.getByText('Лига'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Прогноз не отправлен');
    fireEvent.click(screen.getByRole('button', { name: 'Остаться' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.hash).toBe('#/predict');
    fireEvent.click(screen.getByText('Лига'));
    fireEvent.click(screen.getByRole('button', { name: 'Уйти без сохранения' }));
    expect(window.location.hash).toBe('#/league');
  });

  it('якорь на этой же странице и закрытие вкладки', () => {
    render(<Page dirty />);
    fireEvent.click(screen.getByText('К кнопке'));
    expect(screen.queryByRole('dialog')).toBeNull();
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
