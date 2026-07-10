import type { SortStrategy } from '../../db/schema';
import { sortEntries } from './sort';
import type { SortableEntry } from './sort';

/**
 * Auto-organize planning: given every pocket of a binder in ordinal order
 * (page order, then slot order), compute which pockets change and what
 * they should hold. Pure — the DB layer applies the plan transactionally
 * while the shuffle animation plays.
 */

export interface PocketContents {
  cardId: string;
  variant: string | null;
  quantity: number;
  condition: string | null;
}

export interface OrganizeSlot {
  slotId: string;
  /** Contents, or null for an empty pocket. */
  contents: PocketContents | null;
  /** Sort metadata for filled pockets (join with cards/sets). */
  sortable: Omit<SortableEntry, 'slotId'> | null;
  /** Merged regions and custom images are pinned: never moved or overwritten. */
  pinned: boolean;
}

export interface OrganizeChange {
  slotId: string;
  contents: PocketContents | null;
}

/**
 * Cards flow into unpinned pockets in sorted order; leftover unpinned
 * pockets empty out. Pinned pockets keep their contents and are skipped
 * as targets. Returns only the pockets that actually change.
 */
export function planOrganize(
  slots: OrganizeSlot[],
  strategy: SortStrategy,
): OrganizeChange[] {
  if (strategy === 'custom') return [];

  const movable = slots.filter((s) => !s.pinned);
  const entries: SortableEntry[] = movable
    .filter((s) => s.contents !== null && s.sortable !== null)
    .map((s) => ({ slotId: s.slotId, ...s.sortable! }));

  const sorted = sortEntries(entries, strategy);
  const contentsBySlot = new Map(
    movable.map((s) => [s.slotId, s.contents] as const),
  );

  const changes: OrganizeChange[] = [];
  for (let i = 0; i < movable.length; i++) {
    const target = movable[i];
    const newContents =
      i < sorted.length ? contentsBySlot.get(sorted[i].slotId)! : null;
    const old = target.contents;
    const same =
      (old === null && newContents === null) ||
      (old !== null &&
        newContents !== null &&
        old.cardId === newContents.cardId &&
        old.variant === newContents.variant &&
        old.quantity === newContents.quantity &&
        old.condition === newContents.condition);
    if (!same) changes.push({ slotId: target.slotId, contents: newContents });
  }
  return changes;
}
