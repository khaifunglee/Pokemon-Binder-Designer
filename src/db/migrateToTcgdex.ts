import { eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { fetchSetBriefs, fetchSetDetails } from '../lib/tcgdex/api';
import { mapCardBrief, mapSetDetail } from '../lib/tcgdex/mappers';
import { numberKey } from '../lib/import/resolve';
import type { Db } from './client';
import { appSettings, cardPrices, cards, collection, sets, slots } from './schema';

const SOURCE_KEY = 'catalogSource';

export async function isOnTcgdex(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SOURCE_KEY));
  return row?.value === 'tcgdex';
}

export interface MigrationResult {
  setsCataloged: number;
  cardsRemapped: number;
  /** References that couldn't be matched and were cleared/dropped. */
  unmapped: number;
}

/**
 * One-time switch of the card catalog from pokemontcg.io to TCGdex
 * (upstream stalled after the Scrydex takeover — see PROGRESS.md).
 * Card ids differ between the APIs ("me4-1" vs "me04-001"), so every
 * stored reference is remapped: sets match by name, cards by collector
 * number within the set. Needs network; callers retry next launch on
 * failure. Old card/price rows are dropped; sets re-ingest on demand.
 */
export async function migrateToTcgdex(
  db: Db,
  onProgress?: (stage: string) => void,
): Promise<MigrationResult> {
  onProgress?.('Fetching the new set catalog…');
  const briefs = await fetchSetBriefs();
  const details = await fetchSetDetails(briefs.map((b) => b.id));
  const newSetRows = details.map(mapSetDetail);

  // Old set id → new set detail, matched by (unique-enough) name.
  const oldSets = await db.select({ id: sets.id, name: sets.name }).from(sets);
  const detailByName = new Map(details.map((d) => [d.name.trim().toLowerCase(), d]));
  const newSetByOldId = new Map(
    oldSets
      .map((old) => [old.id, detailByName.get(old.name.trim().toLowerCase())] as const)
      .filter(([, d]) => d !== undefined),
  );

  onProgress?.('Remapping your cards…');
  // Every old card id referenced by user data.
  const referencedRows = [
    ...(await db
      .selectDistinct({ cardId: slots.cardId })
      .from(slots)
      .where(isNotNull(slots.cardId))),
    ...(await db.selectDistinct({ cardId: collection.cardId }).from(collection)),
  ];
  const referenced = [...new Set(referencedRows.map((r) => r.cardId!))];

  const oldCards = referenced.length
    ? await db
        .select({ id: cards.id, setId: cards.setId, number: cards.number })
        .from(cards)
        .where(inArray(cards.id, referenced))
    : [];

  const idMap = new Map<string, string>(); // old card id → new card id
  const placeholders = new Map<string, ReturnType<typeof mapCardBrief>>();
  for (const old of oldCards) {
    const newSet = newSetByOldId.get(old.setId);
    if (!newSet) continue;
    const brief = newSet.cards.find(
      (c) => numberKey(c.localId) === numberKey(old.number),
    );
    if (!brief) continue;
    idMap.set(old.id, brief.id);
    placeholders.set(brief.id, mapCardBrief(brief, newSet.id));
  }
  const unmapped = referenced.filter((id) => !idMap.has(id));

  onProgress?.('Rewriting the database…');
  await db.transaction(async (tx) => {
    // Detach unmappable references first so nothing dangles.
    if (unmapped.length > 0) {
      await tx
        .update(slots)
        .set({ cardId: null, variant: null, quantity: 1, condition: null })
        .where(inArray(slots.cardId, unmapped));
      await tx.delete(collection).where(inArray(collection.cardId, unmapped));
    }
    // Break FK pressure: park slot references, swap catalog, restore.
    const slotRows = await tx
      .select({ id: slots.id, cardId: slots.cardId })
      .from(slots)
      .where(isNotNull(slots.cardId));
    const collectionRows = await tx.select().from(collection);

    await tx.update(slots).set({ cardId: null }).where(isNotNull(slots.cardId));
    await tx.delete(collection);
    await tx.delete(cardPrices);
    await tx.delete(cards);
    await tx.delete(sets);

    for (const batch of chunk([...newSetRows], 100)) {
      await tx.insert(sets).values(batch);
    }
    for (const batch of chunk([...placeholders.values()], 100)) {
      await tx.insert(cards).values(batch);
    }
    for (const row of slotRows) {
      const newId = idMap.get(row.cardId!);
      if (newId) {
        await tx.update(slots).set({ cardId: newId }).where(eq(slots.id, row.id));
      }
    }
    const newCollection = collectionRows
      .map((r) => ({ ...r, cardId: idMap.get(r.cardId) }))
      .filter((r): r is typeof collectionRows[number] => r.cardId !== undefined);
    for (const batch of chunk(newCollection, 100)) {
      await tx.insert(collection).values(batch);
    }

    await tx
      .insert(appSettings)
      .values({ key: SOURCE_KEY, value: 'tcgdex' })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: sql`excluded.value` },
      });
  });

  return {
    setsCataloged: newSetRows.length,
    cardsRemapped: idMap.size,
    unmapped: unmapped.length,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
