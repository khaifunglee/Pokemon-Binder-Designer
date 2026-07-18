import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { asc, eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { getDisplayCurrency, getRate } from '../../db/ratesService';
import { cardPrices, cards, collection, sets } from '../../db/schema';
import type { CardRow } from '../../db/schema';
import { convertUsd, formatCurrency } from '../../lib/currency';
import type { RootStackParamList } from '../../navigation/types';
import { CARD_IMAGE_CACHE_POLICY } from '../cards/images';
import { variantLabel } from '../cards/variantLabels';

type Props = NativeStackScreenProps<RootStackParamList, 'Checklist'>;

/** One checklist row per printed variant of each card. */
interface ChecklistEntry {
  card: CardRow;
  variant: string;
}

interface RowProps {
  card: CardRow;
  variant: string;
  /** Owned quantity; undefined = not owned. */
  quantity: number | undefined;
  priceLabel: string | null;
  onToggle: (cardId: string, variant: string) => void;
  onAdjust: (cardId: string, variant: string, delta: number) => void;
}

/** Memoized: a toggle re-renders only the row it changed. */
const ChecklistRow = memo(function ChecklistRow({
  card,
  variant,
  quantity,
  priceLabel,
  onToggle,
  onAdjust,
}: RowProps) {
  const owned = quantity !== undefined;
  return (
    <Pressable
      style={[styles.row, owned && styles.rowOwned]}
      onPress={() => onToggle(card.id, variant)}
    >
      <Image
        source={{ uri: card.imageSmallUri ?? undefined }}
        style={styles.thumb}
        contentFit="contain"
        cachePolicy={CARD_IMAGE_CACHE_POLICY}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          #{card.number} {card.name}
        </Text>
        <Text style={styles.rowSub}>
          {variantLabel(variant)}
          {card.rarity ? ` · ${card.rarity}` : ''}
        </Text>
      </View>
      {priceLabel !== null && <Text style={styles.price}>{priceLabel}</Text>}
      {owned ? (
        <View style={styles.qtyControls}>
          <Pressable hitSlop={8} onPress={() => onAdjust(card.id, variant, -1)}>
            <Text style={styles.qtyBtn}>−</Text>
          </Pressable>
          <Text style={styles.qtyText}>{quantity}</Text>
          <Pressable hitSlop={8} onPress={() => onAdjust(card.id, variant, 1)}>
            <Text style={styles.qtyBtn}>＋</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.checkbox} />
      )}
    </Pressable>
  );
});

/**
 * Rapid multi-tap checklist. Taps update optimistic overrides
 * synchronously (instant visual feedback) while the SQLite write and the
 * live query confirm in the background.
 */
export function ChecklistScreen({ route, navigation }: Props) {
  const { setId } = route.params;
  const [downloading, setDownloading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** key → optimistic quantity (null = not owned); cleared on DB echo. */
  const [overrides, setOverrides] = useState<Map<string, number | null>>(new Map());
  const [priceLabels, setPriceLabels] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    ensureSetCards(db, setId)
      .catch(() => {}) // offline with an ingested set still works below
      .finally(() => !cancelled && setDownloading(false));
    return () => {
      cancelled = true;
    };
  }, [setId]);

  // Prices in the display currency; loaded once per visit (prices only
  // change on TTL refresh, not while tapping through a checklist).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [rows, currency] = await Promise.all([
        db
          .select({
            cardId: cardPrices.cardId,
            variant: cardPrices.variant,
            marketUsd: cardPrices.marketUsd,
          })
          .from(cardPrices)
          .innerJoin(cards, eq(cardPrices.cardId, cards.id))
          .where(eq(cards.setId, setId)),
        getDisplayCurrency(db),
      ]);
      const rate = (await getRate(db, currency)) ?? 1;
      if (cancelled) return;
      setPriceLabels(
        new Map(
          rows.map((r) => [
            `${r.cardId}::${r.variant}`,
            formatCurrency(convertUsd(r.marketUsd, rate), currency),
          ]),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, downloading, refreshing]);

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

  const dbOwnedByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of ownedRows ?? []) {
      map.set(`${row.cardId}::${row.variant}`, row.quantity);
    }
    return map;
  }, [ownedRows]);

  // Collection writes are serialized: toggleOwned/adjust read-then-write,
  // so two in-flight calls could interleave their reads and corrupt the
  // result under rapid tapping.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueWrite = useCallback((key: string, write: () => Promise<unknown>) => {
    writeQueue.current = writeQueue.current.then(write).catch(() => {
      // Write failed — drop the optimistic value so the row shows truth.
      setOverrides((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    });
  }, []);

  // An override clears only when the DB echo CONFIRMS it. Clearing on
  // write completion is too early (the live query re-read lags the
  // write), which flashed rows back to their old value.
  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const [key, value] of prev) {
        const dbValue = dbOwnedByKey.get(key);
        const confirmed = value === null ? dbValue === undefined : dbValue === value;
        if (confirmed) next.delete(key);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [dbOwnedByKey]);

  const quantityFor = useCallback(
    (key: string): number | undefined => {
      const override = overrides.get(key);
      if (override !== undefined) return override ?? undefined;
      return dbOwnedByKey.get(key);
    },
    [overrides, dbOwnedByKey],
  );

  const ownedCount = useMemo(() => {
    let n = 0;
    for (const e of entries) {
      if (quantityFor(`${e.card.id}::${e.variant}`) !== undefined) n++;
    }
    return n;
  }, [entries, quantityFor]);

  const onToggle = useCallback(
    (cardId: string, variant: string) => {
      const key = `${cardId}::${variant}`;
      setOverrides((prev) => {
        const current =
          prev.get(key) !== undefined ? prev.get(key) : dbOwnedByKey.get(key);
        return new Map(prev).set(key, current == null ? 1 : null);
      });
      enqueueWrite(key, () => toggleOwned(db, cardId, variant));
      void Haptics.selectionAsync();
    },
    [dbOwnedByKey, enqueueWrite],
  );

  const onAdjust = useCallback(
    (cardId: string, variant: string, delta: number) => {
      const key = `${cardId}::${variant}`;
      setOverrides((prev) => {
        const current =
          (prev.get(key) !== undefined ? prev.get(key) : dbOwnedByKey.get(key)) ?? 0;
        const next = current + delta;
        return new Map(prev).set(key, next <= 0 ? null : next);
      });
      enqueueWrite(key, () => adjustOwnedQuantity(db, cardId, variant, delta));
    },
    [dbOwnedByKey, enqueueWrite],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: setRows?.[0]?.name ?? 'Checklist',
      headerRight: () => (
        <View style={styles.headerRow}>
          {entries.length > 0 && (
            <Text style={styles.headerCount}>
              {ownedCount}/{entries.length}
            </Text>
          )}
          <Pressable
            hitSlop={10}
            disabled={refreshing}
            // Re-download the set's card data (variants, images, prices).
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
  }, [navigation, setRows, ownedCount, entries.length, refreshing, setId]);

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
        const key = `${item.card.id}::${item.variant}`;
        return (
          <ChecklistRow
            card={item.card}
            variant={item.variant}
            quantity={quantityFor(key)}
            priceLabel={priceLabels.get(key) ?? null}
            onToggle={onToggle}
            onAdjust={onAdjust}
          />
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
  price: { fontSize: 12, color: '#78909c', fontVariant: ['tabular-nums'] },
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
