import {
  cardsDuePriceRecheck,
  DAY_MS,
  isDue,
  isIncompleteSet,
  isRecent,
  setsNeedingTopUp,
  setsToRecheck,
  setsToRefreshMetadata,
  setsToSync,
  topUpsToReopen,
} from '../syncPlan';

const now = new Date('2026-11-23T00:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const HOUR_MS = 60 * 60 * 1000;

describe('setsToSync', () => {
  it('resumes: skips synced sets and sets with no cards', () => {
    expect(
      setsToSync([
        { id: 'a', total: 10, cardsIngestedAt: ago(HOUR_MS) },
        { id: 'b', total: 10, cardsIngestedAt: null },
        { id: 'c', total: 0, cardsIngestedAt: null },
      ]),
    ).toEqual(['b']);
  });
});

describe('isIncompleteSet', () => {
  it('is incomplete when fewer cards arrived than TCGdex lists', () => {
    expect(isIncompleteSet(34, 48)).toBe(true);
    expect(isIncompleteSet(0, 160)).toBe(true);
  });

  it('is complete at or above the listed total', () => {
    expect(isIncompleteSet(258, 258)).toBe(false);
    expect(isIncompleteSet(0, 0)).toBe(false);
    expect(isIncompleteSet(300, 258)).toBe(false);
  });
});

describe('isDue', () => {
  it('is due when never run or the timestamp is unreadable', () => {
    expect(isDue(null, now, DAY_MS)).toBe(true);
    expect(isDue('garbage', now, DAY_MS)).toBe(true);
  });

  it('respects the interval', () => {
    expect(isDue(ago(23 * HOUR_MS).toISOString(), now, DAY_MS)).toBe(false);
    expect(isDue(ago(25 * HOUR_MS).toISOString(), now, DAY_MS)).toBe(true);
  });
});

describe('isRecent', () => {
  it('is true within 90 days of release', () => {
    expect(isRecent('2026-11-06', now)).toBe(true);
  });

  it('is false for old, empty or malformed dates', () => {
    expect(isRecent('2025-01-01', now)).toBe(false);
    expect(isRecent('', now)).toBe(false);
    expect(isRecent('not-a-date', now)).toBe(false);
  });
});

describe('setsToRecheck', () => {
  it('picks recent sets and sets with missing images', () => {
    expect(
      setsToRecheck(
        [
          { id: 'me06', releaseDate: '2026-11-06', missingImages: 141, localCards: 141, total: 141 },
          { id: 'sm3.5', releaseDate: '2017-10-06', missingImages: 78, localCards: 78, total: 78 },
          { id: 'sv01', releaseDate: '2023-03-31', missingImages: 0, localCards: 258, total: 258 },
          { id: 'undated', releaseDate: '', missingImages: 0, localCards: 5, total: 5 },
          { id: 'mfb', releaseDate: '2019-11-01', missingImages: 0, localCards: 34, total: 48 },
          { id: 'jumbo', releaseDate: '2000-02-01', missingImages: 0, localCards: 0, total: 160 },
        ],
        now,
      ),
    ).toEqual(['me06', 'sm3.5', 'mfb', 'jumbo']);
  });
});

describe('setsNeedingTopUp', () => {
  it('picks placeholder-flag sets not checked yet', () => {
    expect(
      setsNeedingTopUp([
        { id: 'sm1', placeholderFlags: true, variantsCheckedAt: null },
        { id: 'xy1', placeholderFlags: true, variantsCheckedAt: ago(DAY_MS) },
        { id: 'sv01', placeholderFlags: false, variantsCheckedAt: null },
      ]),
    ).toEqual(['sm1']);
  });
});

describe('topUpsToReopen', () => {
  it('re-runs recent placeholder sets checked over a week ago', () => {
    expect(
      topUpsToReopen(
        [
          { id: 'me06', releaseDate: '2026-11-06', placeholderFlags: true, variantsCheckedAt: ago(8 * DAY_MS) },
          { id: 'me07', releaseDate: '2026-11-20', placeholderFlags: true, variantsCheckedAt: ago(6 * DAY_MS) },
          { id: 'xy1', releaseDate: '2014-02-05', placeholderFlags: true, variantsCheckedAt: ago(365 * DAY_MS) },
          { id: 'me08', releaseDate: '2026-11-21', placeholderFlags: true, variantsCheckedAt: null },
        ],
        now,
      ),
    ).toEqual(['me06']);
  });
});

describe('cardsDuePriceRecheck', () => {
  it('re-checks cards with no TCGplayer data weekly', () => {
    expect(
      cardsDuePriceRecheck(
        [
          { id: 'old-unpriced', priceVariants: [], priceCheckedAt: ago(8 * DAY_MS) },
          { id: 'new-unpriced', priceVariants: [], priceCheckedAt: ago(6 * DAY_MS) },
          { id: 'never-dated', priceVariants: [], priceCheckedAt: null },
          { id: 'unchecked', priceVariants: null, priceCheckedAt: null },
          { id: 'priced', priceVariants: ['normal'], priceCheckedAt: ago(30 * DAY_MS) },
        ],
        now,
      ),
    ).toEqual(['old-unpriced', 'never-dated']);
  });
});

describe('setsToRefreshMetadata', () => {
  it('refreshes re-checked sets and sets first seen with no cards', () => {
    expect(
      setsToRefreshMetadata(
        [
          { id: 'me06', releaseDate: '2026-11-06', missingImages: 141, localCards: 141, total: 141 },
          { id: 'empty', releaseDate: '', missingImages: 0, localCards: 0, total: 0 },
          { id: 'sv01', releaseDate: '2023-03-31', missingImages: 0, localCards: 258, total: 258 },
        ],
        now,
      ),
    ).toEqual(['me06', 'empty']);
  });
});
