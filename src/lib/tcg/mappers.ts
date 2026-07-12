import type { CardInsert, SetInsert } from '../../db/schema';
import type { ApiCard, ApiSet } from './types';

/**
 * Variant identifiers follow the TCG API's tcgplayer price keys verbatim,
 * in canonical display order.
 */
export const KNOWN_VARIANTS = [
  'normal',
  'holofoil',
  'reverseHolofoil',
  '1stEditionNormal',
  '1stEditionHolofoil',
  'unlimited',
  'unlimitedHolofoil',
] as const;

/**
 * A card's printed variants, derived from which tcgplayer price entries
 * exist. Cards without price data (brand-new sets lag by months) fall
 * back to modern-era print rules by rarity; the result is never empty.
 */
export function deriveVariants(
  card: Pick<ApiCard, 'rarity' | 'tcgplayer'>,
): string[] {
  const prices = card.tcgplayer?.prices ?? {};
  const known = KNOWN_VARIANTS.filter((v) => v in prices);
  if (known.length > 0) return known;

  const rarity = (card.rarity ?? '').toLowerCase();
  if (rarity === 'common' || rarity === 'uncommon')
    return ['normal', 'reverseHolofoil'];
  if (rarity === 'rare' || rarity === 'rare holo')
    return ['holofoil', 'reverseHolofoil'];
  if (rarity !== '') return ['holofoil']; // double rare, ultra, illustration…
  return ['normal'];
}

export function mapApiSet(api: ApiSet): SetInsert {
  return {
    id: api.id,
    name: api.name,
    series: api.series,
    printedTotal: api.printedTotal,
    total: api.total,
    releaseDate: api.releaseDate,
    ptcgoCode: api.ptcgoCode ?? null,
    symbolUri: api.images?.symbol ?? null,
    logoUri: api.images?.logo ?? null,
  };
}

export function mapApiCard(api: ApiCard): CardInsert {
  return {
    id: api.id,
    name: api.name,
    setId: api.set.id,
    number: api.number,
    rarity: api.rarity ?? null,
    supertype: api.supertype,
    types: api.types ?? [],
    nationalPokedexNumbers: api.nationalPokedexNumbers ?? [],
    imageSmallUri: api.images?.small ?? null,
    imageLargeUri: api.images?.large ?? null,
    variants: deriveVariants(api),
  };
}
