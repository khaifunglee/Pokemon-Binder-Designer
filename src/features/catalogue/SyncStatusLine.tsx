import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useSyncStore } from '../../state/syncStore';

/**
 * Slim, non-blocking line showing background catalogue work ("Checking
 * for card updates…", the variant top-up, a manual re-sync). Hidden when
 * idle and during onboarding, which has its own screen.
 */
export function SyncStatusLine() {
  const phase = useSyncStore((s) => s.phase);
  const message = useSyncStore((s) => s.message);
  if ((phase !== 'checking' && phase !== 'topup' && phase !== 'resync') || !message) {
    return null;
  }
  return (
    <View style={styles.line} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator size="small" />
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#f5f7f8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dde3e6',
  },
  text: { flex: 1, fontSize: 12, color: '#607d8b' },
});
