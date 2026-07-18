import type { SortStrategy } from '../../db/schema';
import {
  compareMasterSet,
  dexRank,
  rarityBucket,
  sortEntries,
  typeRank,
} from './sort';
import type { SortableEntry } from './sort';

/**
 * Auto-organize planning. Strategies produce a *sequence* of pocket
 * contents — entries interleaved with intentional empties (gaps for
 * missing cards, padding to start categories on fresh pages) — and the
 * plan maps that sequence onto the binder's unpinned pockets. Pure; the
 * DB layer applies the plan transactionally under the shuffle overlay.
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
  /**
   * Complete card-id lists per set (collector-number order), for
   * master-set gaps. Sets without any binder entry are ignored.
   */
  fullSets: { setId: string; releaseDate: string; cardIds: string[] }[];
  /**
   * Pokédex only: leave one empty pocket per missing dex number
   * (default) or pack cards without gaps. Sparse collections can
   * otherwise produce many blank pages.
   */
  pokedexGaps?: boolean;
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
 * The target pocket-contents sequence for a strategy:
 * - master-set: every card of each represented set in collector order,
 *   missing cards as gaps; each set starts on a fresh page.
 * - pokedex: one position per dex number from the lowest to the highest
 *   owned, missing numbers as gaps; non-Pokémon follow on a fresh page.
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
    if (ctx.pokedexGaps === false) {
      // Packed: dex order with no blank pockets at all.
      return sortEntries(entries, 'pokedex');
    }
    const seq: (SortableEntry | null)[] = [];
    const pokemon = entries
      .filter((e) => dexRank(e) !== Number.POSITIVE_INFINITY)
      .sort(compareMasterSet);
    const others = entries
      .filter((e) => dexRank(e) === Number.POSITIVE_INFINITY)
      .sort(compareMasterSet);

    if (pokemon.length > 0) {
      const byDex = new Map<number, SortableEntry[]>();
      for (const e of pokemon) {
        const dex = dexRank(e);
        const list = byDex.get(dex) ?? [];
        list.push(e);
        byDex.set(dex, list);
      }
      const dexes = [...byDex.keys()];
      const min = Math.min(...dexes);
      const max = Math.max(...dexes);
      for (let dex = min; dex <= max; dex++) {
        const at = byDex.get(dex);
        if (at) seq.push(...at);
        else seq.push(null); // gap: species missing from the binder
      }
    }
    if (others.length > 0) {
      padToPageBreak(seq, slotsPerPage);
      seq.push(...others);
    }
    return trimTrailingNulls(seq);
  }

  // master-set
  const byCard = new Map<string, SortableEntry[]>();
  for (const e of entries) {
    const list = byCard.get(e.cardId) ?? [];
    list.push(e);
    byCard.set(e.cardId, list);
  }
  const representedSets = ctx.fullSets
    .filter((s) => s.cardIds.some((id) => byCard.has(id)))
    .sort((a, b) =>
      a.releaseDate !== b.releaseDate
        ? a.releaseDate < b.releaseDate
          ? -1
          : 1
        : a.setId < b.setId
          ? -1
          : 1,
    );
  const seq: (SortableEntry | null)[] = [];
  const placed = new Set<string>();
  for (const set of representedSets) {
    padToPageBreak(seq, slotsPerPage);
    for (const cardId of set.cardIds) {
      const es = byCard.get(cardId);
      if (es) {
        seq.push(...es);
        placed.add(cardId);
      } else {
        seq.push(null); // gap: card missing from the binder
      }
    }
  }
  // Defensive: entries whose set isn't in ctx.fullSets still get placed.
  const leftovers = entries
    .filter((e) => !placed.has(e.cardId))
    .sort(compareMasterSet);
  if (leftovers.length > 0) {
    padToPageBreak(seq, slotsPerPage);
    seq.push(...leftovers);
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
