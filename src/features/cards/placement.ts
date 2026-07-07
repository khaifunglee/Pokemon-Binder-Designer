import { touchBinder } from '../../db/binders';
import type { Db } from '../../db/client';
import type { CardRow } from '../../db/schema';
import { placeCard } from '../../db/slots';

/** Put a card in a pocket with its default (first) variant. */
export async function placeIntoSlot(
  db: Db,
  binderId: string,
  slotId: string,
  card: CardRow,
): Promise<void> {
  await placeCard(db, slotId, {
    cardId: card.id,
    variant: card.variants[0] ?? 'normal',
  });
  await touchBinder(db, binderId);
}
