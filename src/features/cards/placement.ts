import { and, eq } from 'drizzle-orm';

import { touchBinder } from '../../db/binders';
import type { Db } from '../../db/client';
import { binders, pages, slots } from '../../db/schema';
import type { CardRow } from '../../db/schema';
import { placeCard, setSlotQuantity } from '../../db/slots';
import { resolvePlacement } from '../../lib/binder/stacking';

/**
 * Put a card in a pocket with its default (first) variant. When the
 * binder stacks variants, a card already in the binder bumps that
 * pocket's quantity instead of filling the tapped pocket.
 */
export async function placeIntoSlot(
  db: Db,
  binderId: string,
  slotId: string,
  card: CardRow,
): Promise<void> {
  const [binder] = await db
    .select({ variantStacking: binders.variantStacking })
    .from(binders)
    .where(eq(binders.id, binderId));

  const existing = binder?.variantStacking
    ? await db
        .select({ slotId: slots.id, cardId: slots.cardId, quantity: slots.quantity })
        .from(slots)
        .innerJoin(pages, eq(slots.pageId, pages.id))
        .where(and(eq(pages.binderId, binderId), eq(slots.cardId, card.id)))
    : [];

  const resolution = resolvePlacement({
    variantStacking: binder?.variantStacking ?? false,
    cardId: card.id,
    existing,
  });

  if (resolution.action === 'stack') {
    await setSlotQuantity(db, resolution.slotId, resolution.newQuantity);
  } else {
    await placeCard(db, slotId, {
      cardId: card.id,
      variant: card.variants[0] ?? 'normal',
    });
  }
  await touchBinder(db, binderId);
}
