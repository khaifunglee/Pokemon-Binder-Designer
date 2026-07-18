import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { addPages, touchBinder } from '../../db/binders';
import { searchCards } from '../../db/cards';
import { db } from '../../db/client';
import type { CardRow } from '../../db/schema';
import { clearSlot, placeCard } from '../../db/slots';
import { layoutSpec } from '../../lib/binder/layout';
import { likePattern } from '../../lib/search';
import type { RootStackParamList } from '../../navigation/types';
import { CARD_IMAGE_CACHE_POLICY } from '../cards/images';
import { variantLabel } from '../cards/variantLabels';
import { CARD_ASPECT, PageGrid } from './PageGrid';
import { useBinderSpread } from './useBinderSpread';

type Props = NativeStackScreenProps<RootStackParamList, 'MirrorCapture'>;

/**
 * Mirror mode: recreate the physical binder pocket by pocket. The
 * current pocket is highlighted; picking a card fills it and advances,
 * Skip leaves it empty (skip-slot), and pages are added automatically
 * when the pointer walks off the end.
 */
export function MirrorCaptureScreen({ route, navigation }: Props) {
  const { binderId } = route.params;
  const { binder, pages } = useBinderSpread(binderId);
  const { width } = useWindowDimensions();
  const [pointer, setPointer] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CardRow[]>([]);

  const layout = binder?.layout ?? '3x3';
  const { rows, cols, slotsPerPage } = layoutSpec(layout);
  const pageIndex = Math.floor(pointer / slotsPerPage);
  const slotIndex = pointer % slotsPerPage;
  const page = pages[pageIndex];
  const currentPocket = page?.pockets[slotIndex];

  useEffect(() => {
    navigation.setOptions({
      title: 'Mirror capture',
      headerRight: () => (
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.doneBtn}>Done</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const searching = likePattern(query) !== null;
  useEffect(() => {
    if (!searching) {
      setResults([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      searchCards(db, { name: query, limit: 25 }).then((r) => {
        if (!stale) setResults(r);
      });
    }, 120);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, searching]);

  const advance = () => {
    const next = pointer + 1;
    if (next >= pages.length * slotsPerPage) {
      // Walked off the last pocket: mirror binders grow with the capture.
      void addPages(db, binderId, 1);
    }
    setPointer(next);
    setQuery('');
  };

  const pick = (card: CardRow, variant?: string) => {
    if (!currentPocket) return;
    void placeCard(db, currentPocket.slot.id, {
      cardId: card.id,
      variant: variant ?? card.variants[0] ?? 'normal',
    }).then(() => touchBinder(db, binderId));
    void Haptics.selectionAsync();
    advance();
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

  // Compact grid preview: fits the top ~40% of the screen.
  const previewPocketWidth = Math.floor(
    Math.min(
      (width - 32 - 6 * (cols - 1)) / cols,
      ((width * 0.52) / rows) * CARD_ASPECT,
    ),
  );

  if (!binder) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        {page ? (
          <PageGrid
            layout={layout}
            pockets={page.pockets}
            pocketWidth={previewPocketWidth}
            highlightSlotId={currentPocket?.slot.id ?? null}
          />
        ) : (
          <Text style={styles.hint}>Adding a page…</Text>
        )}
        <Text style={styles.position}>
          Page {pageIndex + 1} · Pocket {slotIndex + 1}
          {currentPocket?.slot.cardId ? ' (replacing current card)' : ''}
        </Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={styles.controlBtn}
          disabled={pointer === 0}
          onPress={() => {
            setPointer((p) => Math.max(0, p - 1));
            setQuery('');
          }}
        >
          <Text style={[styles.controlText, pointer === 0 && styles.controlOff]}>
            ‹ Back
          </Text>
        </Pressable>
        {currentPocket?.slot.cardId != null && (
          <Pressable
            style={styles.controlBtn}
            // The physical pocket is empty: clear the digital one too.
            onPress={() => {
              void clearSlot(db, currentPocket.slot.id).then(() =>
                touchBinder(db, binderId),
              );
              void Haptics.selectionAsync();
              advance();
            }}
          >
            <Text style={styles.controlText}>Empty it</Text>
          </Pressable>
        )}
        <Pressable style={styles.controlBtn} onPress={advance}>
          <Text style={styles.controlText}>Skip pocket ›</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.search}
        placeholder="What's in this pocket? Search by name…"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <FlatList
        data={results}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          searching ? (
            <Text style={styles.hint}>
              No matches in downloaded sets — browse the set once via a
              checklist to download it.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.resultRow}
            onPress={() => pick(item)}
            onLongPress={() => pickVariant(item)}
          >
            <Image
              source={{ uri: item.imageSmallUri ?? undefined }}
              style={styles.thumb}
              contentFit="contain"
              cachePolicy={CARD_IMAGE_CACHE_POLICY}
            />
            <View style={styles.resultText}>
              <Text style={styles.resultTitle}>{item.name}</Text>
              <Text style={styles.resultSub}>
                {item.setId} · #{item.number}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  doneBtn: { color: '#e3350d', fontWeight: '600', fontSize: 15 },
  preview: { alignItems: 'center', paddingVertical: 10, gap: 6 },
  position: { fontSize: 13, color: '#78909c' },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  controlBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  controlText: { color: '#e3350d', fontWeight: '600', fontSize: 14 },
  controlOff: { color: '#cfd8dc' },
  search: {
    marginHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  hint: { textAlign: 'center', color: '#999', marginTop: 24, paddingHorizontal: 24 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    gap: 12,
  },
  thumb: { width: 34, height: 47 },
  resultText: { flex: 1, gap: 1 },
  resultTitle: { fontSize: 14, fontWeight: '500' },
  resultSub: { fontSize: 12, color: '#888' },
});
