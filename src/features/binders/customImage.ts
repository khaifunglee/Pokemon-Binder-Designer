import { randomUUID } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

const DIR = `${FileSystem.documentDirectory}custom-images/`;

/**
 * Let the user pick a photo and copy it into app storage — picker URIs
 * are temporary, so pockets must reference our own copy. Returns the
 * stored URI, or null when the user cancels.
 */
export async function pickAndStoreCustomImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled || result.assets.length === 0) return null;

  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const ext = result.assets[0].uri.split('.').pop() ?? 'jpg';
  const dest = `${DIR}${randomUUID()}.${ext}`;
  await FileSystem.copyAsync({ from: result.assets[0].uri, to: dest });
  return dest;
}

/** Best-effort removal of a stored custom image file. */
export async function deleteCustomImage(uri: string): Promise<void> {
  if (!uri.startsWith(DIR)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
