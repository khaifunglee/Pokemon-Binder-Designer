import type { CardInsert, SetInsert } from '../../db/schema';
import type { DexCardDetail, DexSetDetail, GqlCard } from './types';

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

/**
 * TCGdex tcgplayer pricing keys → our variant keys. Live payloads use the
 * hyphenated names; older ones used `reverse` / `holo` (e.g. swsh3-136 in
 * 2025-08), so both spellings map.
 */
export const PRICE_KEY_MAP: Record<string, string> = {
  normal: 'normal',
  holofoil: 'holofoil',
  holo: 'holofoil',
  'reverse-holofoil': 'reverseHolofoil',
  reverse: 'reverseHolofoil',
  '1st-edition': '1stEditionNormal',
  '1st-edition-normal': '1stEditionNormal',
  '1st-edition-holofoil': '1stEditionHolofoil',
  unlimited: 'unlimited',
  'unlimited-holofoil': 'unlimitedHolofoil',
};

/**
 * Variant for a TCGplayer price key. Own keys only: API data is untrusted,
 * and a plain-object lookup would return prototype members for keys like
 * `__proto__` or `constructor`.
 */
export function priceKeyVariant(key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(PRICE_KEY_MAP, key) ? PRICE_KEY_MAP[key] : undefined;
}

/** Dedupe, then canonical order; unknown variants last, alphabetically. */
export function sortVariants(variants: Iterable<string>): string[] {
  const rank = (v: string): number => {
    const index = KNOWN_VARIANTS.indexOf(v as (typeof KNOWN_VARIANTS)[number]);
    return index === -1 ? KNOWN_VARIANTS.length : index;
  };
  return [...new Set(variants)]
    .filter((v): v is string => typeof v === 'string')
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

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

/**
 * A GraphQL card → our card row. `variants` starts as the flags; the sync
 * re-merges it with stored price and manual variants before writing.
 */
export function mapGraphqlCard(
  card: GqlCard,
): CardInsert & { flagVariants: string[]; illustrator: string | null } {
  const images = cardImageUris(card.image ?? undefined);
  const flagVariants = deriveVariants({ variants: card.variants ?? undefined });
  return {
    id: card.id,
    name: card.name,
    setId: card.set.id,
    number: card.localId,
    rarity: card.rarity ?? null,
    supertype: mapCategory(card.category),
    types: card.types ?? [],
    nationalPokedexNumbers: card.dexId ?? [],
    illustrator: card.illustrator ?? null,
    imageSmallUri: images.small,
    imageLargeUri: images.large,
    variants: flagVariants,
    flagVariants,
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
    const variant = priceKeyVariant(key);
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
