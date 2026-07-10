import { asc, eq } from 'drizzle-orm';

import { planOrganize } from '../lib/binder/organize';
import type { OrganizeSlot } from '../lib/binder/organize';
import type { Db } from './client';
import { binders, cards, pages, sets, slots } from './schema';
import type { SortStrategy } from './schema';

/**
 * One-tap reorganize: plans with pure logic, rewrites changed pockets in
 * a single transaction, and records the strategy on the binder. Returns
 * the number of pockets changed (0 = already organized).
 */
export async function autoOrganize(
  db: Db,
  binderId: string,
  strategy: SortStrategy,
): Promise<number> {
  const rows = await db
    .select({
      slotId: slots.id,
      cardId: slots.cardId,
      variant: slots.variant,
      quantity: slots.quantity,
      condition: slots.condition,
      mergedGroupId: slots.mergedGroupId,
      customImageUri: slots.customImageUri,
      cardName: cards.name,
      number: cards.number,
      setId: cards.setId,
      types: cards.types,
      nationalPokedexNumbers: cards.nationalPokedexNumbers,
      rarity: cards.rarity,
      supertype: cards.supertype,
      setReleaseDate: sets.releaseDate,
    })
    .from(slots)
    .innerJoin(pages, eq(slots.pageId, pages.id))
    .leftJoin(cards, eq(slots.cardId, cards.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(eq(pages.binderId, binderId))
    .orderBy(asc(pages.pageIndex), asc(slots.slotIndex));

  const organizeSlots: OrganizeSlot[] = rows.map((r) => ({
    slotId: r.slotId,
    contents:
      r.cardId === null
        ? null
        : {
            cardId: r.cardId,
            variant: r.variant,
            quantity: r.quantity,
            condition: r.condition,
          },
    sortable:
      r.cardId === null
        ? null
        : {
            cardName: r.cardName ?? '',
            number: r.number ?? '',
            setId: r.setId ?? '',
            setReleaseDate: r.setReleaseDate ?? '',
            types: r.types ?? [],
            nationalPokedexNumbers: r.nationalPokedexNumbers ?? [],
            rarity: r.rarity,
            supertype: r.supertype ?? '',
          },
    pinned: r.mergedGroupId !== null || r.customImageUri !== null,
  }));

  const changes = planOrganize(organizeSlots, strategy);

  await db.transaction(async (tx) => {
    for (const change of changes) {
      await tx
        .update(slots)
        .set(
          change.contents === null
            ? { cardId: null, variant: null, quantity: 1, condition: null }
            : {
                cardId: change.contents.cardId,
                variant: change.contents.variant,
                quantity: change.contents.quantity,
                condition: change.contents.condition,
              },
        )
        .where(eq(slots.id, change.slotId));
    }
    await tx
      .update(binders)
      .set({ sortStrategy: strategy, updatedAt: new Date() })
      .where(eq(binders.id, binderId));
  });

  return changes.length;
}
