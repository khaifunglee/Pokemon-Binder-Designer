import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useState } from 'react';

import migrations from '../../drizzle/migrations';
import { db } from './client';
import { ingestSets } from './ingest';
import { isOnTcgdex, migrateToTcgdex } from './migrateToTcgdex';

/**
 * Startup gate: schema migrations, then (once) the pokemontcg.io →
 * TCGdex catalog migration, then a background catalog refresh. The
 * TCGdex migration needs network; when offline it defers to the next
 * launch and the app keeps serving whatever SQLite already has.
 */
export function useDbReady(): {
  ready: boolean;
  error: Error | null;
  status: string | null;
} {
  const { success, error } = useMigrations(db, migrations);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!success) return;
    (async () => {
      let onTcgdex = await isOnTcgdex(db);
      if (!onTcgdex) {
        try {
          setStatus('Upgrading card database…');
          await migrateToTcgdex(db, setStatus);
          onTcgdex = true;
        } catch (e) {
          console.warn('TCGdex migration deferred (offline?)', e);
        }
        setStatus(null);
      }
      setReady(true);
      // Catalog refresh only makes sense against the new source; mixing
      // TCGdex sets into an unmigrated catalog would duplicate it.
      if (onTcgdex) ingestSets(db).catch(() => {});
    })();
  }, [success]);

  return { ready: success && ready, error: error ?? null, status };
}
