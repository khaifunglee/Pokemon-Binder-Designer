import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../db/client';
import { applyImport, resolveImport } from '../../db/importService';
import type { ImportResolution } from '../../db/importService';
import { parseImportCsv } from '../../lib/import/formats';
import type { ImportFormat } from '../../lib/import/types';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Import'>;

type Phase =
  | { kind: 'idle' }
  | { kind: 'resolving' }
  | { kind: 'preview'; format: ImportFormat; resolution: ImportResolution; skipped: number }
  | { kind: 'applying' };

export function ImportScreen({ route, navigation }: Props) {
  const { binderId } = route.params;
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    setPhase({ kind: 'resolving' });
    try {
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const parsed = parseImportCsv(text);
      const resolution = await resolveImport(db, parsed.rows);
      setPhase({
        kind: 'preview',
        format: parsed.format,
        resolution,
        skipped: parsed.skipped.length,
      });
    } catch (e) {
      setPhase({ kind: 'idle' });
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Could not read file');
    }
  };

  const apply = async (resolution: ImportResolution) => {
    setPhase({ kind: 'applying' });
    try {
      const result = await applyImport(db, binderId, resolution.matched);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Import complete',
        `${result.pocketsFilled} pockets filled` +
          (result.pagesAdded > 0 ? `, ${result.pagesAdded} pages added` : '') +
          `, collection updated.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      setPhase({ kind: 'idle' });
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  if (phase.kind === 'idle') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Import a collection CSV</Text>
        <Text style={styles.hint}>
          TCGplayer, pkmnbindr and Collectr exports are detected automatically;
          other CSVs work when they have name/set/number columns. Cards fill this
          binder&apos;s empty pockets and are added to your collection.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={() => void pickFile()}>
          <Text style={styles.primaryBtnText}>Choose CSV file</Text>
        </Pressable>
      </View>
    );
  }

  if (phase.kind === 'resolving' || phase.kind === 'applying') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.hint}>
          {phase.kind === 'resolving'
            ? 'Matching cards (downloading sets as needed)…'
            : 'Filling binder…'}
        </Text>
      </View>
    );
  }

  const { resolution, format, skipped } = phase;
  const totalCards = resolution.matched.reduce((n, m) => n + m.row.quantity, 0);

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>
          {resolution.matched.length} rows matched ({totalCards} cards)
        </Text>
        <Text style={styles.summarySub}>
          Format: {format}
          {skipped > 0 ? ` · ${skipped} unreadable lines skipped` : ''}
          {resolution.problems.length > 0
            ? ` · ${resolution.problems.length} unmatched`
            : ''}
        </Text>
      </View>

      <ScrollView style={styles.scroll}>
        {resolution.problems.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Won&apos;t be imported</Text>
            {resolution.problems.map((p) => (
              <Text key={`p-${p.line}`} style={styles.problemRow}>
                line {p.line}: {p.detail}
              </Text>
            ))}
          </>
        )}
        <Text style={styles.sectionHeader}>Will be imported</Text>
        {resolution.matched.map((m) => (
          <Text key={`m-${m.row.line}-${m.cardId}`} style={styles.matchRow}>
            {m.row.quantity}× {m.cardName} ({m.setId} · {m.variant})
          </Text>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={styles.secondaryBtn} onPress={() => setPhase({ kind: 'idle' })}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, resolution.matched.length === 0 && styles.disabled]}
          disabled={resolution.matched.length === 0}
          onPress={() => void apply(resolution)}
        >
          <Text style={styles.primaryBtnText}>
            Import {resolution.matched.length} rows
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 28,
  },
  title: { fontSize: 18, fontWeight: '600' },
  hint: { color: '#888', textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    backgroundColor: '#e3350d',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondaryBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  secondaryBtnText: { color: '#666', fontSize: 15 },
  disabled: { opacity: 0.4 },
  summary: { padding: 16, gap: 4, borderBottomWidth: 1, borderBottomColor: '#eee' },
  summaryTitle: { fontSize: 16, fontWeight: '600' },
  summarySub: { fontSize: 13, color: '#888' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#546e7a',
    marginTop: 14,
    marginBottom: 6,
  },
  problemRow: { fontSize: 13, color: '#c62828', marginBottom: 3 },
  matchRow: { fontSize: 13, color: '#333', marginBottom: 3 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
});
