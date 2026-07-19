import {
  cardImageUris,
  deriveVariants,
  extractPrices,
  mapCardBrief,
  mapCardDetail,
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

describe('mapCardDetail', () => {
  it('maps to our cards row with é-supertype and image suffixes', () => {
    expect(mapCardDetail(cardDetail)).toEqual({
      id: 'me04-003',
      name: 'Beedrill ex',
      setId: 'me04',
      number: '003',
      rarity: 'Double rare',
      supertype: 'Pokémon',
      types: ['Grass'],
      nationalPokedexNumbers: [15],
      imageSmallUri: 'https://assets.tcgdex.net/en/me/me04/003/low.webp',
      imageLargeUri: 'https://assets.tcgdex.net/en/me/me04/003/high.webp',
      variants: ['holofoil'],
    });
  });
});

describe('mapCardBrief', () => {
  it('builds a placeholder row good enough for FK references', () => {
    const row = mapCardBrief(setDetail.cards[0], 'me04');
    expect(row).toMatchObject({
      id: 'me04-003',
      setId: 'me04',
      number: '003',
      name: 'Beedrill ex',
      variants: [],
      supertype: '',
    });
  });
});

describe('extractPrices', () => {
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
