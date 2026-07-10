import { deriveVariants, mapApiCard, mapApiSet } from '../mappers';
import type { ApiCard, ApiSet } from '../types';

const apiSet: ApiSet = {
  id: 'sv1',
  name: 'Scarlet & Violet',
  series: 'Scarlet & Violet',
  printedTotal: 198,
  total: 258,
  releaseDate: '2023/03/31',
  ptcgoCode: 'SVI',
  images: {
    symbol: 'https://images.pokemontcg.io/sv1/symbol.png',
    logo: 'https://images.pokemontcg.io/sv1/logo.png',
  },
};

const apiCard: ApiCard = {
  id: 'sv1-25',
  name: 'Pikachu',
  number: '025',
  rarity: 'Common',
  supertype: 'Pokémon',
  types: ['Lightning'],
  nationalPokedexNumbers: [25],
  set: { id: 'sv1' },
  images: {
    small: 'https://images.pokemontcg.io/sv1/25.png',
    large: 'https://images.pokemontcg.io/sv1/25_hires.png',
  },
  tcgplayer: {
    prices: { normal: { market: 0.05 }, reverseHolofoil: { market: 0.25 } },
  },
};

describe('deriveVariants', () => {
  it('uses tcgplayer price keys in canonical order', () => {
    expect(deriveVariants(apiCard)).toEqual(['normal', 'reverseHolofoil']);
  });

  it('orders canonically regardless of price-key insertion order', () => {
    expect(
      deriveVariants({
        tcgplayer: { prices: { reverseHolofoil: {}, holofoil: {}, normal: {} } },
      }),
    ).toEqual(['normal', 'holofoil', 'reverseHolofoil']);
  });

  it('ignores unknown price keys', () => {
    expect(
      deriveVariants({ tcgplayer: { prices: { weirdFuture: {}, holofoil: {} } } }),
    ).toEqual(['holofoil']);
  });

  it('falls back to holofoil for Rare Holo rarities without prices', () => {
    expect(deriveVariants({ rarity: 'Rare Holo' })).toEqual(['holofoil']);
    expect(deriveVariants({ rarity: 'Rare Holo VMAX' })).toEqual(['holofoil']);
  });

  it('falls back to normal otherwise and never returns empty', () => {
    expect(deriveVariants({ rarity: 'Common' })).toEqual(['normal']);
    expect(deriveVariants({})).toEqual(['normal']);
    expect(deriveVariants({ tcgplayer: { prices: {} } })).toEqual(['normal']);
  });
});

describe('mapApiSet', () => {
  it('maps all fields', () => {
    expect(mapApiSet(apiSet)).toEqual({
      id: 'sv1',
      name: 'Scarlet & Violet',
      series: 'Scarlet & Violet',
      printedTotal: 198,
      total: 258,
      releaseDate: '2023/03/31',
      ptcgoCode: 'SVI',
      symbolUri: 'https://images.pokemontcg.io/sv1/symbol.png',
      logoUri: 'https://images.pokemontcg.io/sv1/logo.png',
    });
  });

  it('tolerates missing images and ptcgoCode', () => {
    const row = mapApiSet({ ...apiSet, images: undefined, ptcgoCode: undefined });
    expect(row.symbolUri).toBeNull();
    expect(row.logoUri).toBeNull();
    expect(row.ptcgoCode).toBeNull();
  });
});

describe('mapApiCard', () => {
  it('maps all fields including derived variants', () => {
    expect(mapApiCard(apiCard)).toEqual({
      id: 'sv1-25',
      name: 'Pikachu',
      setId: 'sv1',
      number: '025',
      rarity: 'Common',
      supertype: 'Pokémon',
      types: ['Lightning'],
      nationalPokedexNumbers: [25],
      imageSmallUri: 'https://images.pokemontcg.io/sv1/25.png',
      imageLargeUri: 'https://images.pokemontcg.io/sv1/25_hires.png',
      variants: ['normal', 'reverseHolofoil'],
    });
  });

  it('defaults optional API fields (trainer card, no images/prices)', () => {
    const row = mapApiCard({
      id: 'sv1-166',
      name: 'Ultra Ball',
      number: '196',
      supertype: 'Trainer',
      set: { id: 'sv1' },
    });
    expect(row).toEqual({
      id: 'sv1-166',
      name: 'Ultra Ball',
      setId: 'sv1',
      number: '196',
      rarity: null,
      supertype: 'Trainer',
      types: [],
      nationalPokedexNumbers: [],
      imageSmallUri: null,
      imageLargeUri: null,
      variants: ['normal'],
    });
  });
});
