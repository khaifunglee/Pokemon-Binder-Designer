import { eq, sql } from 'drizzle-orm';

import type { Db } from './client';
import { appSettings } from './schema';

const POKEDEX_GAPS_KEY = 'pokedexGaps';

/**
 * Whether pokédex organizing leaves an empty pocket per missing dex
 * number (default) or packs cards with no gaps. Persisted so 1-tap
 * re-organize and the physical re-sort use the same choice.
 */
export async function getPokedexGaps(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, POKEDEX_GAPS_KEY));
  return row?.value !== '0';
}

export async function setPokedexGaps(db: Db, gaps: boolean): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: POKEDEX_GAPS_KEY, value: gaps ? '1' : '0' })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: sql`excluded.value` },
    });
}
