import { Image } from 'expo-image';
import { StyleSheet, Pressable, Text, View } from 'react-native';

import type { BinderLayout } from '../../db/schema';
import { layoutSpec } from '../../lib/binder/layout';
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

  return (
    <View style={[styles.page, { gap }]}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={[styles.row, { gap }]}>
          {Array.from({ length: cols }, (_, c) => {
            const pocket = pockets[r * cols + c];
            if (!pocket) return <View key={c} style={{ width: pocketWidth }} />;
            const filled =
              pocket.slot.cardId != null && pocket.slot.id !== hiddenSlotId;
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
                {filled ? (
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
                ) : (
                  <Text style={styles.plus}>＋</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center' },
  row: { flexDirection: 'row' },
  pocket: {
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
