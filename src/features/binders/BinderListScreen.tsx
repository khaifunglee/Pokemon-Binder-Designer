import { useNavigation } from '@react-navigation/native';
import { desc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  createBinder,
  deleteBinder,
  duplicateBinder,
  updateBinder,
} from '../../db/binders';
import { db } from '../../db/client';
import { binders } from '../../db/schema';
import type { BinderRow } from '../../db/schema';
import { layoutSpec } from '../../lib/binder/layout';
import { BinderFormModal } from './BinderFormModal';

export function BinderListScreen() {
  const navigation = useNavigation();
  const { data } = useLiveQuery(
    db.select().from(binders).orderBy(desc(binders.updatedAt)),
  );
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<BinderRow | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.navigate('ChecklistSets')} hitSlop={12}>
            <Text style={styles.headerAction}>Checklists</Text>
          </Pressable>
          <Pressable onPress={() => setCreating(true)} hitSlop={12}>
            <Text style={styles.addButton}>＋</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation]);

  const showActions = (binder: BinderRow) => {
    Alert.alert(binder.name, undefined, [
      { text: 'Rename', onPress: () => setRenaming(binder) },
      {
        text: 'Duplicate',
        onPress: () => void duplicateBinder(db, binder.id),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete binder?', `"${binder.name}" and its pages will be removed.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => void deleteBinder(db, binder.id),
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={data ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No binders yet</Text>
            <Text style={styles.emptyBody}>Tap ＋ to create your first binder.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('Binder', { binderId: item.id })}
            onLongPress={() => showActions(item)}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub}>
                {item.layout} · {layoutSpec(item.layout).slotsPerPage} pockets/page
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />

      <BinderFormModal
        visible={creating}
        title="New binder"
        submitLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={(values) => {
          setCreating(false);
          void createBinder(db, values);
        }}
      />
      <BinderFormModal
        visible={renaming !== null}
        title="Rename binder"
        submitLabel="Rename"
        nameOnly
        initialName={renaming?.name ?? ''}
        onClose={() => setRenaming(null)}
        onSubmit={(values) => {
          const target = renaming;
          setRenaming(null);
          if (target) void updateBinder(db, target.id, { name: values.name });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  headerAction: { fontSize: 15, color: '#e3350d', fontWeight: '600' },
  addButton: { fontSize: 22, color: '#e3350d' },
  list: { padding: 12, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 13, color: '#888' },
  chevron: { fontSize: 22, color: '#bbb' },
  empty: { alignItems: 'center', marginTop: 80, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#555' },
  emptyBody: { fontSize: 14, color: '#999' },
});
