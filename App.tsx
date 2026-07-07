import { count } from 'drizzle-orm';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import migrations from './drizzle/migrations';
import { db } from './src/db/client';
import { devSeedFromFixtures } from './src/db/devSeed';
import { ingestSets } from './src/db/ingest';
import { cards, sets } from './src/db/schema';

export default function App() {
  const { success, error } = useMigrations(db, migrations);
  const [counts, setCounts] = useState<{ sets: number; cards: number }>();

  useEffect(() => {
    if (!success) return;
    let cancelled = false;

    const refreshCounts = async () => {
      const [[setCount], [cardCount]] = await Promise.all([
        db.select({ n: count() }).from(sets),
        db.select({ n: count() }).from(cards),
      ]);
      if (!cancelled) setCounts({ sets: setCount.n, cards: cardCount.n });
    };

    (async () => {
      if (__DEV__) {
        await devSeedFromFixtures(db).catch((e) =>
          console.warn('dev seed failed', e),
        );
      }
      await refreshCounts();
      // Background catalog refresh; offline failure is fine — the UI runs
      // entirely from SQLite and retries on next launch.
      await ingestSets(db).catch(() => {});
      await refreshCounts();
    })();

    return () => {
      cancelled = true;
    };
  }, [success]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text>Database migration failed: {error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text>PokéBinder — M0</Text>
      <Text>
        {counts
          ? `${counts.sets} sets, ${counts.cards} cards in SQLite`
          : 'preparing database…'}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
