import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { browsableSet, searchCards } from '../../db/cards';
import { db } from '../../db/client';
import { sets } from '../../db/schema';
import type { CardRow } from '../../db/schema';
import { likePattern } from '../../lib/search';
import type { RootStackParamList } from '../../navigation/types';
import { CARD_IMAGE_CACHE_POLICY } from './images';
import { placeIntoSlot } from './placement';
import { variantLabel } from './variantLabels';

type Props = NativeStackScreenProps<RootStackParamList, 'PickerSets'>;

export function PickerSetsScreen({ route, navigation }: Props) {
  const { binderId, slotId } = route.params;
  const { data: setRows } = useLiveQuery(
    db.select().from(sets).where(browsableSet).orderBy(desc(sets.releaseDate)),
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CardRow[]>([]);
  const searching = likePattern(query) !== null;

  useEffect(() => {
    if (!searching) {
      setResults([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      searchCards(db, { name: query, limit: 50 }).then((rows) => {
        if (!stale) setResults(rows);
      });
    }, 150);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, searching]);

  const pick = (card: CardRow, variant?: string) => {
    void placeIntoSlot(db, binderId, slotId, card, variant);
    navigation.goBack();
  };

  const pickVariant = (card: CardRow) => {
    if (card.variants.length < 2) return;
    Alert.alert(card.name, 'Choose a variant', [
      ...card.variants.map((variant) => ({
        text: variantLabel(variant),
        onPress: () => pick(card, variant),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search downloaded cards by name…"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {searching ? (
        <FlatList
          data={results}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.hint}>
              No matches in downloaded sets. Browse a set below to download it.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => pick(item)}
              onLongPress={() => pickVariant(item)}
            >
              <Image
                source={{ uri: item.imageSmallUri ?? undefined }}
                style={styles.cardThumb}
                contentFit="contain"
                cachePolicy={CARD_IMAGE_CACHE_POLICY}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>
                  {item.setId} · #{item.number}
                </Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={setRows ?? []}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                navigation.navigate('PickerCards', {
                  binderId,
                  slotId,
                  setId: item.id,
                })
              }
            >
              <Image
                source={{ uri: item.symbolUri ?? undefined }}
                style={styles.setSymbol}
                contentFit="contain"
                cachePolicy={CARD_IMAGE_CACHE_POLICY}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>
                  {item.series} · {item.total} cards
                  {item.cardsIngestedAt ? ' · downloaded' : ''}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  search: {
    margin: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  hint: { textAlign: 'center', color: '#999', marginTop: 32, paddingHorizontal: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  setSymbol: { width: 28, height: 28 },
  cardThumb: { width: 40, height: 56 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, color: '#888' },
  chevron: { fontSize: 20, color: '#ccc' },
});
