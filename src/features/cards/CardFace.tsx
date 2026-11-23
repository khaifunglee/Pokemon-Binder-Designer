import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';

import { CARD_IMAGE_CACHE_POLICY } from './images';

interface Props {
  name: string | null;
  number: string | null;
  imageUri: string | null;
  style: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
  transition?: number;
}

const MIN_NAME_PT = 7;
const MAX_NAME_PT = 14;

/**
 * A card's face: its image, or, when TCGdex has no image (8% of cards,
 * e.g. all of Delta Reign) or the image fails to load, a card-shaped
 * tile with the name and number. Plain View + Text, so a full page of
 * placeholders costs no more than images do.
 */
export function CardFace({ name, number, imageUri, style, contentFit = 'cover', transition }: Props) {
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => setFailed(false), [imageUri]);

  if (imageUri && !failed) {
    // The caller's style sizes a wrapper, so it can be a plain ViewStyle
    // for both the image and the placeholder.
    return (
      <View style={[style, styles.clip]}>
        <Image
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy={CARD_IMAGE_CACHE_POLICY}
          transition={transition}
          onError={() => setFailed(true)}
          accessibilityLabel={name ?? 'card'}
        />
      </View>
    );
  }

  // Scale with the tile so 4x4 pockets stay legible.
  const namePt = Math.max(MIN_NAME_PT, Math.min(MAX_NAME_PT, width / 7));
  return (
    <View
      style={[style, styles.placeholder]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={name ? `${name}, no image` : 'card, no image'}
    >
      <Text style={[styles.name, { fontSize: namePt }]} numberOfLines={2}>
        {name ?? 'Unknown card'}
      </Text>
      {number ? (
        <Text style={[styles.number, { fontSize: Math.max(MIN_NAME_PT, namePt * 0.8) }]}>
          #{number}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  placeholder: {
    aspectRatio: 63 / 88,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    gap: 2,
    backgroundColor: '#eceff1',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#b0bec5',
    borderRadius: 4,
  },
  name: { color: '#455a64', fontWeight: '600', textAlign: 'center' },
  number: { color: '#78909c', textAlign: 'center' },
});
