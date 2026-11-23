import { eq, sql } from 'drizzle-orm';

import type { Db } from './client';
import { appSettings } from './schema';

/** Keys for catalogue sync bookkeeping (values are ISO timestamps). */
export const CATALOGUE_ONBOARDED_KEY = 'catalogueOnboardedAt';
export const CATALOGUE_RECHECKED_KEY = 'catalogueRecheckedAt';

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: sql`excluded.value` } });
}
