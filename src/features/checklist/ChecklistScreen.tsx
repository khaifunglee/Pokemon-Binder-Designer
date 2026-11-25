import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { asc, eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Haptics from 'expo-haptics';
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
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../db/client';
import { adjustOwnedQuantity, toggleOwned } from '../../db/collectionService';
import { resyncSet } from '../../db/catalogueSync';
import { cards, collection, sets } from '../../db/schema';
import type { CardRow } from '../../db/schema';
import {
  addManualVariant,
  removeManualVariant,
  VariantInUseError,
} from '../../db/variantService';
import { isIncompleteSet } from '../../lib/tcgdex/syncPlan';
import { addableVariants } from '../../lib/tcgdex/variants';
import { useSetBusy } from '../../state/syncStore';
import type { RootStackParamList } from '../../navigation/types';
import { SyncStatusLine } from '../catalogue/SyncStatusLine';
import { OptionSheet } from './OptionSheet';
import type { SheetSpec } from './OptionSheet';
import { CardFace } from '../cards/CardFace';
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
  onToggle: (cardId: string, variant: string) => void;
  onAdjust: (cardId: string, variant: string, delta: number) => void;
  onVariantMenu: (card: CardRow) => void;
}

/** Memoized: a toggle re-renders only the row it changed. */
const ChecklistRow = memo(function ChecklistRow({
  card,
  variant,
  quantity,
  onToggle,
  onAdjust,
  onVariantMenu,
}: RowProps) {
  const owned = quantity !== undefined;
  return (
    <Pressable
      style={[styles.row, owned && styles.rowOwned]}
      onPress={() => onToggle(card.id, variant)}
      onLongPress={() => onVariantMenu(card)}
    >
      <CardFace
        name={card.name}
        number={card.number}
        imageUri={card.imageSmallUri ?? card.imageLargeUri}
        style={styles.thumb}
        contentFit="contain"
      />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          #{card.number} {card.name}
        </Text>
        <Text style={styles.rowSub}>
          {variantLabel(variant)}
          {card.rarity ? ` · ${card.rarity}` : ''}
          {card.manualVariants.includes(variant) ? ' · added by you' : ''}
        </Text>
      </View>
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
  /** Being downloaded or topped up, by ↻ or the background sync. */
  const busy = useSetBusy(setId);
  /** key → optimistic quantity (null = not owned); cleared on DB echo. */
  const [overrides, setOverrides] = useState<Map<string, number | null>>(new Map());

  const { data: setRows } = useLiveQuery(
    db.select().from(sets).where(eq(sets.id, setId)),
    [setId],
  );
  const { data: cardRows, updatedAt: cardsLoadedAt } = useLiveQuery(
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

  // Long-press: add a variant TCGdex doesn't list, or remove one you added.
  // Three steps to add: long-press → Add variant → pick.
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const onVariantMenu = useCallback((card: CardRow) => {
    const fail = (e: unknown) =>
      Alert.alert(
        e instanceof VariantInUseError ? "Can't remove variant" : 'Variant not changed',
        e instanceof VariantInUseError
          ? 'You own or have placed this variant. Remove it from your collection and binders first.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    const addSheet: SheetSpec = {
      title: 'Add variant',
      message: "For variants TCGdex doesn't list.",
      options: addableVariants(card.variants).map((variant) => ({
        label: variantLabel(variant),
        onPress: () => void addManualVariant(db, card.id, variant).catch(fail),
      })),
    };
    setSheet({
      title: `#${card.number} ${card.name}`,
      options: [
        // Defer so the first sheet finishes closing before the next opens.
        { label: 'Add variant', onPress: () => setTimeout(() => setSheet(addSheet), 0) },
        ...card.manualVariants.map((variant) => ({
          label: `Remove ${variantLabel(variant)}`,
          destructive: true,
          onPress: () => void removeManualVariant(db, card.id, variant).catch(fail),
        })),
      ],
    });
  }, []);

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
            disabled={busy}
            accessibilityLabel={busy ? 'Syncing this set' : 'Re-sync this set'}
            // Re-download the set's cards (plus the variant top-up if needed).
            onPress={() => {
              void resyncSet(db, setId).catch((e: unknown) =>
                Alert.alert('Re-sync failed', e instanceof Error ? e.message : String(e)),
              );
            }}
          >
            <Text style={[styles.headerRefresh, busy && styles.headerRefreshOff]}>
              ↻
            </Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, setRows, ownedCount, entries.length, busy, setId]);

  // Wait for the first read, so an already-downloaded set doesn't flash
  // the "not downloaded" message.
  if (cardsLoadedAt === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (entries.length === 0) {
    return (
      <View style={styles.center}>
        {busy && <ActivityIndicator />}
        <Text style={styles.hint}>
          {busy
            ? 'Syncing this set in the background…'
            : "This set hasn't downloaded yet. It will retry next time the app starts."}
        </Text>
      </View>
    );
  }

  const listedTotal = setRows?.[0]?.total ?? 0;
  const cardCount = cardRows?.length ?? 0;

  return (
    <View style={styles.screen}>
      <SyncStatusLine />
      {busy && (
        <View style={styles.notice}>
          <ActivityIndicator size="small" />
          <Text style={styles.noticeText}>Syncing this set in the background…</Text>
        </View>
      )}
      {isIncompleteSet(cardCount, listedTotal) && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            TCGdex lists {cardCount} of {listedTotal} cards so far. The rest will appear when
            TCGdex adds them.
          </Text>
        </View>
      )}
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
            onToggle={onToggle}
            onAdjust={onAdjust}
            onVariantMenu={onVariantMenu}
          />
        );
      }}
      />
      <OptionSheet sheet={sheet} onClose={() => setSheet(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#fff8e1',
  },
  noticeText: { flex: 1, fontSize: 12, color: '#6d5d00' },
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
