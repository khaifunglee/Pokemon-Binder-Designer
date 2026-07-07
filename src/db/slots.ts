import { eq } from 'drizzle-orm';

import type { Db } from './client';
import { slots } from './schema';
import type { SlotRow } from './schema';

export interface SlotPlacement {
  cardId: string;
  variant: string;
  quantity?: number;
  condition?: string | null;
}

export async function placeCard(
  db: Db,
  slotId: string,
  placement: SlotPlacement,
): Promise<void> {
  await db
    .update(slots)
    .set({
      cardId: placement.cardId,
      variant: placement.variant,
      quantity: placement.quantity ?? 1,
      condition: placement.condition ?? null,
      customImageUri: null,
    })
    .where(eq(slots.id, slotId));
}

export async function setSlotQuantity(
  db: Db,
  slotId: string,
  quantity: number,
): Promise<void> {
  await db.update(slots).set({ quantity }).where(eq(slots.id, slotId));
}

export async function clearSlot(db: Db, slotId: string): Promise<void> {
  await db
    .update(slots)
    .set({
      cardId: null,
      variant: null,
      quantity: 1,
      condition: null,
      customImageUri: null,
    })
    .where(eq(slots.id, slotId));
}

/**
 * Swap the contents of two pockets (drag & drop onto an occupied slot).
 * Merged-group membership stays with the pocket, not the contents.
 */
export async function swapSlotContents(
  db: Db,
  a: SlotRow,
  b: SlotRow,
): Promise<void> {
  const contents = ({ cardId, variant, quantity, condition, customImageUri }: SlotRow) => ({
    cardId,
    variant,
    quantity,
    condition,
    customImageUri,
  });
  await db.transaction(async (tx) => {
    await tx.update(slots).set(contents(b)).where(eq(slots.id, a.id));
    await tx.update(slots).set(contents(a)).where(eq(slots.id, b.id));
  });
}
