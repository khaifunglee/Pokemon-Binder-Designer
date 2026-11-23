import { asc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '../../db/client';
import { binders, cards, pages, slots } from '../../db/schema';
import type { BinderRow, SlotRow } from '../../db/schema';

export interface PocketVM {
  slot: SlotRow;
  imageSmallUri: string | null;
  imageLargeUri: string | null;
  cardName: string | null;
  cardNumber: string | null;
}

export interface PageVM {
  pageId: string;
  pageIndex: number;
  pockets: PocketVM[];
}

/** Live view of a binder's pages and pockets; re-renders on any DB change. */
export function useBinderSpread(binderId: string): {
  binder: BinderRow | null;
  pages: PageVM[];
} {
  const { data: binderRows } = useLiveQuery(
    db.select().from(binders).where(eq(binders.id, binderId)),
    [binderId],
  );

  const { data: slotRows } = useLiveQuery(
    db
      .select({
        slot: slots,
        pageId: pages.id,
        pageIndex: pages.pageIndex,
        imageSmallUri: cards.imageSmallUri,
        imageLargeUri: cards.imageLargeUri,
        cardName: cards.name,
        cardNumber: cards.number,
      })
      .from(slots)
      .innerJoin(pages, eq(slots.pageId, pages.id))
      .leftJoin(cards, eq(slots.cardId, cards.id))
      .where(eq(pages.binderId, binderId))
      .orderBy(asc(pages.pageIndex), asc(slots.slotIndex)),
    [binderId],
  );

  const pageVMs = useMemo(() => {
    const byPage = new Map<string, PageVM>();
    for (const row of slotRows ?? []) {
      let page = byPage.get(row.pageId);
      if (!page) {
        page = { pageId: row.pageId, pageIndex: row.pageIndex, pockets: [] };
        byPage.set(row.pageId, page);
      }
      page.pockets.push({
        slot: row.slot,
        imageSmallUri: row.imageSmallUri,
        imageLargeUri: row.imageLargeUri,
        cardName: row.cardName,
        cardNumber: row.cardNumber,
      });
    }
    return [...byPage.values()].sort((a, b) => a.pageIndex - b.pageIndex);
  }, [slotRows]);

  return { binder: binderRows?.[0] ?? null, pages: pageVMs };
}
