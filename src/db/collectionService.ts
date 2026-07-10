import { and, eq, sql } from 'drizzle-orm';

import type { Db } from './client';
import { collection } from './schema';

/**
 * `collection` is the source of truth for "what I own", independent of
 * binder placement. Zero-quantity rows are deleted, so row existence
 * means owned.
 */

export async function toggleOwned(
  db: Db,
  cardId: string,
  variant: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ quantity: collection.quantityOwned })
    .from(collection)
    .where(and(eq(collection.cardId, cardId), eq(collection.variant, variant)));

  if (existing) {
    await db
      .delete(collection)
      .where(and(eq(collection.cardId, cardId), eq(collection.variant, variant)));
    return false;
  }
  await db.insert(collection).values({ cardId, variant, quantityOwned: 1 });
  return true;
}

export async function adjustOwnedQuantity(
  db: Db,
  cardId: string,
  variant: string,
  delta: number,
): Promise<void> {
  const [existing] = await db
    .select({ quantity: collection.quantityOwned })
    .from(collection)
    .where(and(eq(collection.cardId, cardId), eq(collection.variant, variant)));

  const next = (existing?.quantity ?? 0) + delta;
  if (next <= 0) {
    await db
      .delete(collection)
      .where(and(eq(collection.cardId, cardId), eq(collection.variant, variant)));
    return;
  }
  if (existing) {
    await db
      .update(collection)
      .set({ quantityOwned: next })
      .where(and(eq(collection.cardId, cardId), eq(collection.variant, variant)));
  } else {
    await db.insert(collection).values({ cardId, variant, quantityOwned: next });
  }
}

/** Bulk add (CSV import): adds quantities on conflict, never decreases. */
export async function addOwned(
  db: Db,
  entries: { cardId: string; variant: string; quantity: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const e of entries) {
      await tx
        .insert(collection)
        .values({ cardId: e.cardId, variant: e.variant, quantityOwned: e.quantity })
        .onConflictDoUpdate({
          target: [collection.cardId, collection.variant],
          set: {
            quantityOwned: sql`${collection.quantityOwned} + ${e.quantity}`,
          },
        });
    }
  });
}
