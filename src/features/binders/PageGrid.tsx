import { Image } from 'expo-image';
import { StyleSheet, Pressable, Text, View } from 'react-native';

import type { BinderLayout } from '../../db/schema';
import { layoutSpec } from '../../lib/binder/layout';
import { groupRegions, regionAnchorIndex } from '../../lib/binder/merge';
import { CARD_IMAGE_CACHE_POLICY } from '../cards/images';
import type { PocketVM } from './useBinderSpread';

export const CARD_ASPECT = 63 / 88; // physical card width/height

interface Props {
  layout: BinderLayout;
  pockets: PocketVM[];
  pocketWidth: number;
  gap?: number;
  /** Slot being dragged: pocket renders empty while its card floats. */
  hiddenSlotId?: string | null;
  /** Slot awaiting a tap-to-place move target. */
  highlightSlotId?: string | null;
  onPocketPress?: (pocket: PocketVM) => void;
  onPocketLongPress?: (pocket: PocketVM) => void;
}

function PocketFace({
  pocket,
  hidden,
}: {
  pocket: PocketVM;
  hidden: boolean;
}) {
  if (pocket.slot.customImageUri !== null) {
    return (
      <Image
        source={{ uri: pocket.slot.customImageUri }}
        style={styles.cardImage}
        contentFit="cover"
        cachePolicy={CARD_IMAGE_CACHE_POLICY}
        transition={100}
        accessibilityLabel="custom image"
      />
    );
  }
  if (pocket.slot.cardId !== null && !hidden) {
    return (
      <>
        <Image
          source={{ uri: pocket.imageSmallUri ?? pocket.imageLargeUri ?? undefined }}
          style={styles.cardImage}
          contentFit="cover"
          cachePolicy={CARD_IMAGE_CACHE_POLICY}
          transition={100}
          accessibilityLabel={pocket.cardName ?? 'card'}
        />
        {pocket.slot.quantity > 1 && (
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyText}>×{pocket.slot.quantity}</Text>
          </View>
        )}
      </>
    );
  }
  return <Text style={styles.plus}>＋</Text>;
}

export function PageGrid({
  layout,
  pockets,
  pocketWidth,
  gap = 6,
  hiddenSlotId = null,
  highlightSlotId = null,
  onPocketPress,
  onPocketLongPress,
}: Props) {
  const { rows, cols } = layoutSpec(layout);
  const pocketHeight = pocketWidth / CARD_ASPECT;

  const regions = groupRegions(
    pockets.map((p) => ({
      slotId: p.slot.id,
      slotIndex: p.slot.slotIndex,
      mergedGroupId: p.slot.mergedGroupId,
    })),
    layout,
  );
  const mergedIndexes = new Set(regions.flatMap((r) => r.slotIndexes));

  return (
    <View style={[styles.page, { gap }]}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={[styles.row, { gap }]}>
          {Array.from({ length: cols }, (_, c) => {
            const index = r * cols + c;
            const pocket = pockets[index];
            if (!pocket) return <View key={c} style={{ width: pocketWidth }} />;
            if (mergedIndexes.has(index)) {
              // Rendered by its region overlay below.
              return (
                <View
                  key={pocket.slot.id}
                  style={{ width: pocketWidth, height: pocketHeight }}
                />
              );
            }
            const filled =
              (pocket.slot.cardId != null && pocket.slot.id !== hiddenSlotId) ||
              pocket.slot.customImageUri != null;
            return (
              <Pressable
                key={pocket.slot.id}
                onPress={() => onPocketPress?.(pocket)}
                onLongPress={() => onPocketLongPress?.(pocket)}
                style={[
                  styles.pocket,
                  { width: pocketWidth, height: pocketHeight },
                  !filled && styles.emptyPocket,
                  pocket.slot.id === highlightSlotId && styles.highlighted,
                ]}
              >
                <PocketFace pocket={pocket} hidden={pocket.slot.id === hiddenSlotId} />
              </Pressable>
            );
          })}
        </View>
      ))}

      {regions.map((region) => {
        const anchor = pockets[regionAnchorIndex(region)];
        if (!anchor) return null;
        const spanCols = region.maxCol - region.minCol + 1;
        const spanRows = region.maxRow - region.minRow + 1;
        const filled = anchor.slot.cardId != null || anchor.slot.customImageUri != null;
        return (
          <Pressable
            key={region.groupId}
            onPress={() => onPocketPress?.(anchor)}
            onLongPress={() => onPocketLongPress?.(anchor)}
            style={[
              styles.pocket,
              styles.region,
              !filled && styles.emptyPocket,
              anchor.slot.id === highlightSlotId && styles.highlighted,
              {
                left: region.minCol * (pocketWidth + gap),
                top: region.minRow * (pocketHeight + gap),
                width: spanCols * pocketWidth + (spanCols - 1) * gap,
                height: spanRows * pocketHeight + (spanRows - 1) * gap,
              },
            ]}
          >
            <PocketFace pocket={anchor} hidden={false} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', position: 'relative' },
  row: { flexDirection: 'row' },
  pocket: {
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  region: { position: 'absolute' },
  emptyPocket: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#bbb',
    backgroundColor: '#fafafa',
  },
  highlighted: { borderWidth: 2, borderStyle: 'solid', borderColor: '#e3350d' },
  cardImage: { width: '100%', height: '100%' },
  plus: { fontSize: 22, color: '#bbb' },
  qtyBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  qtyText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
