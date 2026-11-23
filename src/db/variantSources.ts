import { inArray } from 'drizzle-orm';

import type { Db } from './client';
import { cards, collection, slots } from './schema';

/** A transaction handle or the db itself; both run the same queries. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export interface StoredVariantSources {
  flags: string[];
  prices: string[] | null;
  manual: string[];
  variants: string[];
  /** Variants referenced by collection or slots (never dropped). */
  inUse: string[];
}

// Stay well under SQLite's bound-variable limit per statement.
const CHUNK_SIZE = 100;

export function chunk<T>(items: T[], size: number = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The stored variant sources of each card, keyed by card id. Cards not in
 * SQLite yet are absent from the map.
 */
export async function loadVariantSources(
  db: DbOrTx,
  cardIds: string[],
): Promise<Map<string, StoredVariantSources>> {
  const out = new Map<string, StoredVariantSources>();
  for (const ids of chunk(cardIds)) {
    const [cardRows, owned, placed] = await Promise.all([
      db
        .select({
          id: cards.id,
          flags: cards.flagVariants,
          prices: cards.priceVariants,
          manual: cards.manualVariants,
          variants: cards.variants,
        })
        .from(cards)
        .where(inArray(cards.id, ids)),
      db
        .select({ cardId: collection.cardId, variant: collection.variant })
        .from(collection)
        .where(inArray(collection.cardId, ids)),
      db
        .select({ cardId: slots.cardId, variant: slots.variant })
        .from(slots)
        .where(inArray(slots.cardId, ids)),
    ]);
    for (const row of cardRows) {
      out.set(row.id, {
        flags: row.flags ?? [],
        prices: row.prices ?? null,
        manual: row.manual ?? [],
        variants: row.variants ?? [],
        inUse: [],
      });
    }
    for (const use of [...owned, ...placed]) {
      if (use.cardId == null || use.variant == null) continue;
      const sources = out.get(use.cardId);
      if (sources && !sources.inUse.includes(use.variant)) sources.inUse.push(use.variant);
    }
  }
  return out;
}
