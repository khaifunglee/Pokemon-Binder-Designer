import { isKnownNonPocketSet, POCKET_SERIES_ID, selectSetsToFetch } from '../filter';
import type { DexSetBrief, DexSetDetail } from '../types';

const brief = (id: string): DexSetBrief => ({ id, name: id, cardCount: { total: 1, official: 1 } });

describe('selectSetsToFetch', () => {
  it('skips known and excluded sets, keeping brief order', () => {
    expect(
      selectSetsToFetch(
        [brief('sv1'), brief('A1'), brief('me06'), brief('P-A')],
        new Set(['sv1']),
        new Set(['A1', 'P-A']),
      ),
    ).toEqual(['me06']);
  });

  it('never returns an excluded set even when it is unknown', () => {
    expect(selectSetsToFetch([brief('A1')], new Set(), new Set(['A1']))).toEqual([]);
  });
});

describe('selectSetsToFetch — edge cases', () => {
  it('returns nothing for an empty set list', () => {
    expect(selectSetsToFetch([], new Set(['sv1']), new Set(['A1']))).toEqual([]);
  });

  it('returns every brief when nothing is known or excluded', () => {
    expect(selectSetsToFetch([brief('sv1'), brief('sv2')], new Set(), new Set())).toEqual([
      'sv1',
      'sv2',
    ]);
  });

  it('drops an id that is both known and excluded', () => {
    expect(selectSetsToFetch([brief('A1'), brief('sv2')], new Set(['A1']), new Set(['A1']))).toEqual([
      'sv2',
    ]);
  });
});

describe('isKnownNonPocketSet', () => {
  const detail = (serie?: { id: string; name: string }): DexSetDetail => ({
    ...brief('x1'),
    serie,
    cards: [],
  });

  it('keeps a set whose series is named and is not TCG Pocket', () => {
    expect(isKnownNonPocketSet(detail({ id: 'sv', name: 'Scarlet & Violet' }))).toBe(true);
  });

  it('rejects a TCG Pocket set', () => {
    expect(isKnownNonPocketSet(detail({ id: POCKET_SERIES_ID, name: 'Pokémon TCG Pocket' }))).toBe(false);
  });

  it('rejects a set with no series, so a Pocket set the series lookup missed cannot slip in', () => {
    expect(isKnownNonPocketSet(detail())).toBe(false);
  });

  it('rejects a set whose series id is empty', () => {
    expect(isKnownNonPocketSet(detail({ id: '', name: '' }))).toBe(false);
  });
});
