import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
/* test edit */
import { BINDER_LAYOUTS } from "../../db/schema";
import type { BinderLayout } from "../../db/schema";

export interface BinderFormValues {
  name: string;
  layout: BinderLayout;
  pageCount: number;
}

interface Props {
  visible: boolean;
  title: string;
  submitLabel: string;
  /** Prefill for rename; layout/pages are hidden when renaming. */
  initialName?: string;
  nameOnly?: boolean;
  onSubmit: (values: BinderFormValues) => void;
  onClose: () => void;
}

export function BinderFormModal({
  visible,
  title,
  submitLabel,
  initialName = "",
  nameOnly = false,
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName);
  const [layout, setLayout] = useState<BinderLayout>("3x3");
  const [pageCount, setPageCount] = useState(4);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setLayout("3x3");
      setPageCount(4);
    }
  }, [visible, initialName]);

  const canSubmit = name.trim().length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>

          <TextInput
            style={styles.input}
            placeholder="Binder name"
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={60}
          />

          {!nameOnly && (
            <>
              <Text style={styles.label}>Pocket layout</Text>
              <View style={styles.layoutRow}>
                {BINDER_LAYOUTS.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setLayout(option)}
                    style={[
                      styles.layoutOption,
                      layout === option && styles.layoutSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.layoutText,
                        layout === option && styles.layoutTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Pages</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => setPageCount((n) => Math.max(1, n - 1))}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{pageCount}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => setPageCount((n) => Math.min(50, n + 1))}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </>
          )}

          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, !canSubmit && styles.disabled]}
              disabled={!canSubmit}
              onPress={() => onSubmit({ name: name.trim(), layout, pageCount })}
            >
              <Text style={styles.submitText}>{submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: { backgroundColor: "#fff", borderRadius: 12, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  label: { fontSize: 13, color: "#666" },
  layoutRow: { flexDirection: "row", gap: 8 },
  layoutOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  layoutSelected: { borderColor: "#e3350d", backgroundColor: "#fdecea" },
  layoutText: { fontSize: 15, color: "#333" },
  layoutTextSelected: { color: "#e3350d", fontWeight: "600" },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { fontSize: 20, lineHeight: 22 },
  stepValue: {
    fontSize: 17,
    fontWeight: "600",
    minWidth: 28,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  disabled: { opacity: 0.4 },
  cancelText: { fontSize: 16, color: "#666" },
  submitText: { fontSize: 16, color: "#e3350d", fontWeight: "600" },
});
