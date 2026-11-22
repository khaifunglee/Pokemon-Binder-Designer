import { asc, eq } from 'drizzle-orm';

import { planConsolidate, planUnstack } from '../lib/binder/stacking';
import type { StackSlotState } from '../lib/binder/stacking';
import { layoutSpec } from '../lib/binder/layout';
import { addPages, touchBinder } from './binders';
import type { Db } from './client';
import { binders, pages, slots } from './schema';

async function loadStackSlots(db: Db, binderId: string): Promise<StackSlotState[]> {
  const rows = await db
    .select({
      slotId: slots.id,
      cardId: slots.cardId,
      variant: slots.variant,
      quantity: slots.quantity,
      condition: slots.condition,
    })
    .from(slots)
    .innerJoin(pages, eq(slots.pageId, pages.id))
    .where(eq(pages.binderId, binderId))
    .orderBy(asc(pages.pageIndex), asc(slots.slotIndex));
  return rows.map((r) => ({
    slotId: r.slotId,
    cardId: r.cardId,
    variant: r.variant,
    quantity: r.quantity,
    condition: r.condition,
  }));
}

/** Combine duplicate cards into single stacked pockets. Returns pockets freed. */
export async function consolidateDuplicates(
  db: Db,
  binderId: string,
): Promise<number> {
  const plan = planConsolidate(await loadStackSlots(db, binderId));
  if (plan.updates.length === 0) return 0;

  await db.transaction(async (tx) => {
    for (const u of plan.updates) {
      await tx.update(slots).set({ quantity: u.quantity }).where(eq(slots.id, u.slotId));
    }
    for (const slotId of plan.clears) {
      await tx
        .update(slots)
        .set({ cardId: null, variant: null, quantity: 1, condition: null })
        .where(eq(slots.id, slotId));
    }
  });
  await touchBinder(db, binderId);
  return plan.clears.length;
}

/** Split stacked pockets into singles, growing the binder if needed. */
export async function unstackDuplicates(db: Db, binderId: string): Promise<number> {
  const state = await loadStackSlots(db, binderId);
  const plan = planUnstack(state);
  if (plan.overflow.length === 0) return 0;

  let empties = state
    .filter((s) => s.cardId === null)
    .map((s) => s.slotId);

  if (empties.length < plan.overflow.length) {
    const [binder] = await db.select().from(binders).where(eq(binders.id, binderId));
    if (!binder) throw new Error(`binder ${binderId} not found`);
    const { slotsPerPage } = layoutSpec(binder.layout);
    const missing = plan.overflow.length - empties.length;
    await addPages(db, binderId, Math.ceil(missing / slotsPerPage));
    const newSlots = await db
      .select({ slotId: slots.id })
      .from(slots)
      .innerJoin(pages, eq(slots.pageId, pages.id))
      .where(eq(pages.binderId, binderId))
      .orderBy(asc(pages.pageIndex), asc(slots.slotIndex));
    const known = new Set(state.map((s) => s.slotId));
    empties = [...empties, ...newSlots.map((s) => s.slotId).filter((id) => !known.has(id))];
  }

  await db.transaction(async (tx) => {
    for (const u of plan.updates) {
      await tx.update(slots).set({ quantity: 1 }).where(eq(slots.id, u.slotId));
    }
    for (let i = 0; i < plan.overflow.length; i++) {
      const o = plan.overflow[i];
      await tx
        .update(slots)
        .set({ cardId: o.cardId, variant: o.variant, quantity: 1, condition: o.condition })
        .where(eq(slots.id, empties[i]));
    }
  });
  await touchBinder(db, binderId);
  return plan.overflow.length;
}
