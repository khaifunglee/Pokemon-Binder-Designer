import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { listSetCards } from '../../db/cards';
import { db } from '../../db/client';
import type { CardRow } from '../../db/schema';
import type { RootStackParamList } from '../../navigation/types';
import { CARD_IMAGE_CACHE_POLICY } from './images';
import { placeIntoSlot } from './placement';
import { variantLabel } from './variantLabels';

type Props = NativeStackScreenProps<RootStackParamList, 'PickerCards'>;

const COLUMNS = 3;

export function PickerCardsScreen({ route, navigation }: Props) {
  const { binderId, slotId, setId } = route.params;
  const { width } = useWindowDimensions();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listSetCards(db, setId);
      if (cancelled) return;
      setCards(rows);
      setLoading(false);
      if (rows.length === 0) {
        setError('This set needs to be downloaded once — connect to the internet and retry.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const cardWidth = Math.floor((width - 12 * 2 - 8 * (COLUMNS - 1)) / COLUMNS);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.hint}>Downloading set…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={cards}
      keyExtractor={(c) => c.id}
      numColumns={COLUMNS}
      contentContainerStyle={styles.grid}
      columnWrapperStyle={styles.gridRow}
      renderItem={({ item }) => (
        <Pressable
          style={{ width: cardWidth }}
          onPress={() => {
            void placeIntoSlot(db, binderId, slotId, item);
            navigation.pop(2); // back past the set picker to the binder
          }}
          onLongPress={() => {
            // Variant choice; a plain tap places the default variant.
            if (item.variants.length < 2) return;
            Alert.alert(
              item.name,
              'Choose a variant',
              [
                ...item.variants.map((variant) => ({
                  text: variantLabel(variant),
                  onPress: () => {
                    void placeIntoSlot(db, binderId, slotId, item, variant);
                    navigation.pop(2);
                  },
                })),
                { text: 'Cancel', style: 'cancel' as const },
              ],
            );
          }}
        >
          <Image
            source={{ uri: item.imageSmallUri ?? undefined }}
            style={[styles.card, { width: cardWidth, height: cardWidth / (63 / 88) }]}
            contentFit="contain"
            cachePolicy={CARD_IMAGE_CACHE_POLICY}
            transition={100}
          />
          <Text style={styles.caption} numberOfLines={1}>
            #{item.number} {item.name}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  hint: { color: '#999', textAlign: 'center' },
  grid: { padding: 12, gap: 8 },
  gridRow: { gap: 8 },
  card: { borderRadius: 6, backgroundColor: '#f0f0f0' },
  caption: { fontSize: 11, color: '#666', marginTop: 2, textAlign: 'center' },
});
