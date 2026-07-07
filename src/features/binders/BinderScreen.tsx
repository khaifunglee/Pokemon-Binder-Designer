import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { addPages, touchBinder } from '../../db/binders';
import { db } from '../../db/client';
import { layoutSpec } from '../../lib/binder/layout';
import { clearSlot } from '../../db/slots';
import type { RootStackParamList } from '../../navigation/types';
import { CARD_ASPECT, PageGrid } from './PageGrid';
import { useBinderSpread } from './useBinderSpread';
import type { PageVM, PocketVM } from './useBinderSpread';

type Props = NativeStackScreenProps<RootStackParamList, 'Binder'>;

const PAGE_PADDING = 16;
const GRID_GAP = 6;

export function BinderScreen({ route, navigation }: Props) {
  const { binderId } = route.params;
  const { binder, pages } = useBinderSpread(binderId);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(0);
  const listRef = useRef<FlatList<PageVM>>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: binder?.name ?? 'Binder',
      headerRight: () => (
        <Pressable onPress={() => void addPages(db, binderId)} hitSlop={12}>
          <Text style={styles.addPage}>＋ page</Text>
        </Pressable>
      ),
    });
  }, [navigation, binder?.name, binderId]);

  if (!binder) return <View style={styles.container} />;

  const { rows, cols } = layoutSpec(binder.layout);
  // Fit the grid inside the page both ways; cards keep their aspect.
  const availableWidth = windowWidth - PAGE_PADDING * 2 - GRID_GAP * (cols - 1);
  const availableHeight = windowHeight * 0.72 - GRID_GAP * (rows - 1);
  const pocketWidth = Math.floor(
    Math.min(availableWidth / cols, (availableHeight / rows) * CARD_ASPECT),
  );

  const onPocketPress = (pocket: PocketVM) => {
    if (pocket.slot.cardId == null) {
      navigation.navigate('PickerSets', { binderId, slotId: pocket.slot.id });
    }
  };

  const onPocketLongPress = (pocket: PocketVM) => {
    if (pocket.slot.cardId == null) return;
    Alert.alert(pocket.cardName ?? 'Card', undefined, [
      {
        text: 'Clear pocket',
        style: 'destructive',
        onPress: () => {
          void clearSlot(db, pocket.slot.id).then(() => touchBinder(db, binderId));
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.pageId}
        onMomentumScrollEnd={(e) =>
          setCurrentPage(Math.round(e.nativeEvent.contentOffset.x / windowWidth))
        }
        renderItem={({ item }) => (
          <View style={[styles.pageContainer, { width: windowWidth }]}>
            <PageGrid
              layout={binder.layout}
              pockets={item.pockets}
              pocketWidth={pocketWidth}
              gap={GRID_GAP}
              onPocketPress={onPocketPress}
              onPocketLongPress={onPocketLongPress}
            />
          </View>
        )}
      />
      <View style={styles.footer}>
        <Text style={styles.pageIndicator}>
          Page {Math.min(currentPage + 1, pages.length)} / {pages.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eceff1' },
  addPage: { color: '#e3350d', fontSize: 15, fontWeight: '600' },
  pageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: PAGE_PADDING,
  },
  footer: { alignItems: 'center', paddingBottom: 24 },
  pageIndicator: { color: '#78909c', fontSize: 13 },
});
