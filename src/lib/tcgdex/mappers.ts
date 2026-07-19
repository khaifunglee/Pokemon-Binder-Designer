import type { CardInsert, SetInsert } from '../../db/schema';
import type { DexCardBrief, DexCardDetail, DexSetDetail } from './types';

/**
 * Our variant vocabulary (kept from the original tcgplayer price keys so
 * existing slot/collection variant strings stay valid post-migration).
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

/** TCGdex tcgplayer pricing keys (hyphenated) → our variant keys. */
const PRICE_KEY_MAP: Record<string, string> = {
  normal: 'normal',
  holofoil: 'holofoil',
  'reverse-holofoil': 'reverseHolofoil',
  '1st-edition': '1stEditionNormal',
  '1st-edition-normal': '1stEditionNormal',
  '1st-edition-holofoil': '1stEditionHolofoil',
  unlimited: 'unlimited',
  'unlimited-holofoil': 'unlimitedHolofoil',
};

/** Image asset bases need a quality/extension suffix. */
export function cardImageUris(base: string | undefined): {
  small: string | null;
  large: string | null;
} {
  if (!base) return { small: null, large: null };
  return { small: `${base}/low.webp`, large: `${base}/high.webp` };
}

export function setAssetUri(base: string | undefined): string | null {
  return base ? `${base}.webp` : null;
}

/** Printed variants from TCGdex's explicit flags; never empty. */
export function deriveVariants(card: Pick<DexCardDetail, 'variants'>): string[] {
  const flags = card.variants ?? {};
  const out: string[] = [];
  if (flags.normal) out.push('normal');
  if (flags.holo) out.push('holofoil');
  if (flags.reverse) out.push('reverseHolofoil');
  if (flags.firstEdition) out.push(flags.holo ? '1stEditionHolofoil' : '1stEditionNormal');
  return out.length > 0 ? out : ['normal'];
}

/** Category → the supertype vocabulary the sort/UI logic expects. */
export function mapCategory(category: string): string {
  return category === 'Pokemon' ? 'Pokémon' : category;
}

export function mapSetDetail(set: DexSetDetail): SetInsert {
  return {
    id: set.id,
    name: set.name,
    series: set.serie?.name ?? '',
    printedTotal: set.cardCount.official,
    total: set.cardCount.total,
    releaseDate: set.releaseDate ?? '',
    ptcgoCode: set.abbreviation?.official ?? null,
    symbolUri: setAssetUri(set.symbol),
    logoUri: setAssetUri(set.logo),
  };
}

export function mapCardDetail(card: DexCardDetail): CardInsert {
  const images = cardImageUris(card.image);
  return {
    id: card.id,
    name: card.name,
    setId: card.set.id,
    number: card.localId,
    rarity: card.rarity ?? null,
    supertype: mapCategory(card.category),
    types: card.types ?? [],
    nationalPokedexNumbers: card.dexId ?? [],
    imageSmallUri: images.small,
    imageLargeUri: images.large,
    variants: deriveVariants(card),
  };
}

/**
 * Placeholder card row from a set-detail brief — enough for slots and
 * collections to reference (FK) until the full detail is ingested.
 */
export function mapCardBrief(brief: DexCardBrief, setId: string): CardInsert {
  const images = cardImageUris(brief.image);
  return {
    id: brief.id,
    name: brief.name,
    setId,
    number: brief.localId,
    rarity: null,
    supertype: '',
    types: [],
    nationalPokedexNumbers: [],
    imageSmallUri: images.small,
    imageLargeUri: images.large,
    variants: [],
  };
}

export interface ExtractedPrice {
  variant: string;
  marketUsd: number;
}

/** Per-variant USD prices; market → mid → low fallback per entry. */
export function extractPrices(card: Pick<DexCardDetail, 'pricing'>): ExtractedPrice[] {
  const block = card.pricing?.tcgplayer;
  if (!block) return [];
  const out: ExtractedPrice[] = [];
  for (const [key, entry] of Object.entries(block)) {
    const variant = PRICE_KEY_MAP[key];
    if (!variant || entry == null || typeof entry !== 'object') continue;
    const value = entry.marketPrice ?? entry.midPrice ?? entry.lowPrice;
    if (value != null && value > 0) out.push({ variant, marketUsd: value });
  }
  // Canonical display order.
  return out.sort(
    (a, b) =>
      KNOWN_VARIANTS.indexOf(a.variant as (typeof KNOWN_VARIANTS)[number]) -
      KNOWN_VARIANTS.indexOf(b.variant as (typeof KNOWN_VARIANTS)[number]),
  );
}
