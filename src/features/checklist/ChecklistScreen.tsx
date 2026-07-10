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

type Props = NativeStackScreenProps<RootStackParamList, 'Checklist'>;

/**
 * Rapid multi-tap checklist: each row toggles owned instantly (writes are
 * synchronous-fast SQLite updates; the live query re-renders). Quantity
 * steppers appear on owned rows.
 */
export function ChecklistScreen({ route, navigation }: Props) {
  const { setId } = route.params;
  const [downloading, setDownloading] = useState(true);

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

  const ownedByCard = useMemo(() => {
    const map = new Map<string, { variant: string; quantity: number }>();
    for (const row of ownedRows ?? []) {
      const existing = map.get(row.cardId);
      map.set(row.cardId, {
        variant: row.variant,
        quantity: (existing?.quantity ?? 0) + row.quantity,
      });
    }
    return map;
  }, [ownedRows]);

  useLayoutEffect(() => {
    const total = setRows?.[0]?.total;
    navigation.setOptions({
      title: setRows?.[0]?.name ?? 'Checklist',
      headerRight: () =>
        total ? (
          <Text style={styles.headerCount}>
            {ownedByCard.size}/{total}
          </Text>
        ) : null,
    });
  }, [navigation, setRows, ownedByCard.size]);

  const defaultVariant = (card: CardRow) => card.variants[0] ?? 'normal';

  const onToggle = (card: CardRow) => {
    const owned = ownedByCard.get(card.id);
    // Toggle whichever variant the user owns; default variant when none.
    void toggleOwned(db, card.id, owned?.variant ?? defaultVariant(card));
    void Haptics.selectionAsync();
  };

  if (downloading && (cardRows ?? []).length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.hint}>Downloading set…</Text>
      </View>
    );
  }
  if ((cardRows ?? []).length === 0) {
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
      data={cardRows ?? []}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => {
        const owned = ownedByCard.get(item.id);
        return (
          <Pressable
            style={[styles.row, owned && styles.rowOwned]}
            onPress={() => onToggle(item)}
          >
            <Image
              source={{ uri: item.imageSmallUri ?? undefined }}
              style={styles.thumb}
              contentFit="contain"
              cachePolicy={CARD_IMAGE_CACHE_POLICY}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                #{item.number} {item.name}
              </Text>
              <Text style={styles.rowSub}>{item.rarity ?? item.supertype}</Text>
            </View>
            {owned ? (
              <View style={styles.qtyControls}>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    void adjustOwnedQuantity(db, item.id, owned.variant, -1)
                  }
                >
                  <Text style={styles.qtyBtn}>−</Text>
                </Pressable>
                <Text style={styles.qtyText}>{owned.quantity}</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    void adjustOwnedQuantity(db, item.id, owned.variant, 1)
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
  headerCount: { color: '#66bb6a', fontWeight: '700', fontSize: 15 },
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
