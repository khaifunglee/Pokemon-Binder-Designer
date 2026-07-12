import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../db/client';
import { refreshSetPrices } from '../../db/ingest';
import {
  getDisplayCurrency,
  getRate,
  refreshRates,
  setDisplayCurrency,
  SUPPORTED_CURRENCIES,
} from '../../db/ratesService';
import { computeBinderStats } from '../../db/statsService';
import type { BinderStats, OwnedEntry } from '../../db/statsService';
import { completionPercent, entryKey } from '../../lib/binder/completion';
import { convertUsd, formatCurrency } from '../../lib/currency';
import type { RootStackParamList } from '../../navigation/types';
import { variantLabel } from '../cards/variantLabels';

type Props = NativeStackScreenProps<RootStackParamList, 'BinderStats'>;

interface Section {
  title: string;
  ownedCount: number;
  total: number;
  costUsd: number;
  missingCount: number;
  data: OwnedEntry[];
}

export function StatsScreen({ route, navigation }: Props) {
  const { binderId } = route.params;
  const [stats, setStats] = useState<BinderStats | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [rate, setRate] = useState(1);

  const reload = useCallback(async () => {
    const [nextStats, displayCurrency] = await Promise.all([
      computeBinderStats(db, binderId),
      getDisplayCurrency(db),
    ]);
    const nextRate = (await getRate(db, displayCurrency)) ?? 1;
    setStats(nextStats);
    setCurrency(displayCurrency);
    setRate(nextRate);
  }, [binderId]);

  useEffect(() => {
    void reload();
    // Background freshness: rates + per-set prices (TTL-guarded), then
    // recompute. Failures are fine — stale data stays on screen.
    void (async () => {
      let changed = false;
      changed = (await refreshRates(db).catch(() => false)) || changed;
      const current = await computeBinderStats(db, binderId);
      for (const set of current.summary.sets) {
        changed =
          (await refreshSetPrices(db, set.setId).catch(() => false)) || changed;
      }
      if (changed) await reload();
    })();
  }, [binderId, reload]);

  const pickCurrency = useCallback(() => {
    Alert.alert('Show prices in', undefined, [
      ...SUPPORTED_CURRENCIES.map((code) => ({
        text: code,
        onPress: () => {
          void setDisplayCurrency(db, code).then(reload);
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [reload]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Completion',
      headerRight: () => (
        <Pressable onPress={pickCurrency} hitSlop={10}>
          <Text style={styles.currencyBtn}>{currency}</Text>
        </Pressable>
      ),
    });
  }, [navigation, currency, pickCurrency]);

  if (!stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const { summary } = stats;
  if (summary.total === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>
          Add cards to this binder first — completion compares its sets'
          full checklists against your collection.
        </Text>
      </View>
    );
  }

  const pct = completionPercent(summary.ownedCount, summary.total);
  const cost = (usd: number) => formatCurrency(convertUsd(usd, rate), currency);

  // Full checklist per set (collector order), owned entries marked.
  const sections: Section[] = summary.sets.map((set) => ({
    title: stats.setNames.get(set.setId) ?? set.setId,
    ownedCount: set.ownedCount,
    total: set.total,
    costUsd: set.costUsd,
    missingCount: set.missing.length,
    data: stats.entriesBySet.get(set.setId) ?? [],
  }));

  return (
    <SectionList
      style={styles.list}
      sections={sections}
      keyExtractor={(e) => `${e.cardId}::${e.variant}`}
      stickySectionHeadersEnabled
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.pct}>{pct}%</Text>
          <Text style={styles.headerSub}>
            {summary.ownedCount} of {summary.total} cards owned
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.cost}>
            Cost to complete: {cost(summary.costUsd)}
            {summary.unpricedCount > 0 ? ` · ${summary.unpricedCount} unpriced` : ''}
          </Text>
          {stats.pricesFetchedAt && (
            <Text style={styles.asOf}>
              prices as of {stats.pricesFetchedAt.toLocaleDateString()}
            </Text>
          )}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionSub}>
            {section.ownedCount}/{section.total}
            {section.missingCount > 0
              ? ` · missing ${cost(section.costUsd)}`
              : ' · complete ✓'}
          </Text>
        </View>
      )}
      renderItem={({ item }) => {
        const meta = stats.cardMeta.get(item.cardId);
        const priceUsd = stats.pricesUsd.get(entryKey(item));
        return (
          <View style={styles.row}>
            <Text
              style={[styles.rowTitle, item.owned && styles.rowOwned]}
              numberOfLines={1}
            >
              {item.owned ? '✓ ' : ''}#{meta?.number ?? '?'} {meta?.name ?? item.cardId}
            </Text>
            <Text style={[styles.rowVariant, item.owned && styles.rowOwned]}>
              {variantLabel(item.variant)}
            </Text>
            <Text style={[styles.rowPrice, item.owned && styles.rowOwned]}>
              {priceUsd !== undefined ? cost(priceUsd) : '—'}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  hint: { color: '#999', textAlign: 'center', lineHeight: 20 },
  currencyBtn: { color: '#e3350d', fontWeight: '700', fontSize: 15 },
  header: { padding: 20, gap: 6, alignItems: 'center' },
  pct: { fontSize: 40, fontWeight: '800', color: '#2e7d32' },
  headerSub: { color: '#777', fontSize: 14 },
  track: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#eceff1',
    overflow: 'hidden',
    marginVertical: 6,
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#66bb6a' },
  cost: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  asOf: { fontSize: 12, color: '#aaa' },
  sectionHeader: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  sectionSub: { fontSize: 12, color: '#888' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    gap: 8,
  },
  rowTitle: { flex: 1, fontSize: 13, color: '#333' },
  rowVariant: { fontSize: 12, color: '#999' },
  rowPrice: {
    fontSize: 12,
    color: '#78909c',
    minWidth: 56,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  rowOwned: { color: '#2e7d32' },
});
