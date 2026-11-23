import { sortVariants } from '../mappers';
import {
  addableVariants,
  isPlaceholderFlagSet,
  mergeVariants,
  priceVariants,
  removableManualVariants,
} from '../variants';

describe('priceVariants', () => {
  it('counts a listed variant even when it has no current price', () => {
    expect(
      priceVariants({
        unit: 'USD',
        updated: 'x',
        normal: {},
        'reverse-holofoil': { marketPrice: null },
      }),
    ).toEqual(['normal', 'reverseHolofoil']);
  });

  it('accepts the legacy short keys (swsh3-136 in 2025-08 used "reverse")', () => {
    expect(priceVariants({ normal: {}, reverse: {} })).toEqual(['normal', 'reverseHolofoil']);
    expect(priceVariants({ holo: {} })).toEqual(['holofoil']);
  });

  it('returns no variants when there is no TCGplayer data', () => {
    expect(priceVariants(undefined)).toEqual([]);
    expect(priceVariants(null)).toEqual([]);
    expect(priceVariants({ unit: 'USD', updated: 'x' })).toEqual([]);
  });

  it('reports unknown keys instead of silently treating them as variants', () => {
    const onUnknownKey = jest.fn();
    expect(priceVariants({ normal: {}, 'mystery-foil': {} }, onUnknownKey)).toEqual(['normal']);
    expect(onUnknownKey).toHaveBeenCalledWith('mystery-foil');
    expect(onUnknownKey).toHaveBeenCalledTimes(1);
  });
});

describe('mergeVariants', () => {
  const merge = (
    flags: string[],
    prices: string[] | null,
    manual: string[] = [],
    inUse: string[] = [],
  ) => mergeVariants({ flags, prices, manual, inUse });

  it('adds the reverse holo the price keys reveal behind placeholder flags (sm1-1)', () => {
    expect(merge(['normal'], ['normal', 'reverseHolofoil'])).toEqual(['normal', 'reverseHolofoil']);
  });

  it('drops a placeholder normal on a holo-only card (xy1-1)', () => {
    expect(merge(['normal'], ['holofoil'])).toEqual(['holofoil']);
  });

  it('keeps agreeing sources unchanged (sv01-001)', () => {
    expect(merge(['normal', 'reverseHolofoil'], ['normal', 'reverseHolofoil'])).toEqual([
      'normal',
      'reverseHolofoil',
    ]);
  });

  it('takes the union when real flags and prices differ', () => {
    expect(merge(['holofoil'], ['holofoil', 'reverseHolofoil'])).toEqual([
      'holofoil',
      'reverseHolofoil',
    ]);
  });

  it('keeps the flags when TCGdex has no prices for the card (sm1-166)', () => {
    expect(merge(['normal'], [])).toEqual(['normal']);
  });

  it('keeps the flags when prices were not checked yet', () => {
    expect(merge(['normal'], null)).toEqual(['normal']);
  });

  it('always includes a manual variant', () => {
    expect(merge(['normal'], [], ['reverseHolofoil'])).toEqual(['normal', 'reverseHolofoil']);
  });

  it('never drops a variant the user owns or has placed', () => {
    expect(merge(['normal'], ['holofoil'], [], ['normal'])).toEqual(['normal', 'holofoil']);
  });

  it('is never empty', () => {
    expect(merge([], null)).toEqual(['normal']);
  });

  it('a re-sync with placeholder flags keeps the reverse holo the top-up found', () => {
    expect(merge(['normal'], ['normal', 'reverseHolofoil'])).toContain('reverseHolofoil');
  });
});

describe('isPlaceholderFlagSet', () => {
  it('is true when every card is normal-only', () => {
    expect(isPlaceholderFlagSet([['normal'], ['normal']])).toBe(true);
  });

  it('is false when any card has another variant', () => {
    expect(isPlaceholderFlagSet([['normal'], ['holofoil']])).toBe(false);
  });

  it('is false for an empty set', () => {
    expect(isPlaceholderFlagSet([])).toBe(false);
  });
});

describe('addableVariants', () => {
  it('lists the known variants a card does not have yet, in canonical order', () => {
    expect(addableVariants(['normal', 'reverseHolofoil'])).toEqual([
      'holofoil',
      '1stEditionNormal',
      '1stEditionHolofoil',
      'unlimited',
      'unlimitedHolofoil',
    ]);
  });
});

describe('removableManualVariants', () => {
  it('excludes manual variants that are in use', () => {
    expect(removableManualVariants(['reverseHolofoil', 'holofoil'], ['holofoil'])).toEqual([
      'reverseHolofoil',
    ]);
  });
});

describe('sortVariants', () => {
  it('dedupes and orders known variants first, unknown ones last', () => {
    expect(sortVariants(['reverseHolofoil', 'normal', 'normal', 'zzz'])).toEqual([
      'normal',
      'reverseHolofoil',
      'zzz',
    ]);
  });
});
