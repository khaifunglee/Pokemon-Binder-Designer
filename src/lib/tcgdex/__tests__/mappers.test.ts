import {
  cardImageUris,
  deriveVariants,
  extractPrices,
  mapGraphqlCard,
  mapSetDetail,
} from '../mappers';
import type { DexCardDetail, DexSetDetail } from '../types';

// Trimmed real payloads (live API, 2026-07-19).
const setDetail: DexSetDetail = {
  id: 'me04',
  name: 'Chaos Rising',
  logo: 'https://assets.tcgdex.net/en/me/me04/logo',
  symbol: 'https://assets.tcgdex.net/univ/me/me04/symbol',
  cardCount: { total: 122, official: 86 },
  releaseDate: '2026-05-22',
  serie: { id: 'me', name: 'Mega Evolution' },
  abbreviation: { official: 'CRI' },
  cards: [
    {
      id: 'me04-003',
      localId: '003',
      name: 'Beedrill ex',
      image: 'https://assets.tcgdex.net/en/me/me04/003',
    },
  ],
};

const cardDetail: DexCardDetail = {
  id: 'me04-003',
  localId: '003',
  name: 'Beedrill ex',
  category: 'Pokemon',
  rarity: 'Double rare',
  types: ['Grass'],
  dexId: [15],
  image: 'https://assets.tcgdex.net/en/me/me04/003',
  set: { id: 'me04' },
  variants: { firstEdition: false, holo: true, normal: false, reverse: false },
  pricing: {
    tcgplayer: {
      unit: 'USD',
      updated: '2026-07-18T08:02:56.980Z',
      holofoil: { lowPrice: 0.1, midPrice: 0.97, marketPrice: 0.52 },
    },
  },
};

describe('mapSetDetail', () => {
  it('maps to our sets row with asset extensions and abbreviation', () => {
    expect(mapSetDetail(setDetail)).toEqual({
      id: 'me04',
      name: 'Chaos Rising',
      series: 'Mega Evolution',
      printedTotal: 86,
      total: 122,
      releaseDate: '2026-05-22',
      ptcgoCode: 'CRI',
      symbolUri: 'https://assets.tcgdex.net/univ/me/me04/symbol.webp',
      logoUri: 'https://assets.tcgdex.net/en/me/me04/logo.webp',
    });
  });

  it('tolerates missing optionals', () => {
    const row = mapSetDetail({
      id: 'x',
      name: 'X',
      cardCount: { total: 1, official: 1 },
      cards: [],
    });
    expect(row).toMatchObject({ series: '', releaseDate: '', ptcgoCode: null, logoUri: null });
  });
});

describe('deriveVariants', () => {
  it('reads the explicit flags', () => {
    expect(deriveVariants(cardDetail)).toEqual(['holofoil']);
    expect(deriveVariants({ variants: { normal: true, reverse: true } })).toEqual([
      'normal',
      'reverseHolofoil',
    ]);
    expect(
      deriveVariants({ variants: { normal: true, holo: true, firstEdition: true } }),
    ).toEqual(['normal', 'holofoil', '1stEditionHolofoil']);
  });

  it('never returns empty', () => {
    expect(deriveVariants({})).toEqual(['normal']);
    expect(deriveVariants({ variants: {} })).toEqual(['normal']);
  });
});

describe('mapGraphqlCard', () => {
  it('maps a Delta Reign card with no image or dex ids (me06-001, 2026-11-23)', () => {
    expect(
      mapGraphqlCard({
        id: 'me06-001',
        localId: '001',
        name: 'Heracross',
        rarity: 'Common',
        category: 'Pokemon',
        types: ['Grass'],
        dexId: null,
        illustrator: 'Satoshi Ito',
        image: null,
        set: { id: 'me06' },
        variants: { normal: true, reverse: false, holo: false, firstEdition: false },
      }),
    ).toEqual({
      id: 'me06-001',
      name: 'Heracross',
      setId: 'me06',
      number: '001',
      rarity: 'Common',
      supertype: 'Pokémon',
      types: ['Grass'],
      nationalPokedexNumbers: [],
      illustrator: 'Satoshi Ito',
      imageSmallUri: null,
      imageLargeUri: null,
      variants: ['normal'],
      flagVariants: ['normal'],
    });
  });
});

describe('extractPrices', () => {
  it('maps the legacy short "reverse" key', () => {
    expect(
      extractPrices({ pricing: { tcgplayer: { reverse: { marketPrice: 0.23 } } } }),
    ).toEqual([{ variant: 'reverseHolofoil', marketUsd: 0.23 }]);
  });

  it('maps hyphenated pricing keys with market→mid→low fallback', () => {
    expect(
      extractPrices({
        pricing: {
          tcgplayer: {
            unit: 'USD',
            'reverse-holofoil': { marketPrice: 0.25 },
            normal: { marketPrice: null, midPrice: 0.13 },
            holofoil: { marketPrice: null, midPrice: null, lowPrice: null },
          },
        },
      }),
    ).toEqual([
      { variant: 'normal', marketUsd: 0.13 },
      { variant: 'reverseHolofoil', marketUsd: 0.25 },
    ]);
  });

  it('ignores metadata keys and missing blocks', () => {
    expect(extractPrices(cardDetail)).toEqual([{ variant: 'holofoil', marketUsd: 0.52 }]);
    expect(extractPrices({})).toEqual([]);
  });
});

describe('cardImageUris', () => {
  it('appends quality suffixes', () => {
    expect(cardImageUris('https://a/b/003')).toEqual({
      small: 'https://a/b/003/low.webp',
      large: 'https://a/b/003/high.webp',
    });
    expect(cardImageUris(undefined)).toEqual({ small: null, large: null });
  });
});
