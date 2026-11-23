import { KNOWN_VARIANTS, PRICE_KEY_MAP, sortVariants } from './mappers';

/**
 * Variant sources and how they combine. TCGdex's variant flags are
 * placeholders (normal-only) for 44 sets, but the TCGplayer price keys on
 * REST card details list the variants that really exist. `cards.variants`
 * always holds mergeVariants(...) of all sources.
 */

/** Price-block keys that describe the block, not a variant. */
const NON_VARIANT_KEYS = new Set(['unit', 'updated']);

/**
 * Variants present in a REST `pricing.tcgplayer` block. Presence counts,
 * not price > 0: a listed variant with no current sale still exists.
 * Returns [] when there is no TCGplayer data at all.
 */
export function priceVariants(
  tcgplayer: Record<string, unknown> | undefined | null,
  onUnknownKey?: (key: string) => void,
): string[] {
  if (!tcgplayer) return [];
  const found: string[] = [];
  for (const [key, value] of Object.entries(tcgplayer)) {
    if (NON_VARIANT_KEYS.has(key)) continue;
    const variant = PRICE_KEY_MAP[key];
    if (!variant) {
      onUnknownKey?.(key);
      continue;
    }
    if (value != null && typeof value === 'object') found.push(variant);
  }
  return sortVariants(found);
}

export interface VariantSources {
  /** From TCGdex's variant flags (deriveVariants). */
  flags: string[];
  /** From REST price keys: null = not checked, [] = no TCGplayer data. */
  prices: string[] | null;
  /** Added by the user; always kept. */
  manual: string[];
  /** Referenced by collection or slots; never dropped. */
  inUse: string[];
}

const isBareNormal = (flags: string[]): boolean =>
  flags.length === 1 && flags[0] === 'normal';

export function mergeVariants({ flags, prices, manual, inUse }: VariantSources): string[] {
  // Placeholder flags (bare normal) lose to real price data, so a
  // holo-only card doesn't keep a fake normal. Without price data the
  // flags stand: nothing is inferred.
  const base =
    prices && prices.length > 0 && isBareNormal(flags) ? prices : [...flags, ...(prices ?? [])];
  const merged = sortVariants([...base, ...manual, ...inUse]);
  return merged.length > 0 ? merged : ['normal'];
}

/** True when every card in a set has the normal-only placeholder flags. */
export function isPlaceholderFlagSet(flagsPerCard: string[][]): boolean {
  return flagsPerCard.length > 0 && flagsPerCard.every(isBareNormal);
}

/** Known variants a card doesn't list yet: the "Add variant" choices. */
export function addableVariants(current: string[]): string[] {
  return KNOWN_VARIANTS.filter((v) => !current.includes(v));
}

/** Manual variants the user may remove: those not owned or placed. */
export function removableManualVariants(manual: string[], inUse: string[]): string[] {
  return manual.filter((v) => !inUse.includes(v));
}
