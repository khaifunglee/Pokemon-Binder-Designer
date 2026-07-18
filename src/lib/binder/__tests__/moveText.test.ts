import { describeInstruction, locate } from '../moveText';

const names = new Map<number, string>([
  [0, 'Pikachu'],
  [4, 'Mew'],
  [5, 'Eevee'],
  [10, 'Snorlax'],
]);
const nameAt = (o: number) => names.get(o) ?? `card@${o}`;

describe('locate', () => {
  it('is 1-based across pages', () => {
    expect(locate(0, 9)).toBe('page 1, pocket 1');
    expect(locate(8, 9)).toBe('page 1, pocket 9');
    expect(locate(9, 9)).toBe('page 2, pocket 1');
    expect(locate(10, 4)).toBe('page 3, pocket 3');
  });
});

describe('describeInstruction', () => {
  it('phrases single moves', () => {
    expect(
      describeInstruction({ kind: 'place', from: 10, to: 0 }, 9, nameAt).title,
    ).toBe('Move Snorlax: page 2, pocket 2 → page 1, pocket 1');
  });

  it('phrases shifts with the safe starting end', () => {
    const right = describeInstruction(
      { kind: 'shift', fromStart: 3, fromEnd: 6, offset: 1 },
      9,
      nameAt,
    );
    expect(right.title).toBe('Page 1: shift pockets 4–7 right by one');
    expect(right.details?.[0]).toContain('pocket 7');

    const left = describeInstruction(
      { kind: 'shift', fromStart: 3, fromEnd: 6, offset: -1 },
      9,
      nameAt,
    );
    expect(left.title).toBe('Page 1: shift pockets 4–7 left by one');
    expect(left.details?.[0]).toContain('pocket 4');
  });

  it('phrases swaps', () => {
    expect(describeInstruction({ kind: 'swap', a: 0, b: 4 }, 9, nameAt).title).toBe(
      'Swap Pikachu (page 1, pocket 1) with Mew (page 1, pocket 5)',
    );
  });

  it('walks a ring with one card in hand', () => {
    const text = describeInstruction(
      { kind: 'swapCycle', ring: [0, 4, 5] },
      9,
      nameAt,
    );
    expect(text.title).toBe('Rotate 3 cards (keep one in hand)');
    expect(text.details).toEqual([
      'Take Pikachu out of page 1, pocket 1 and hold it.',
      'Put Pikachu into page 1, pocket 5, taking out Mew.',
      'Put Mew into page 1, pocket 6, taking out Eevee.',
      'Put Eevee into page 1, pocket 1 — it\'s empty now.',
    ]);
  });
});
