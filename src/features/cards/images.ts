import { Image } from 'expo-image';

import type { CardRow } from '../../db/schema';

/**
 * Card images are lazy-loaded and disk-cached by expo-image. Every card
 * <Image> must use this cache policy so browsing works offline after
 * first view; prefetchCardImages warms the cache after a set is ingested.
 */
export const CARD_IMAGE_CACHE_POLICY = 'memory-disk' as const;

export type CardImageSize = 'small' | 'large';

export function cardImageUri(
  card: Pick<CardRow, 'imageSmallUri' | 'imageLargeUri'>,
  size: CardImageSize,
): string | null {
  // Fall back across sizes: an upscaled/downscaled image beats a blank slot.
  return size === 'small'
    ? (card.imageSmallUri ?? card.imageLargeUri)
    : (card.imageLargeUri ?? card.imageSmallUri);
}

export async function prefetchCardImages(
  cards: Pick<CardRow, 'imageSmallUri' | 'imageLargeUri'>[],
  size: CardImageSize = 'small',
): Promise<void> {
  const uris = cards
    .map((c) => cardImageUri(c, size))
    .filter((uri): uri is string => uri != null);
  if (uris.length === 0) return;
  await Image.prefetch(uris, { cachePolicy: 'disk' });
}
