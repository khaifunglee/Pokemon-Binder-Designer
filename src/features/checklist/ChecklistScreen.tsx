import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { asc, eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../db/client';
import { adjustOwnedQuantity, toggleOwned } from '../../db/collectionService';
import { ensureSetCards } from '../../db/ingest';
import { cards, collection, sets } from '../../db/schema';
import type { CardRow } from '../../db/schema';
import type { RootStackParamList } from '../../navigation/types';
import { CARD_IMAGE_CACHE_POLICY } from '../cards/images';
import { variantLabel } from '../cards/variantLabels';

type Props = NativeStackScreenProps<RootStackParamList, 'Checklist'>;

/** One checklist row per printed variant of each card. */
interface ChecklistEntry {
  card: CardRow;
  variant: string;
}

/**
 * Rapid multi-tap checklist: each row toggles owned instantly (writes are
 * synchronous-fast SQLite updates; the live query re-renders). Quantity
 * steppers appear on owned rows.
 */
export function ChecklistScreen({ route, navigation }: Props) {
  const { setId } = route.params;
  const [downloading, setDownloading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureSetCards(db, setId)
      .catch(() => {}) // offline with an ingested set still works below
      .finally(() => !cancelled && setDownloading(false));
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const { data: setRows } = useLiveQuery(
    db.select().from(sets).where(eq(sets.id, setId)),
    [setId],
  );
  const { data: cardRows } = useLiveQuery(
    db
      .select()
      .from(cards)
      .where(eq(cards.setId, setId))
      .orderBy(asc(sql`CAST(${cards.number} AS INTEGER)`), asc(cards.number)),
    [setId],
  );
  const { data: ownedRows } = useLiveQuery(
    db
      .select({
        cardId: collection.cardId,
        variant: collection.variant,
        quantity: collection.quantityOwned,
      })
      .from(collection)
      .innerJoin(cards, eq(collection.cardId, cards.id))
      .where(eq(cards.setId, setId)),
    [setId],
  );

  // One row per (card, variant) — holos and reverses are tracked apart.
  const entries = useMemo<ChecklistEntry[]>(
    () =>
      (cardRows ?? []).flatMap((card) =>
        (card.variants.length > 0 ? card.variants : ['normal']).map((variant) => ({
          card,
          variant,
        })),
      ),
    [cardRows],
  );

  const ownedByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of ownedRows ?? []) {
      map.set(`${row.cardId}::${row.variant}`, row.quantity);
    }
    return map;
  }, [ownedRows]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: setRows?.[0]?.name ?? 'Checklist',
      headerRight: () => (
        <View style={styles.headerRow}>
          {entries.length > 0 && (
            <Text style={styles.headerCount}>
              {ownedByKey.size}/{entries.length}
            </Text>
          )}
          <Pressable
            hitSlop={10}
            disabled={refreshing}
            // Re-download the set's card data (variants, images, names).
            onPress={() => {
              setRefreshing(true);
              void ensureSetCards(db, setId, { force: true })
                .catch(() => {})
                .finally(() => setRefreshing(false));
            }}
          >
            <Text style={[styles.headerRefresh, refreshing && styles.headerRefreshOff]}>
              ↻
            </Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, setRows, ownedByKey.size, entries.length, refreshing, setId]);

  if (downloading && entries.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.hint}>Downloading set…</Text>
      </View>
    );
  }
  if (entries.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>
          This set needs to be downloaded once — connect to the internet and retry.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={entries}
      keyExtractor={(e) => `${e.card.id}::${e.variant}`}
      renderItem={({ item }) => {
        const quantity = ownedByKey.get(`${item.card.id}::${item.variant}`);
        const owned = quantity !== undefined;
        return (
          <Pressable
            style={[styles.row, owned && styles.rowOwned]}
            onPress={() => {
              void toggleOwned(db, item.card.id, item.variant);
              void Haptics.selectionAsync();
            }}
          >
            <Image
              source={{ uri: item.card.imageSmallUri ?? undefined }}
              style={styles.thumb}
              contentFit="contain"
              cachePolicy={CARD_IMAGE_CACHE_POLICY}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                #{item.card.number} {item.card.name}
              </Text>
              <Text style={styles.rowSub}>
                {variantLabel(item.variant)}
                {item.card.rarity ? ` · ${item.card.rarity}` : ''}
              </Text>
            </View>
            {owned ? (
              <View style={styles.qtyControls}>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    void adjustOwnedQuantity(db, item.card.id, item.variant, -1)
                  }
                >
                  <Text style={styles.qtyBtn}>−</Text>
                </Pressable>
                <Text style={styles.qtyText}>{quantity}</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    void adjustOwnedQuantity(db, item.card.id, item.variant, 1)
                  }
                >
                  <Text style={styles.qtyBtn}>＋</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.checkbox} />
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  hint: { color: '#999', textAlign: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerCount: { color: '#66bb6a', fontWeight: '700', fontSize: 15 },
  headerRefresh: { color: '#e3350d', fontSize: 19, fontWeight: '600' },
  headerRefreshOff: { color: '#cfd8dc' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  rowOwned: { backgroundColor: '#f1f8e9' },
  thumb: { width: 36, height: 50 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '500' },
  rowSub: { fontSize: 12, color: '#999' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#cfd8dc',
  },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { fontSize: 18, color: '#66bb6a', fontWeight: '700' },
  qtyText: { fontSize: 15, fontWeight: '600', minWidth: 18, textAlign: 'center' },
});
