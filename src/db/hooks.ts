import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useCallback, useEffect, useState } from 'react';

import migrations from '../../drizzle/migrations';
import { isOnboarded, runStartupSync, runVariantTopUp } from './catalogueSync';
import { db } from './client';

/**
 * Startup gate: schema migrations, then either first-launch onboarding
 * (the catalogue download) or a background refresh. After onboarding the
 * UI never waits on the network.
 */
export function useDbReady(): {
  ready: boolean;
  error: Error | null;
  /** null until known; false shows the onboarding screen. */
  onboarded: boolean | null;
  finishOnboarding: () => void;
} {
  const { success, error } = useMigrations(db, migrations);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!success) return;
    let cancelled = false;
    void isOnboarded(db).then((done) => {
      if (cancelled) return;
      setOnboarded(done);
      if (done) void runStartupSync(db);
    });
    return () => {
      cancelled = true;
    };
  }, [success]);

  const finishOnboarding = useCallback(() => {
    setOnboarded(true);
    // Onboarding just synced every set; only the variant top-up remains.
    void runVariantTopUp(db);
  }, []);

  return { ready: success, error: error ?? null, onboarded, finishOnboarding };
}
