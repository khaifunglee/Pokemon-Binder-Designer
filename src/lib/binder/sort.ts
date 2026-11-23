import type { SortStrategy } from '../../db/schema';

/**
 * Sort comparators for auto-organize. Pure: callers join slot contents
 * with card/set metadata into SortableEntry and get back the new order.
 * sort_strategy is logic only — never conflate with visual_theme.
 */

export interface SortableEntry {
  slotId: string;
  cardId: string;
  cardName: string;
  /** Collector number, e.g. "25", "025a", "TG12". */
  number: string;
  setId: string;
  setReleaseDate: string; // "YYYY/MM/DD" sorts lexicographically
  types: string[];
  nationalPokedexNumbers: number[];
  rarity: string | null;
  supertype: string;
}

/** Canonical TCG energy-type order for the colour strategy. */
const TYPE_ORDER = [
  'Grass',
  'Fire',
  'Water',
  'Lightning',
  'Psychic',
  'Fighting',
  'Darkness',
  'Metal',
  'Fairy',
  'Dragon',
  'Colorless',
] as const;

/** Rarity ladder, common → rarest; unknown rarities sort after known. */
const RARITY_ORDER = [
  'Common',
  'Uncommon',
  'Rare',
  'Rare Holo',
  'Rare Holo EX',
  'Rare Holo GX',
  'Rare Holo V',
  'Rare Holo VMAX',
  'Rare Holo VSTAR',
  'Double Rare',
  'Rare Ultra',
  'Ultra Rare',
  'Rare Secret',
  'Special Illustration Rare',
  'Illustration Rare',
  'Hyper Rare',
  'Rare Rainbow',
  'Promo',
] as const;

/** "025a" → [25, "A"]; "TG12" → [Infinity+lex "TG", 12] handled via parts. */
function numberParts(raw: string): { prefix: string; num: number; suffix: string } {
  const m = raw.trim().toUpperCase().match(/^([A-Z]*)(\d*)(.*)$/);
  const prefix = m?.[1] ?? '';
  const num = m?.[2] ? parseInt(m[2], 10) : Number.POSITIVE_INFINITY;
  const suffix = m?.[3] ?? '';
  return { prefix, num, suffix };
}

export function compareCollectorNumbers(a: string, b: string): number {
  const pa = numberParts(a);
  const pb = numberParts(b);
  // Un-prefixed numbers ("25") come before prefixed ranges ("TG12", "GG01").
  if (pa.prefix !== pb.prefix) return pa.prefix < pb.prefix ? -1 : 1;
  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.suffix < pb.suffix ? -1 : pa.suffix > pb.suffix ? 1 : 0;
}

/**
 * Release date, then set id, then collector number — the master-set order.
 * Sets with no release date ('' when TCGdex omits it) go after every dated
 * set (user decision 2026-11-23), not first as a plain string compare would.
 */
export function compareMasterSet(a: SortableEntry, b: SortableEntry): number {
  if (a.setReleaseDate !== b.setReleaseDate) {
    if (a.setReleaseDate === '') return 1;
    if (b.setReleaseDate === '') return -1;
    return a.setReleaseDate < b.setReleaseDate ? -1 : 1;
  }
  if (a.setId !== b.setId) return a.setId < b.setId ? -1 : 1;
  return compareCollectorNumbers(a.number, b.number);
}

/** Colour grouping key: energy-type index; Trainers then Energy last. */
export function typeRank(e: SortableEntry): number {
  if (e.supertype !== 'Pokémon') {
    // Trainers then Energy after all Pokémon.
    return e.supertype === 'Trainer' ? TYPE_ORDER.length + 1 : TYPE_ORDER.length + 2;
  }
  const idx = TYPE_ORDER.indexOf(e.types[0] as (typeof TYPE_ORDER)[number]);
  return idx === -1 ? TYPE_ORDER.length : idx;
}

function compareColour(a: SortableEntry, b: SortableEntry): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (a.cardName !== b.cardName) return a.cardName < b.cardName ? -1 : 1;
  return compareMasterSet(a, b);
}

export function dexRank(e: SortableEntry): number {
  return e.nationalPokedexNumbers.length
    ? Math.min(...e.nationalPokedexNumbers)
    : Number.POSITIVE_INFINITY; // trainers/energies after all Pokémon
}

/**
 * Rarity buckets for page-grouped organizing, common → rarest. Matchers
 * run in order (most specific first) — keyword-based because the API's
 * rarity vocabulary keeps growing:
 *   0 commons + uncommons          4 illustration rares
 *   1 rares (holo, radiant…)       5 special illustration rares
 *   2 regular ex/V/GX/VMAX…        6 hyper/rainbow/secret/gold
 *   3 full arts / ultra rares      7 promos + unrecognized
 */
const RARITY_BUCKETS: [RegExp, number][] = [
  [/^(common|uncommon)$/, 0],
  [/special illustration/, 5],
  [/illustration/, 4],
  [/(hyper|rainbow|secret|gold)/, 6],
  [/(full art|ultra)/, 3],
  [/(double rare|\bex\b|\bv\b|vmax|vstar|\bgx\b|prime|legend|break|ace spec|shiny)/, 2],
  [/(rare|holo|radiant|amazing)/, 1],
];

export function rarityBucket(rarity: string | null): number {
  if (rarity === null) return 7;
  const r = rarity.toLowerCase();
  for (const [pattern, bucket] of RARITY_BUCKETS) {
    if (pattern.test(r)) return bucket;
  }
  return 7; // promos and anything unrecognized
}

export const RARITY_BUCKET_COUNT = 8;

function comparePokedex(a: SortableEntry, b: SortableEntry): number {
  const ra = dexRank(a);
  const rb = dexRank(b);
  if (ra !== rb) return ra - rb;
  return compareMasterSet(a, b);
}

function rarityRank(e: SortableEntry): number {
  if (e.rarity === null) return RARITY_ORDER.length + 1;
  const idx = RARITY_ORDER.indexOf(e.rarity as (typeof RARITY_ORDER)[number]);
  return idx === -1 ? RARITY_ORDER.length : idx;
}

function compareRarity(a: SortableEntry, b: SortableEntry): number {
  const ra = rarityRank(a);
  const rb = rarityRank(b);
  if (ra !== rb) return ra - rb;
  return compareMasterSet(a, b);
}

/**
 * The new order of entries for a strategy; 'custom' returns the input
 * order untouched (custom means "wherever the user put things").
 */
export function sortEntries(
  entries: SortableEntry[],
  strategy: SortStrategy,
): SortableEntry[] {
  const copy = [...entries];
  switch (strategy) {
    case 'custom':
      return copy;
    case 'master-set':
      return copy.sort(compareMasterSet);
    case 'colour':
      return copy.sort(compareColour);
    case 'pokedex':
      return copy.sort(comparePokedex);
    case 'rarity':
      return copy.sort(compareRarity);
  }
}
