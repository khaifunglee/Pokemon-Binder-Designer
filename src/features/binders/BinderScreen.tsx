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
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { randomUUID } from 'expo-crypto';

import { addPages, touchBinder, updateBinder } from '../../db/binders';
import { db } from '../../db/client';
import { autoOrganize } from '../../db/organize';
import type { SortStrategy } from '../../db/schema';
import {
  clearSlot,
  setCustomImage,
  setMergedGroup,
  setSlotQuantity,
  swapSlotContents,
  unmergeGroup,
} from '../../db/slots';
import { consolidateDuplicates, unstackDuplicates } from '../../db/stackingService';
import { edgeDirection, pocketAt } from '../../lib/binder/dnd';
import type { GridGeometry } from '../../lib/binder/dnd';
import { layoutSpec } from '../../lib/binder/layout';
import { groupMergeUnion, MERGE_DIRECTIONS } from '../../lib/binder/merge';
import type { MergeDirection } from '../../lib/binder/merge';
import { deleteCustomImage, pickAndStoreCustomImage } from './customImage';
import type { RootStackParamList } from '../../navigation/types';
import { DragOverlay } from './DragOverlay';
import { CARD_ASPECT, PageGrid } from './PageGrid';
import { PageTurnOverlay } from './PageTurnOverlay';
import { ShuffleOverlay } from './ShuffleOverlay';
import { useBinderSpread } from './useBinderSpread';
import type { PageVM, PocketVM } from './useBinderSpread';

type Props = NativeStackScreenProps<RootStackParamList, 'Binder'>;

const PAGE_PADDING = 16;
const GRID_GAP = 6;
const LONG_PRESS_MS = 350;
const EDGE_WIDTH = 44;
const EDGE_DWELL_MS = 450;
const EDGE_COOLDOWN_MS = 650;
/** The shuffle is the loading state; keep it visible at least this long. */
const SHUFFLE_MIN_MS = 1200;

const STRATEGY_LABELS: [SortStrategy, string][] = [
  ['master-set', 'Master set'],
  ['colour', 'Colour'],
  ['pokedex', 'Pokédex'],
  ['rarity', 'Rarity'],
];

export function BinderScreen({ route, navigation }: Props) {
  const { binderId } = route.params;
  const { binder, pages } = useBinderSpread(binderId);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(0);
  const [dragging, setDragging] = useState<PocketVM | null>(null);
  const [moveSource, setMoveSource] = useState<PocketVM | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const organizingRef = useRef(false);

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
  const turnProgress = useSharedValue(0);
  const turnDirection = useSharedValue(1);
  const shuffleActive = useSharedValue(0);
  const shuffleProgress = useSharedValue(0);
  const [pagerHeight, setPagerHeight] = useState(0);

  const runOrganize = useCallback(
    (strategy: SortStrategy) => {
      if (organizingRef.current) return;
      organizingRef.current = true;
      setOrganizing(true);
      shuffleProgress.value = 0;
      shuffleProgress.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.linear }),
        -1,
      );
      shuffleActive.value = withTiming(1, { duration: 150 });
      const started = Date.now();
      void (async () => {
        try {
          await autoOrganize(db, binderId, strategy);
        } finally {
          const remaining = Math.max(0, SHUFFLE_MIN_MS - (Date.now() - started));
          setTimeout(() => {
            shuffleActive.value = withTiming(0, { duration: 250 });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            // Unmount only after the fade-out completes.
            setTimeout(() => {
              cancelAnimation(shuffleProgress);
              organizingRef.current = false;
              setOrganizing(false);
            }, 300);
          }, remaining);
        }
      })();
    },
    [binderId, shuffleActive, shuffleProgress],
  );

  const pickStrategy = useCallback(() => {
    Alert.alert('Organize by', undefined, [
      ...STRATEGY_LABELS.map(([strategy, label]) => ({
        text: label,
        onPress: () => runOrganize(strategy),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [runOrganize]);

  const sortStrategy = binder?.sortStrategy ?? 'custom';

  useLayoutEffect(() => {
    navigation.setOptions({
      title: binder?.name ?? 'Binder',
      headerRight: () => (
        <View style={styles.headerRow}>
          <Pressable
            // 1-tap reorganize with the binder's strategy; long-press
            // (or tap while still 'custom') picks a strategy first.
            onPress={() =>
              sortStrategy === 'custom' ? pickStrategy() : runOrganize(sortStrategy)
            }
            onLongPress={pickStrategy}
            hitSlop={12}
            disabled={organizing}
          >
            <Text style={[styles.headerBtn, organizing && styles.headerBtnOff]}>⇅</Text>
          </Pressable>
          <Pressable onPress={() => void addPages(db, binderId)} hitSlop={12}>
            <Text style={styles.addPage}>＋ page</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, binder?.name, binderId, sortStrategy, organizing, pickStrategy, runOrganize]);

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
      turnDirection.value = clamped > currentPageRef.current ? 1 : -1;
      turnProgress.value = 0;
      turnProgress.value = withTiming(1, { duration: 380 });
      currentPageRef.current = clamped;
      setCurrentPage(clamped);
      listRef.current?.scrollToIndex({ index: clamped, animated: true });
      void Haptics.selectionAsync();
    },
    [turnDirection, turnProgress],
  );

  const flipPage = useCallback(
    (dir: number) => goToPage(currentPageRef.current + dir),
    [goToPage],
  );

  const stackingRef = useRef(false);
  stackingRef.current = binder?.variantStacking ?? false;

  const finishSwap = useCallback(
    (source: PocketVM, target: PocketVM) => {
      if (target.slot.id === source.slot.id) return;
      // Dropping onto the same card while stacking combines the pockets.
      const stacks =
        stackingRef.current &&
        source.slot.cardId !== null &&
        source.slot.cardId === target.slot.cardId;
      const action = stacks
        ? setSlotQuantity(
            db,
            target.slot.id,
            target.slot.quantity + source.slot.quantity,
          ).then(() => clearSlot(db, source.slot.id))
        : swapSlotContents(db, source.slot, target.slot);
      void action
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
      // Merged regions and custom-image pockets are pinned: no dragging.
      if (pocket.slot.mergedGroupId !== null || pocket.slot.customImageUri !== null)
        return;
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
        if (
          target &&
          target.slot.mergedGroupId === null &&
          target.slot.customImageUri === null
        )
          finishSwap(source, target);
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

  const touch = () => void touchBinder(db, binderId);

  const applyMerge = (pocket: PocketVM, direction: MergeDirection) => {
    const page = pages.find((p) => p.pageId === pocket.slot.pageId);
    if (!page) return;
    const cells = page.pockets.map((p) => ({
      slotId: p.slot.id,
      slotIndex: p.slot.slotIndex,
      mergedGroupId: p.slot.mergedGroupId,
    }));
    const union = groupMergeUnion(cells, layout, pocket.slot.slotIndex, direction);
    if (!union) return;
    const groupId =
      union.find((c) => c.mergedGroupId !== null)?.mergedGroupId ?? randomUUID();
    void setMergedGroup(db, union.map((c) => c.slotId), groupId).then(touch);
  };

  const setPocketImage = async (pocket: PocketVM) => {
    const uri = await pickAndStoreCustomImage();
    if (uri === null) return;
    if (pocket.slot.customImageUri) await deleteCustomImage(pocket.slot.customImageUri);
    await setCustomImage(db, pocket.slot.id, uri);
    touch();
  };

  const pocketMenu = (pocket: PocketVM) => {
    const page = pages.find((p) => p.pageId === pocket.slot.pageId);
    const cells = (page?.pockets ?? []).map((p) => ({
      slotId: p.slot.id,
      slotIndex: p.slot.slotIndex,
      mergedGroupId: p.slot.mergedGroupId,
    }));
    const filled = pocket.slot.cardId != null;
    const buttons = [
      ...(filled
        ? [{ text: 'Move (tap a pocket)', onPress: () => setMoveSource(pocket) }]
        : []),
      ...MERGE_DIRECTIONS.filter((dir) =>
        groupMergeUnion(cells, layout, pocket.slot.slotIndex, dir),
      ).map((dir) => ({
        text: {
          left: 'Merge with left pocket',
          right: 'Merge with right pocket',
          up: 'Merge with pocket above',
          down: 'Merge with pocket below',
        }[dir],
        onPress: () => applyMerge(pocket, dir),
      })),
      ...(pocket.slot.mergedGroupId !== null
        ? [
            {
              text: 'Unmerge',
              onPress: () =>
                void unmergeGroup(db, pocket.slot.mergedGroupId!).then(touch),
            },
          ]
        : []),
      { text: 'Custom image…', onPress: () => void setPocketImage(pocket) },
      ...(pocket.slot.customImageUri !== null
        ? [
            {
              text: 'Remove custom image',
              onPress: () => {
                void deleteCustomImage(pocket.slot.customImageUri!)
                  .then(() => setCustomImage(db, pocket.slot.id, null))
                  .then(touch);
              },
            },
          ]
        : []),
      ...(filled
        ? [
            {
              text: 'Clear pocket',
              style: 'destructive' as const,
              onPress: () => void clearSlot(db, pocket.slot.id).then(touch),
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert(pocket.cardName ?? 'Pocket', undefined, buttons);
  };

  const onPocketPress = (pocket: PocketVM) => {
    if (moveSource) {
      executeMoveTo(pocket);
      return;
    }
    if (pocket.slot.cardId == null && pocket.slot.customImageUri == null) {
      navigation.navigate('PickerSets', { binderId, slotId: pocket.slot.id });
      return;
    }
    pocketMenu(pocket);
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

      <View
        ref={pagerRef}
        style={styles.pager}
        onLayout={(e) => {
          setPagerHeight(e.nativeEvent.layout.height);
          measureGeometry();
        }}
      >
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
                  onPocketLongPress={pocketMenu}
                />
              </View>
            )}
          />
        </GestureDetector>
        {pagerHeight > 0 && (
          <PageTurnOverlay
            progress={turnProgress}
            direction={turnDirection}
            width={windowWidth}
            height={pagerHeight}
          />
        )}
        {pagerHeight > 0 && organizing && (
          <ShuffleOverlay
            active={shuffleActive}
            progress={shuffleProgress}
            width={windowWidth}
            height={pagerHeight}
          />
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.pageNav}>
          <Pressable
            onPress={() => goToPage(currentPageRef.current - 1)}
            hitSlop={12}
            disabled={currentPage === 0}
          >
            <Text style={[styles.pageArrow, currentPage === 0 && styles.pageArrowOff]}>
              ‹
            </Text>
          </Pressable>
          <Text style={styles.pageIndicator}>
            Page {Math.min(currentPage + 1, pages.length)} / {pages.length}
          </Text>
          <Pressable
            onPress={() => goToPage(currentPageRef.current + 1)}
            hitSlop={12}
            disabled={currentPage >= pages.length - 1}
          >
            <Text
              style={[
                styles.pageArrow,
                currentPage >= pages.length - 1 && styles.pageArrowOff,
              ]}
            >
              ›
            </Text>
          </Pressable>
        </View>
        <View style={styles.stackingRow}>
          <Text style={styles.stackingLabel}>Stack duplicates</Text>
          <Switch
            value={binder.variantStacking}
            onValueChange={(value) => {
              void updateBinder(db, binderId, { variantStacking: value });
              const pockets = pages.flatMap((p) => p.pockets);
              const unpinned = pockets.filter(
                (p) =>
                  p.slot.mergedGroupId === null && p.slot.customImageUri === null,
              );
              if (value) {
                const cardCounts = new Map<string, number>();
                for (const p of unpinned) {
                  if (p.slot.cardId)
                    cardCounts.set(p.slot.cardId, (cardCounts.get(p.slot.cardId) ?? 0) + 1);
                }
                const dupes = [...cardCounts.values()].filter((n) => n > 1).length;
                if (dupes > 0) {
                  Alert.alert(
                    'Stack existing duplicates?',
                    `${dupes} card${dupes === 1 ? '' : 's'} appear in multiple pockets and can be combined.`,
                    [
                      { text: 'Not now', style: 'cancel' },
                      {
                        text: 'Stack them',
                        onPress: () => void consolidateDuplicates(db, binderId),
                      },
                    ],
                  );
                }
              } else {
                const stacks = unpinned.filter((p) => p.slot.quantity > 1).length;
                if (stacks > 0) {
                  Alert.alert(
                    'Unstack duplicates?',
                    `${stacks} pocket${stacks === 1 ? '' : 's'} hold stacked copies; they can be split into separate pockets (pages are added if needed).`,
                    [
                      { text: 'Keep stacked', style: 'cancel' },
                      {
                        text: 'Unstack',
                        onPress: () => void unstackDuplicates(db, binderId),
                      },
                    ],
                  );
                }
              }
            }}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  headerBtn: { color: '#e3350d', fontSize: 18, fontWeight: '600' },
  headerBtnOff: { color: '#cfd8dc' },
  addPage: { color: '#e3350d', fontSize: 15, fontWeight: '600' },
  pager: { flex: 1 },
  pageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: PAGE_PADDING,
  },
  footer: { alignItems: 'center', paddingBottom: 16, gap: 8 },
  pageNav: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  pageArrow: { fontSize: 26, color: '#e3350d', lineHeight: 28 },
  pageArrowOff: { color: '#cfd8dc' },
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
