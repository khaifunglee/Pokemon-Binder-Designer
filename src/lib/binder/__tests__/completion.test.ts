import { completionPercent, computeCompletion, entryKey } from '../completion';

const sets = [
  {
    setId: 'sv1',
    entries: [
      { cardId: 'sv1-1', variant: 'normal' },
      { cardId: 'sv1-1', variant: 'reverseHolofoil' },
      { cardId: 'sv1-2', variant: 'holofoil' },
    ],
  },
  {
    setId: 'cel25',
    entries: [{ cardId: 'cel25-1', variant: 'holofoil' }],
  },
];

describe('computeCompletion', () => {
  it('counts owned per variant and lists missing', () => {
    const owned = new Set(['sv1-1::normal', 'cel25-1::holofoil']);
    const prices = new Map([
      ['sv1-1::reverseHolofoil', 0.25],
      ['sv1-2::holofoil', 4.5],
    ]);
    const summary = computeCompletion(sets, owned, prices);

    expect(summary.total).toBe(4);
    expect(summary.ownedCount).toBe(2);
    expect(summary.costUsd).toBeCloseTo(4.75);
    expect(summary.unpricedCount).toBe(0);

    const sv1 = summary.sets[0];
    expect(sv1.ownedCount).toBe(1);
    expect(sv1.missing).toEqual([
      { cardId: 'sv1-1', variant: 'reverseHolofoil' },
      { cardId: 'sv1-2', variant: 'holofoil' },
    ]);
    expect(summary.sets[1].missing).toEqual([]);
  });

  it('tracks unpriced missing entries separately', () => {
    const summary = computeCompletion(sets, new Set(), new Map([['sv1-2::holofoil', 2]]));
    expect(summary.costUsd).toBe(2);
    expect(summary.unpricedCount).toBe(3);
  });

  it('handles empty inputs', () => {
    const summary = computeCompletion([], new Set(), new Map());
    expect(summary).toMatchObject({ total: 0, ownedCount: 0, costUsd: 0 });
  });
});

describe('completionPercent', () => {
  it('rounds and guards zero totals', () => {
    expect(completionPercent(1, 3)).toBe(33);
    expect(completionPercent(3, 3)).toBe(100);
    expect(completionPercent(0, 0)).toBe(0);
  });
});

describe('entryKey', () => {
  it('is stable', () => {
    expect(entryKey({ cardId: 'a', variant: 'normal' })).toBe('a::normal');
  });
});
