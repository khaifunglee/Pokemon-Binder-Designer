import { useNavigation } from '@react-navigation/native';
import { desc, eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { db } from '../../db/client';
import { cards, collection, sets } from '../../db/schema';
import { CARD_IMAGE_CACHE_POLICY } from '../cards/images';

export function ChecklistSetsScreen() {
  const navigation = useNavigation();
  const { data: setRows } = useLiveQuery(
    db.select().from(sets).orderBy(desc(sets.releaseDate)),
  );
  // Distinct owned cards per set (any variant counts as owned once).
  const { data: ownedRows } = useLiveQuery(
    db
      .select({
        setId: cards.setId,
        owned: sql<number>`COUNT(DISTINCT ${cards.id})`.as('owned'),
      })
      .from(collection)
      .innerJoin(cards, eq(collection.cardId, cards.id))
      .groupBy(cards.setId),
  );

  const ownedBySet = useMemo(
    () => new Map((ownedRows ?? []).map((r) => [r.setId, r.owned])),
    [ownedRows],
  );

  return (
    <FlatList
      style={styles.list}
      data={setRows ?? []}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => {
        const owned = ownedBySet.get(item.id) ?? 0;
        return (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('Checklist', { setId: item.id })}
          >
            <Image
              source={{ uri: item.symbolUri ?? undefined }}
              style={styles.symbol}
              contentFit="contain"
              cachePolicy={CARD_IMAGE_CACHE_POLICY}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub}>
                {item.series} · {owned}/{item.total} owned
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, (owned / Math.max(1, item.total)) * 100)}%` },
                ]}
              />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  symbol: { width: 28, height: 28 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, color: '#888' },
  progressTrack: {
    width: 56,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#eceff1',
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#66bb6a' },
});
