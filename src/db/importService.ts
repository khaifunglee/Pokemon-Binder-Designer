import { asc, eq, inArray } from 'drizzle-orm';

import { matchCardInSet, planPlacements, resolveSetRef } from '../lib/import/resolve';
import type { CardRef } from '../lib/import/resolve';
import type { ImportRow } from '../lib/import/types';
import { addPages, touchBinder } from './binders';
import { listSetCards } from './cards';
import type { Db } from './client';
import { addOwned } from './collectionService';
import { layoutSpec } from '../lib/binder/layout';
import { binders, pages, sets, slots } from './schema';

export interface MatchedImportRow {
  row: ImportRow;
  cardId: string;
  cardName: string;
  setId: string;
  variant: string;
}

export interface ImportProblem {
  line: number;
  detail: string;
}

export interface ImportResolution {
  matched: MatchedImportRow[];
  problems: ImportProblem[];
}

/**
 * Resolve parsed CSV rows to concrete cards. Downloads referenced sets on
 * demand (once); rows referencing unknown or undownloadable sets become
 * problems, never failures.
 */
export async function resolveImport(
  db: Db,
  rows: ImportRow[],
): Promise<ImportResolution> {
  const allSets = await db
    .select({ id: sets.id, name: sets.name, ptcgoCode: sets.ptcgoCode })
    .from(sets);

  const matched: MatchedImportRow[] = [];
  const problems: ImportProblem[] = [];
  const rowsBySet = new Map<string, ImportRow[]>();

  for (const row of rows) {
    const ref = resolveSetRef(row, allSets);
    if (!ref) {
      problems.push({
        line: row.line,
        detail: `set not recognized: "${row.setCode ?? row.setName ?? '?'}"`,
      });
      continue;
    }
    const group = rowsBySet.get(ref.id) ?? [];
    group.push(row);
    rowsBySet.set(ref.id, group);
  }

  for (const [setId, setRows] of rowsBySet) {
    const cardRefs: CardRef[] = (await listSetCards(db, setId)).map((c) => ({
      id: c.id,
      name: c.name,
      number: c.number,
      variants: c.variants,
    }));

    for (const row of setRows) {
      if (cardRefs.length === 0) {
        problems.push({
          line: row.line,
          detail: `set not downloaded yet: ${allSets.find((s) => s.id === setId)?.name ?? setId}`,
        });
        continue;
      }
      const match = matchCardInSet(row, cardRefs);
      if (match.status === 'matched') {
        matched.push({
          row,
          cardId: match.card.id,
          cardName: match.card.name,
          setId,
          variant: match.variant,
        });
      } else {
        problems.push({
          line: row.line,
          detail:
            match.status === 'no-card'
              ? `no card "${row.name ?? row.number}" in ${setId}`
              : `ambiguous match for "${row.name ?? row.number}" in ${setId}`,
        });
      }
    }
  }

  // Keep source-file order for the preview.
  matched.sort((a, b) => a.row.line - b.row.line);
  problems.sort((a, b) => a.line - b.line);
  return { matched, problems };
}

export interface ImportApplyResult {
  pocketsFilled: number;
  pagesAdded: number;
  collectionEntries: number;
}

/**
 * Fill the binder's empty pockets (page order) with the matched cards,
 * growing the binder when it runs out of room, and add everything to the
 * collection. Pinned pockets (merged/custom-image) are never targets.
 */
export async function applyImport(
  db: Db,
  binderId: string,
  matched: MatchedImportRow[],
): Promise<ImportApplyResult> {
  const [binder] = await db.select().from(binders).where(eq(binders.id, binderId));
  if (!binder) throw new Error(`binder ${binderId} not found`);

  const placements = planPlacements(
    matched.map((m) => ({
      cardId: m.cardId,
      variant: m.variant,
      quantity: m.row.quantity,
    })),
    binder.variantStacking,
  );

  // Ordinal-ordered empty pockets.
  const emptySlots = (
    await db
      .select({
        slotId: slots.id,
        cardId: slots.cardId,
      })
      .from(slots)
      .innerJoin(pages, eq(slots.pageId, pages.id))
      .where(eq(pages.binderId, binderId))
      .orderBy(asc(pages.pageIndex), asc(slots.slotIndex))
  )
    .filter((s) => s.cardId === null)
    .map((s) => s.slotId);

  let targets = emptySlots;
  let pagesAdded = 0;
  if (targets.length < placements.length) {
    const { slotsPerPage } = layoutSpec(binder.layout);
    const missing = placements.length - targets.length;
    const newPages = Math.ceil(missing / slotsPerPage);
    const added = await addPages(db, binderId, newPages);
    pagesAdded = added.length;
    const newSlotIds = (
      await db
        .select({ slotId: slots.id, slotIndex: slots.slotIndex, pageIndex: pages.pageIndex })
        .from(slots)
        .innerJoin(pages, eq(slots.pageId, pages.id))
        .where(inArray(slots.pageId, added.map((p) => p.id)))
        .orderBy(asc(pages.pageIndex), asc(slots.slotIndex))
    ).map((s) => s.slotId);
    targets = [...targets, ...newSlotIds];
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      await tx
        .update(slots)
        .set({
          cardId: p.cardId,
          variant: p.variant,
          quantity: p.quantity,
          condition: null,
        })
        .where(eq(slots.id, targets[i]));
    }
  });

  await addOwned(
    db,
    placements.map((p) => ({
      cardId: p.cardId,
      variant: p.variant ?? 'normal',
      quantity: p.quantity,
    })),
  );
  await touchBinder(db, binderId);

  return {
    pocketsFilled: placements.length,
    pagesAdded,
    collectionEntries: placements.length,
  };
}
