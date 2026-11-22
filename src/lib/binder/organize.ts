import type { SortStrategy } from '../../db/schema';
import {
  compareMasterSet,
  rarityBucket,
  sortEntries,
  typeRank,
} from './sort';
import type { SortableEntry } from './sort';

/**
 * Auto-organize planning. Strategies produce a *sequence* of pocket
 * contents and the plan maps that sequence onto the binder's pockets.
 * Every collection-binder sort is packed: there are no pockets for
 * missing cards. The only intentional empties are page-break padding, so
 * each category (colour, rarity) or set (master-set) starts on a fresh
 * page; that's kept on purpose because real binders are laid out that
 * way. Pure; the DB layer applies the plan transactionally under the
 * shuffle overlay.
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

export interface SequenceContext {
  slotsPerPage: number;
}

function padToPageBreak(seq: (SortableEntry | null)[], slotsPerPage: number): void {
  if (seq.length === 0) return;
  while (seq.length % slotsPerPage !== 0) seq.push(null);
}

function trimTrailingNulls(seq: (SortableEntry | null)[]): (SortableEntry | null)[] {
  let end = seq.length;
  while (end > 0 && seq[end - 1] === null) end--;
  return seq.slice(0, end);
}

/** Groups (rank-ordered) each starting on a fresh page. */
function groupedSequence(
  entries: SortableEntry[],
  rankOf: (e: SortableEntry) => number,
  strategy: SortStrategy,
  slotsPerPage: number,
): (SortableEntry | null)[] {
  const byRank = new Map<number, SortableEntry[]>();
  for (const e of entries) {
    const rank = rankOf(e);
    const list = byRank.get(rank) ?? [];
    list.push(e);
    byRank.set(rank, list);
  }
  const seq: (SortableEntry | null)[] = [];
  for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
    padToPageBreak(seq, slotsPerPage);
    seq.push(...sortEntries(byRank.get(rank)!, strategy));
  }
  return seq;
}

/**
 * The target pocket-contents sequence for a strategy, always packed:
 * - master-set: owned cards in release / set / collector order; each set
 *   starts on a fresh page.
 * - pokedex: dex order, non-Pokémon after, no page breaks.
 * - colour / rarity: categories sorted internally, each category starting
 *   on a fresh page (colour = energy type; rarity = coarse buckets).
 */
export function buildSequence(
  entries: SortableEntry[],
  strategy: Exclude<SortStrategy, 'custom'>,
  ctx: SequenceContext,
): (SortableEntry | null)[] {
  const { slotsPerPage } = ctx;

  if (strategy === 'colour') {
    return trimTrailingNulls(groupedSequence(entries, typeRank, 'colour', slotsPerPage));
  }
  if (strategy === 'rarity') {
    return trimTrailingNulls(
      groupedSequence(entries, (e) => rarityBucket(e.rarity), 'rarity', slotsPerPage),
    );
  }
  if (strategy === 'pokedex') {
    return sortEntries(entries, 'pokedex');
  }

  // master-set
  const seq: (SortableEntry | null)[] = [];
  let previousSetId: string | null = null;
  for (const e of [...entries].sort(compareMasterSet)) {
    if (previousSetId !== null && e.setId !== previousSetId) {
      padToPageBreak(seq, slotsPerPage);
    }
    seq.push(e);
    previousSetId = e.setId;
  }
  return trimTrailingNulls(seq);
}

/**
 * Map a sequence onto the binder's unpinned pockets in page order and
 * emit only the pockets whose contents change. The caller must ensure
 * there are at least `sequence.length` unpinned pockets (adding pages).
 */
export function planFromSequence(
  slots: OrganizeSlot[],
  sequence: (SortableEntry | null)[],
): OrganizeChange[] {
  const movable = slots.filter((s) => !s.pinned);
  const contentsBySlot = new Map(movable.map((s) => [s.slotId, s.contents] as const));

  const changes: OrganizeChange[] = [];
  for (let i = 0; i < movable.length; i++) {
    const target = movable[i];
    const entry = i < sequence.length ? sequence[i] : null;
    const newContents = entry === null ? null : (contentsBySlot.get(entry.slotId) ?? null);
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
