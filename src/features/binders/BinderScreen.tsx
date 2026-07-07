import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { addPages, touchBinder, updateBinder } from '../../db/binders';
import { db } from '../../db/client';
import { clearSlot, swapSlotContents } from '../../db/slots';
import { edgeDirection, pocketAt } from '../../lib/binder/dnd';
import type { GridGeometry } from '../../lib/binder/dnd';
import { layoutSpec } from '../../lib/binder/layout';
import type { RootStackParamList } from '../../navigation/types';
import { DragOverlay } from './DragOverlay';
import { CARD_ASPECT, PageGrid } from './PageGrid';
import { useBinderSpread } from './useBinderSpread';
import type { PageVM, PocketVM } from './useBinderSpread';

type Props = NativeStackScreenProps<RootStackParamList, 'Binder'>;

const PAGE_PADDING = 16;
const GRID_GAP = 6;
const LONG_PRESS_MS = 350;
const EDGE_WIDTH = 44;
const EDGE_DWELL_MS = 450;
const EDGE_COOLDOWN_MS = 650;

export function BinderScreen({ route, navigation }: Props) {
  const { binderId } = route.params;
  const { binder, pages } = useBinderSpread(binderId);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(0);
  const [dragging, setDragging] = useState<PocketVM | null>(null);
  const [moveSource, setMoveSource] = useState<PocketVM | null>(null);

  const listRef = useRef<FlatList<PageVM>>(null);
  const pagerRef = useRef<View>(null);
  const geometryRef = useRef<GridGeometry | null>(null);
  const currentPageRef = useRef(0);
  const pagesRef = useRef<PageVM[]>(pages);
  pagesRef.current = pages;
  const draggingRef = useRef<PocketVM | null>(null);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragActive = useSharedValue(0);
  const edgeDir = useSharedValue(0);
  const edgeSince = useSharedValue(0);

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

  const layout = binder?.layout ?? '3x3';
  const { rows, cols } = layoutSpec(layout);
  const availableWidth = windowWidth - PAGE_PADDING * 2 - GRID_GAP * (cols - 1);
  const availableHeight = windowHeight * 0.72 - GRID_GAP * (rows - 1);
  const pocketWidth = Math.floor(
    Math.min(availableWidth / cols, (availableHeight / rows) * CARD_ASPECT),
  );
  const pocketHeight = pocketWidth / CARD_ASPECT;

  /** Grid origin is identical on every page; measured from the pager. */
  const measureGeometry = useCallback(() => {
    pagerRef.current?.measureInWindow((x, y, w, h) => {
      const gridW = cols * pocketWidth + (cols - 1) * GRID_GAP;
      const gridH = rows * pocketHeight + (rows - 1) * GRID_GAP;
      geometryRef.current = {
        originX: x + (w - gridW) / 2,
        originY: y + (h - gridH) / 2,
        pocketWidth,
        pocketHeight,
        gap: GRID_GAP,
        rows,
        cols,
      };
    });
  }, [cols, rows, pocketWidth, pocketHeight]);

  const goToPage = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, pagesRef.current.length - 1));
      if (clamped === currentPageRef.current) return;
      currentPageRef.current = clamped;
      setCurrentPage(clamped);
      listRef.current?.scrollToIndex({ index: clamped, animated: true });
      void Haptics.selectionAsync();
    },
    [],
  );

  const flipPage = useCallback(
    (dir: number) => goToPage(currentPageRef.current + dir),
    [goToPage],
  );

  const finishSwap = useCallback(
    (source: PocketVM, target: PocketVM) => {
      if (target.slot.id === source.slot.id) return;
      void swapSlotContents(db, source.slot, target.slot)
        .then(() => touchBinder(db, binderId))
        .then(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    },
    [binderId],
  );

  const beginDrag = useCallback(
    (x: number, y: number) => {
      const geom = geometryRef.current;
      if (!geom) return;
      const idx = pocketAt(geom, x, y);
      if (idx == null) return;
      const pocket = pagesRef.current[currentPageRef.current]?.pockets[idx];
      if (!pocket || pocket.slot.cardId == null) return;
      draggingRef.current = pocket;
      setDragging(pocket);
      dragActive.value = 1;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [dragActive],
  );

  const endDrag = useCallback(
    (x: number, y: number) => {
      const source = draggingRef.current;
      const geom = geometryRef.current;
      if (source && geom) {
        const idx = pocketAt(geom, x, y);
        const target =
          idx == null
            ? null
            : pagesRef.current[currentPageRef.current]?.pockets[idx];
        if (target) finishSwap(source, target);
      }
      draggingRef.current = null;
      setDragging(null);
      dragActive.value = 0;
    },
    [finishSwap, dragActive],
  );

  const cancelDrag = useCallback(() => {
    if (draggingRef.current === null) return;
    draggingRef.current = null;
    setDragging(null);
    dragActive.value = 0;
  }, [dragActive]);

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart((e) => {
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
      edgeDir.value = 0;
      edgeSince.value = 0;
      runOnJS(beginDrag)(e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
      // Edge auto-flip: dwell near an edge to turn the page while dragging.
      const dir = edgeDirection(e.absoluteX, windowWidth, EDGE_WIDTH);
      const now = Date.now();
      if (dir !== edgeDir.value) {
        edgeDir.value = dir;
        edgeSince.value = now;
      } else if (dir !== 0 && now - edgeSince.value > EDGE_DWELL_MS) {
        edgeSince.value = now + EDGE_COOLDOWN_MS - EDGE_DWELL_MS;
        runOnJS(flipPage)(dir);
      }
    })
    .onEnd((e) => {
      runOnJS(endDrag)(e.absoluteX, e.absoluteY);
    })
    .onFinalize(() => {
      runOnJS(cancelDrag)();
    });

  if (!binder) return <View style={styles.container} />;

  const executeMoveTo = (target: PocketVM) => {
    const source = moveSource;
    setMoveSource(null);
    if (source) finishSwap(source, target);
  };

  const onPocketPress = (pocket: PocketVM) => {
    if (moveSource) {
      executeMoveTo(pocket);
      return;
    }
    if (pocket.slot.cardId == null) {
      navigation.navigate('PickerSets', { binderId, slotId: pocket.slot.id });
      return;
    }
    Alert.alert(pocket.cardName ?? 'Card', undefined, [
      { text: 'Move (tap a pocket)', onPress: () => setMoveSource(pocket) },
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
      {moveSource && (
        <View style={styles.moveBanner}>
          <Text style={styles.moveText} numberOfLines={1}>
            Moving {moveSource.cardName ?? 'card'} — tap a pocket
          </Text>
          <Pressable onPress={() => setMoveSource(null)} hitSlop={8}>
            <Text style={styles.moveCancel}>Cancel</Text>
          </Pressable>
        </View>
      )}

      <View ref={pagerRef} style={styles.pager} onLayout={measureGeometry}>
        <GestureDetector gesture={panGesture}>
          <FlatList
            ref={listRef}
            data={pages}
            horizontal
            pagingEnabled
            scrollEnabled={dragging === null}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => p.pageId}
            getItemLayout={(_, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
              currentPageRef.current = index;
              setCurrentPage(index);
            }}
            renderItem={({ item }) => (
              <View style={[styles.pageContainer, { width: windowWidth }]}>
                <PageGrid
                  layout={layout}
                  pockets={item.pockets}
                  pocketWidth={pocketWidth}
                  gap={GRID_GAP}
                  hiddenSlotId={dragging?.slot.id ?? null}
                  highlightSlotId={moveSource?.slot.id ?? null}
                  onPocketPress={onPocketPress}
                />
              </View>
            )}
          />
        </GestureDetector>
      </View>

      <View style={styles.footer}>
        <Text style={styles.pageIndicator}>
          Page {Math.min(currentPage + 1, pages.length)} / {pages.length}
        </Text>
        <View style={styles.stackingRow}>
          <Text style={styles.stackingLabel}>Stack duplicates</Text>
          <Switch
            value={binder.variantStacking}
            onValueChange={(value) =>
              void updateBinder(db, binderId, { variantStacking: value })
            }
          />
        </View>
      </View>

      {dragging && (
        <DragOverlay
          imageUri={dragging.imageSmallUri ?? dragging.imageLargeUri}
          width={pocketWidth}
          height={pocketHeight}
          dragX={dragX}
          dragY={dragY}
          active={dragActive}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eceff1' },
  addPage: { color: '#e3350d', fontSize: 15, fontWeight: '600' },
  pager: { flex: 1 },
  pageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: PAGE_PADDING,
  },
  footer: { alignItems: 'center', paddingBottom: 16, gap: 8 },
  pageIndicator: { color: '#78909c', fontSize: 13 },
  stackingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stackingLabel: { color: '#546e7a', fontSize: 13 },
  moveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff8e1',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  moveText: { flex: 1, color: '#8d6e63', fontSize: 13 },
  moveCancel: { color: '#e3350d', fontWeight: '600', fontSize: 13 },
});
