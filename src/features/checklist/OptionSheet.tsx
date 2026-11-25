import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export interface SheetOption {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface SheetSpec {
  title: string;
  message?: string;
  options: SheetOption[];
}

/**
 * A bottom list of choices. Used instead of Alert.alert because Android
 * shows at most three alert buttons and drops the rest silently, and the
 * variant menu can list up to seven variants.
 */
export function OptionSheet({ sheet, onClose }: { sheet: SheetSpec | null; onClose: () => void }) {
  return (
    <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={() => {}}>
          {sheet && (
            <>
              <Text style={styles.title}>{sheet.title}</Text>
              {sheet.message ? <Text style={styles.message}>{sheet.message}</Text> : null}
              <ScrollView style={styles.list}>
                {sheet.options.map((option) => (
                  <Pressable
                    key={option.label}
                    style={styles.option}
                    accessibilityRole="button"
                    onPress={() => {
                      onClose();
                      option.onPress();
                    }}
                  >
                    <Text style={[styles.optionText, option.destructive && styles.destructive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.divider} />
              <Pressable style={styles.option} accessibilityRole="button" onPress={onClose}>
                <Text style={[styles.optionText, styles.cancel]}>Cancel</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center', paddingHorizontal: 16 },
  message: { fontSize: 13, color: '#78909c', textAlign: 'center', marginTop: 4, paddingHorizontal: 16 },
  list: { marginTop: 8 },
  option: { paddingVertical: 14, paddingHorizontal: 20 },
  optionText: { fontSize: 16, color: '#1565c0', textAlign: 'center' },
  destructive: { color: '#d32f2f' },
  cancel: { fontWeight: '600', color: '#455a64' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#dde3e6' },
});
