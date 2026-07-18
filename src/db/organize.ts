import { asc, eq, inArray } from 'drizzle-orm';

import { layoutSpec } from '../lib/binder/layout';
import { buildSequence, planFromSequence } from '../lib/binder/organize';
import type { OrganizeSlot, SequenceContext } from '../lib/binder/organize';
import { compareCollectorNumbers } from '../lib/binder/sort';
import type { SortableEntry } from '../lib/binder/sort';
import { addPages } from './binders';
import type { Db } from './client';
import { binders, cards, pages, sets, slots } from './schema';
import { getPokedexGaps } from './settingsService';
import type { BinderRow, SortStrategy } from './schema';

export interface OrganizePrep {
  binder: BinderRow;
  organizeSlots: OrganizeSlot[];
  sequence: (SortableEntry | null)[];
  /** Pages that must be added so every sequence position has a pocket. */
  pagesToAdd: number;
}

async function loadOrganizeSlots(db: Db, binderId: string): Promise<OrganizeSlot[]> {
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

  return rows.map((r) => ({
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
            cardId: r.cardId,
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
}

async function loadFullSets(
  db: Db,
  setIds: string[],
): Promise<SequenceContext['fullSets']> {
  if (setIds.length === 0) return [];
  const rows = await db
    .select({
      id: cards.id,
      setId: cards.setId,
      number: cards.number,
      releaseDate: sets.releaseDate,
    })
    .from(cards)
    .innerJoin(sets, eq(cards.setId, sets.id))
    .where(inArray(cards.setId, setIds));

  const bySet = new Map<string, { releaseDate: string; cards: { id: string; number: string }[] }>();
  for (const r of rows) {
    const entry = bySet.get(r.setId) ?? { releaseDate: r.releaseDate, cards: [] };
    entry.cards.push({ id: r.id, number: r.number });
    bySet.set(r.setId, entry);
  }
  return [...bySet.entries()].map(([setId, s]) => ({
    setId,
    releaseDate: s.releaseDate,
    cardIds: s.cards
      .sort((a, b) => compareCollectorNumbers(a.number, b.number))
      .map((c) => c.id),
  }));
}

export async function prepareOrganize(
  db: Db,
  binderId: string,
  strategy: Exclude<SortStrategy, 'custom'>,
): Promise<OrganizePrep> {
  const [binder] = await db.select().from(binders).where(eq(binders.id, binderId));
  if (!binder) throw new Error(`binder ${binderId} not found`);

  const organizeSlots = await loadOrganizeSlots(db, binderId);
  const entries: SortableEntry[] = organizeSlots
    .filter((s) => !s.pinned && s.contents !== null && s.sortable !== null)
    .map((s) => ({ slotId: s.slotId, ...s.sortable! }));

  const { slotsPerPage } = layoutSpec(binder.layout);
  const fullSets =
    strategy === 'master-set'
      ? await loadFullSets(db, [...new Set(entries.map((e) => e.setId))])
      : [];
  const pokedexGaps = strategy === 'pokedex' ? await getPokedexGaps(db) : true;

  const sequence = buildSequence(entries, strategy, {
    slotsPerPage,
    fullSets,
    pokedexGaps,
  });
  const movableCount = organizeSlots.filter((s) => !s.pinned).length;
  const pagesToAdd = Math.max(
    0,
    Math.ceil((sequence.length - movableCount) / slotsPerPage),
  );
  return { binder, organizeSlots, sequence, pagesToAdd };
}

/** Pages an organize would add — lets the UI confirm big growth first. */
export async function organizePageGrowth(
  db: Db,
  binderId: string,
  strategy: SortStrategy,
): Promise<number> {
  if (strategy === 'custom') return 0;
  return (await prepareOrganize(db, binderId, strategy)).pagesToAdd;
}

/**
 * One-tap reorganize: plans with pure logic, grows the binder if the
 * layout needs more pockets, rewrites changed pockets in a single
 * transaction, and records the strategy. Returns pockets changed.
 */
export async function autoOrganize(
  db: Db,
  binderId: string,
  strategy: SortStrategy,
): Promise<number> {
  if (strategy === 'custom') return 0;
  let prep = await prepareOrganize(db, binderId, strategy);
  if (prep.pagesToAdd > 0) {
    await addPages(db, binderId, prep.pagesToAdd);
    prep = { ...prep, organizeSlots: await loadOrganizeSlots(db, binderId) };
  }

  const changes = planFromSequence(prep.organizeSlots, prep.sequence);

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
