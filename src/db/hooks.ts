import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useState } from 'react';

import migrations from '../../drizzle/migrations';
import { db } from './client';
import { devSeedFromFixtures } from './devSeed';
import { ingestSets } from './ingest';

/**
 * Migrations + dev seed gate, then a background sets-catalog refresh.
 * The refresh never blocks readiness: the UI runs from SQLite alone.
 */
export function useDbReady(): { ready: boolean; error: Error | null } {
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!success) return;
    (async () => {
      if (__DEV__) {
        await devSeedFromFixtures(db).catch((e) =>
          console.warn('dev seed failed', e),
        );
      }
      setSeeded(true);
      ingestSets(db).catch(() => {}); // offline: retry next launch
    })();
  }, [success]);

  return { ready: success && seeded, error: error ?? null };
}
