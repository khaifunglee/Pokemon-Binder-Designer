import { selectSetsToFetch } from '../filter';
import type { DexSetBrief } from '../types';

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
