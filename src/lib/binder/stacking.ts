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
