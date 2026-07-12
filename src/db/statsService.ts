import { asc, eq, inArray, max, sql } from 'drizzle-orm';

import { computeCompletion, entryKey } from '../lib/binder/completion';
import type { CompletionSummary, SetCompletionInput } from '../lib/binder/completion';
import type { Db } from './client';
import { cardPrices, cards, collection, pages, sets, slots } from './schema';

export interface CardMeta {
  name: string;
  number: string;
}

export interface BinderStats {
  summary: CompletionSummary;
  /** setId → display name, for the per-set sections. */
  setNames: Map<string, string>;
  /** cardId → name/number, for rendering missing entries. */
  cardMeta: Map<string, CardMeta>;
  /** Newest price row among the binder's sets; null = no price data. */
  pricesFetchedAt: Date | null;
}

/**
 * Completion of a binder vs the full variant-level checklists of every
 * set it contains, plus USD cost-to-complete. Reads SQLite only.
 */
export async function computeBinderStats(
  db: Db,
  binderId: string,
): Promise<BinderStats> {
  const setIdRows = await db
    .selectDistinct({ setId: cards.setId })
    .from(slots)
    .innerJoin(pages, eq(slots.pageId, pages.id))
    .innerJoin(cards, eq(slots.cardId, cards.id))
    .where(eq(pages.binderId, binderId));
  const setIds = setIdRows.map((r) => r.setId);

  if (setIds.length === 0) {
    return {
      summary: { sets: [], total: 0, ownedCount: 0, costUsd: 0, unpricedCount: 0 },
      setNames: new Map(),
      cardMeta: new Map(),
      pricesFetchedAt: null,
    };
  }

  const [setRows, cardRows, ownedRows, priceRows, [priceAge]] = await Promise.all([
    db
      .select({ id: sets.id, name: sets.name, releaseDate: sets.releaseDate })
      .from(sets)
      .where(inArray(sets.id, setIds)),
    db
      .select({
        id: cards.id,
        setId: cards.setId,
        name: cards.name,
        number: cards.number,
        variants: cards.variants,
      })
      .from(cards)
      .where(inArray(cards.setId, setIds))
      .orderBy(asc(sql`CAST(${cards.number} AS INTEGER)`), asc(cards.number)),
    db
      .select({ cardId: collection.cardId, variant: collection.variant })
      .from(collection),
    db
      .select({
        cardId: cardPrices.cardId,
        variant: cardPrices.variant,
        marketUsd: cardPrices.marketUsd,
      })
      .from(cardPrices)
      .innerJoin(cards, eq(cardPrices.cardId, cards.id))
      .where(inArray(cards.setId, setIds)),
    db
      .select({ newest: max(cardPrices.fetchedAt) })
      .from(cardPrices)
      .innerJoin(cards, eq(cardPrices.cardId, cards.id))
      .where(inArray(cards.setId, setIds)),
  ]);

  const releaseOrder = new Map(setRows.map((s) => [s.id, s.releaseDate]));
  const inputs = new Map<string, SetCompletionInput>(
    setIds.map((id) => [id, { setId: id, entries: [] }]),
  );
  const cardMeta = new Map<string, CardMeta>();
  for (const card of cardRows) {
    cardMeta.set(card.id, { name: card.name, number: card.number });
    const input = inputs.get(card.setId);
    if (!input) continue;
    for (const variant of card.variants.length > 0 ? card.variants : ['normal']) {
      input.entries.push({ cardId: card.id, variant });
    }
  }

  const ownedKeys = new Set(ownedRows.map((r) => entryKey(r)));
  const pricesUsd = new Map(priceRows.map((r) => [entryKey(r), r.marketUsd]));

  const orderedInputs = [...inputs.values()].sort((a, b) =>
    (releaseOrder.get(a.setId) ?? '') < (releaseOrder.get(b.setId) ?? '') ? -1 : 1,
  );

  return {
    summary: computeCompletion(orderedInputs, ownedKeys, pricesUsd),
    setNames: new Map(setRows.map((s) => [s.id, s.name])),
    cardMeta,
    pricesFetchedAt: priceAge?.newest ?? null,
  };
}
