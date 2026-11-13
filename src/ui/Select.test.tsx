import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

const OPTIONS = [
  { value: '', label: 'Не выбран' },
  { value: 'ham', label: 'Льюис Хэмилтон', sub: 'Феррари' },
  { value: 'lec', label: 'Шарль Леклер', sub: 'Феррари' },
  { value: 'nor', label: 'Ландо Норрис', sub: 'Макларен' },
];

function Demo({ spy }: { spy: (v: string) => void }) {
  const [v, setV] = useState('');
  return <Select aria-label="Пилот" value={v} options={OPTIONS} onChange={(x) => { setV(x); spy(x); }} />;
}

describe('Select', () => {
  afterEach(cleanup);

  it('открывается по клику, выбирает пункт и закрывается', () => {
    const spy = vi.fn();
    render(<Demo spy={spy} />);
    const box = screen.getByRole('combobox', { name: 'Пилот' });
    expect(box).toHaveTextContent('Не выбран');
    fireEvent.click(box);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Ландо Норрис/ }));
    expect(spy).toHaveBeenCalledWith('nor');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box).toHaveTextContent('Ландо Норрис');
  });

  it('клавиатура: стрелки, первая буква, Enter; Esc закрывает без выбора', () => {
    const spy = vi.fn();
    render(<Demo spy={spy} />);
    const box = screen.getByRole('combobox');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Хэмилтон/ }).className).toMatch(/hi/);
    fireEvent.keyDown(box, { key: 'ш' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith('lec');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('клик мимо закрывает', () => {
    render(<Demo spy={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
