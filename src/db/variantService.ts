import { eq } from 'drizzle-orm';

import { logCatalogue } from '../lib/catalogueLog';
import {
  canAddManualVariant,
  mergeVariants,
  removableManualVariants,
} from '../lib/tcgdex/variants';
import type { Db } from './client';
import { cards } from './schema';
import { loadVariantSources } from './variantSources';
import type { DbOrTx, StoredVariantSources } from './variantSources';

/** Thrown when removing a manual variant the user owns or has placed. */
export class VariantInUseError extends Error {
  constructor(cardId: string, variant: string) {
    super(`${variant} of ${cardId} is owned or placed`);
    this.name = 'VariantInUseError';
  }
}

function loadOne(db: DbOrTx, cardId: string): StoredVariantSources {
  const sources = loadVariantSources(db, [cardId]).get(cardId);
  if (!sources) throw new Error(`card ${cardId} is not in the catalogue`);
  return sources;
}

function writeManual(
  db: DbOrTx,
  cardId: string,
  sources: StoredVariantSources,
  manual: string[],
): void {
  db.update(cards)
    .set({
      manualVariants: manual,
      variants: mergeVariants({
        flags: sources.flags,
        prices: sources.prices,
        manual,
        inUse: sources.inUse,
      }),
    })
    .where(eq(cards.id, cardId))
    .run();
}

/**
 * Add a variant TCGdex doesn't list (e.g. sm1-166 has no prices and
 * placeholder flags). Stored in manual_variants, which no sync touches.
 */
export async function addManualVariant(db: Db, cardId: string, variant: string): Promise<void> {
  // Sync callback: see loadVariantSources on drizzle's expo-sqlite transactions.
  db.transaction((tx) => {
    const sources = loadOne(tx, cardId);
    if (!canAddManualVariant(variant, sources.variants)) {
      throw new Error(`can't add ${variant} to ${cardId}`);
    }
    writeManual(tx, cardId, sources, [...sources.manual, variant]);
  });
  logCatalogue(`manual variant ${cardId} +${variant}`);
}

/** Remove a manual variant; refused while it's owned or placed. */
export async function removeManualVariant(
  db: Db,
  cardId: string,
  variant: string,
): Promise<void> {
  let removed = false;
  db.transaction((tx) => {
    const sources = loadOne(tx, cardId);
    if (!sources.manual.includes(variant)) return;
    if (!removableManualVariants(sources.manual, sources.inUse).includes(variant)) {
      throw new VariantInUseError(cardId, variant);
    }
    writeManual(
      tx,
      cardId,
      sources,
      sources.manual.filter((v) => v !== variant),
    );
    removed = true;
  });
  if (removed) logCatalogue(`manual variant ${cardId} -${variant}`);
}
