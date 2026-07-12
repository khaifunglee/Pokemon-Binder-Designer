/**
 * Variant stacking: when a binder has variant_stacking on, adding a card
 * that already lives in the binder stacks onto the existing pocket
 * (quantity + 1) instead of filling a second pocket.
 */

export interface StackCandidate {
  slotId: string;
  cardId: string | null;
  quantity: number;
}

export type PlacementResolution =
  | { action: 'stack'; slotId: string; newQuantity: number }
  | { action: 'place' };

export function resolvePlacement(opts: {
  variantStacking: boolean;
  cardId: string;
  existing: StackCandidate[];
}): PlacementResolution {
  if (!opts.variantStacking) return { action: 'place' };
  const match = opts.existing.find((s) => s.cardId === opts.cardId);
  if (!match) return { action: 'place' };
  return { action: 'stack', slotId: match.slotId, newQuantity: match.quantity + 1 };
}

/** Slot state for retroactive stack/unstack planning, in ordinal order. */
export interface StackSlotState {
  slotId: string;
  cardId: string | null;
  variant: string | null;
  quantity: number;
  condition: string | null;
  /** Merged-group / custom-image pockets are never touched. */
  pinned: boolean;
}

export interface ConsolidatePlan {
  /** First pocket of each duplicated card gets the summed quantity. */
  updates: { slotId: string; quantity: number }[];
  /** The other duplicates empty out. */
  clears: string[];
}

/**
 * Turning stacking ON with duplicates already placed: combine every
 * unpinned pocket holding the same card into the earliest pocket.
 */
export function planConsolidate(slots: StackSlotState[]): ConsolidatePlan {
  const byCard = new Map<string, StackSlotState[]>();
  for (const s of slots) {
    if (s.pinned || s.cardId === null) continue;
    const list = byCard.get(s.cardId) ?? [];
    list.push(s);
    byCard.set(s.cardId, list);
  }
  const plan: ConsolidatePlan = { updates: [], clears: [] };
  for (const group of byCard.values()) {
    if (group.length < 2) continue;
    const total = group.reduce((n, s) => n + s.quantity, 0);
    plan.updates.push({ slotId: group[0].slotId, quantity: total });
    plan.clears.push(...group.slice(1).map((s) => s.slotId));
  }
  return plan;
}

export interface UnstackPlan {
  /** Stacked pockets drop back to quantity 1. */
  updates: { slotId: string }[];
  /** Copies that need pockets of their own, in source order. */
  overflow: { cardId: string; variant: string | null; condition: string | null }[];
}

/**
 * Turning stacking OFF: split every stacked pocket into singles. The
 * caller places the overflow into empty pockets (adding pages if needed).
 */
export function planUnstack(slots: StackSlotState[]): UnstackPlan {
  const plan: UnstackPlan = { updates: [], overflow: [] };
  for (const s of slots) {
    if (s.pinned || s.cardId === null || s.quantity <= 1) continue;
    plan.updates.push({ slotId: s.slotId });
    for (let i = 1; i < s.quantity; i++) {
      plan.overflow.push({ cardId: s.cardId, variant: s.variant, condition: s.condition });
    }
  }
  return plan;
}
