import cel25Cards from '../lib/tcg/__fixtures__/cards.cel25.json';
import setsFixture from '../lib/tcg/__fixtures__/sets.json';
import type { ApiCard, ApiSet } from '../lib/tcg/types';
import type { Db } from './client';
import { upsertSetCards, upsertSets } from './ingest';

/**
 * Seed SQLite from bundled fixture snapshots (see scripts/fetch-fixtures.mjs)
 * so dev builds have the full sets catalog and one set of cards with zero
 * network. Not wired into production flows.
 */
export async function devSeedFromFixtures(db: Db): Promise<void> {
  await upsertSets(db, setsFixture as ApiSet[]);
  await upsertSetCards(db, 'cel25', cel25Cards as ApiCard[]);
}
