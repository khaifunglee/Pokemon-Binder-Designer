import {
  matchCardInSet,
  numberKey,
  planPlacements,
  resolveSetRef,
} from '../resolve';
import type { CardRef, SetRef } from '../resolve';

const sets: SetRef[] = [
  { id: 'sv1', name: 'Scarlet & Violet', ptcgoCode: 'SVI' },
  { id: 'sv3', name: 'Obsidian Flames', ptcgoCode: 'OBF' },
  { id: 'cel25', name: 'Celebrations', ptcgoCode: 'CEL' },
  { id: 'cel25c', name: 'Celebrations: Classic Collection', ptcgoCode: 'CEL' },
];

describe('numberKey', () => {
  it('strips leading zeros and uppercases', () => {
    expect(numberKey('025')).toBe('25');
    expect(numberKey('25')).toBe('25');
    expect(numberKey('tg12')).toBe('TG12');
    expect(numberKey('0')).toBe('0');
    expect(numberKey('016')).toBe('16');
  });
});

describe('resolveSetRef', () => {
  it('matches ptcgo code case-insensitively', () => {
    expect(resolveSetRef({ setCode: 'svi', setName: null }, sets)?.id).toBe('sv1');
  });

  it('matches API id and set name via the name column', () => {
    expect(resolveSetRef({ setCode: null, setName: 'cel25' }, sets)?.id).toBe('cel25');
    expect(
      resolveSetRef({ setCode: null, setName: 'Obsidian Flames' }, sets)?.id,
    ).toBe('sv3');
    expect(
      resolveSetRef({ setCode: null, setName: 'Celebrations: Classic Collection' }, sets)
        ?.id,
    ).toBe('cel25c');
  });

  it('prefers set code over set name when both present', () => {
    expect(
      resolveSetRef({ setCode: 'OBF', setName: 'Scarlet & Violet' }, sets)?.id,
    ).toBe('sv3');
  });

  it('returns null when nothing matches', () => {
    expect(resolveSetRef({ setCode: 'ZZZ', setName: 'Unknown Set' }, sets)).toBeNull();
    expect(resolveSetRef({ setCode: null, setName: null }, sets)).toBeNull();
  });
});

const cards: CardRef[] = [
  { id: 'cel25-5', name: 'Pikachu', number: '5', variants: ['normal', 'reverseHolofoil'] },
  { id: 'cel25-11', name: 'Mew', number: '11', variants: ['holofoil'] },
  { id: 'cel25-11a', name: 'Mew (Alt)', number: '11a', variants: ['holofoil'] },
];

describe('matchCardInSet', () => {
  it('matches by normalized number', () => {
    const m = matchCardInSet({ name: null, number: '005', variantHint: null }, cards);
    expect(m).toEqual({ status: 'matched', card: cards[0], variant: 'normal' });
  });

  it('uses the variant hint only when the card has that variant', () => {
    const hinted = matchCardInSet(
      { name: null, number: '5', variantHint: 'reverseHolofoil' },
      cards,
    );
    expect(hinted).toMatchObject({ variant: 'reverseHolofoil' });
    const bogus = matchCardInSet(
      { name: null, number: '11', variantHint: 'reverseHolofoil' },
      cards,
    );
    expect(bogus).toMatchObject({ variant: 'holofoil' });
  });

  it('falls back to unique name match without a number', () => {
    expect(
      matchCardInSet({ name: 'Mew', number: null, variantHint: null }, cards),
    ).toMatchObject({ card: cards[1] });
  });

  it('reports no-card and ambiguous', () => {
    expect(
      matchCardInSet({ name: 'Missing', number: null, variantHint: null }, cards),
    ).toEqual({ status: 'no-card' });
    const dupes: CardRef[] = [
      { id: 'x-1', name: 'Twin', number: '1', variants: ['normal'] },
      { id: 'x-1b', name: 'Twin', number: '1', variants: ['normal'] },
    ];
    expect(
      matchCardInSet({ name: 'Twin', number: '1', variantHint: null }, dupes),
    ).toEqual({ status: 'ambiguous' });
  });

  it('disambiguates shared numbers by name', () => {
    const shared: CardRef[] = [
      { id: 'y-1', name: 'Alpha', number: '1', variants: ['normal'] },
      { id: 'y-1x', name: 'Beta', number: '01', variants: ['normal'] },
    ];
    expect(
      matchCardInSet({ name: 'Beta', number: '1', variantHint: null }, shared),
    ).toMatchObject({ card: shared[1] });
  });
});

describe('planPlacements', () => {
  const rows = [
    { cardId: 'a', variant: 'normal', quantity: 1 },
    { cardId: 'a', variant: 'holofoil', quantity: 2 },
    { cardId: 'a', variant: 'normal', quantity: 3 },
    { cardId: 'b', variant: 'normal', quantity: 1 },
  ];

  it('merges same card+variant without stacking', () => {
    expect(planPlacements(rows, false)).toEqual([
      { cardId: 'a', variant: 'normal', quantity: 4 },
      { cardId: 'a', variant: 'holofoil', quantity: 2 },
      { cardId: 'b', variant: 'normal', quantity: 1 },
    ]);
  });

  it('merges per card with stacking on', () => {
    expect(planPlacements(rows, true)).toEqual([
      { cardId: 'a', variant: 'normal', quantity: 6 },
      { cardId: 'b', variant: 'normal', quantity: 1 },
    ]);
  });
});
