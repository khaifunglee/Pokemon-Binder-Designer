import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect } from 'react';

import migrations from '../../drizzle/migrations';
import { db } from './client';
import { ingestSets } from './ingest';

/**
 * Startup gate: schema migrations, then a background catalogue refresh.
 * The UI never waits on the network; offline, the refresh just fails
 * quietly and the app serves whatever SQLite already has.
 */
export function useDbReady(): { ready: boolean; error: Error | null } {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    if (!success) return;
    ingestSets(db).catch(() => {});
  }, [success]);

  return { ready: success, error: error ?? null };
}
