import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../db/client';
import { computeMovePlan } from '../../db/movePlan';
import type { MovePlan } from '../../db/movePlan';
import { autoOrganize } from '../../db/organize';
import { describeInstruction } from '../../lib/binder/moveText';
import type { InstructionText } from '../../lib/binder/moveText';
import type { RootStackParamList } from '../../navigation/types';
import { STRATEGY_LABELS } from './strategyLabels';

type Props = NativeStackScreenProps<RootStackParamList, 'ResortMoves'>;

interface StepVM extends InstructionText {
  key: string;
}

/**
 * The physical re-sort checklist: follow the steps at your real binder,
 * tick them off, then commit so the app matches what you just did.
 */
export function MoveListScreen({ route, navigation }: Props) {
  const { binderId, strategy } = route.params;
  const [plan, setPlan] = useState<MovePlan | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: `Re-sort: ${STRATEGY_LABELS.find(([s]) => s === strategy)?.[1] ?? strategy}`,
    });
    void computeMovePlan(db, binderId, strategy).then(setPlan);
  }, [binderId, strategy, navigation]);

  const steps = useMemo<StepVM[]>(() => {
    if (!plan) return [];
    const out: StepVM[] = [];
    if (plan.pagesToAdd > 0) {
      out.push({
        key: 'add-pages',
        title: `Add ${plan.pagesToAdd} empty page${plan.pagesToAdd === 1 ? '' : 's'} to the back of your binder`,
      });
    }
    plan.instructions.forEach((instruction, i) => {
      out.push({
        key: `step-${i}`,
        ...describeInstruction(instruction, plan.slotsPerPage, (ordinal) =>
          plan.nameByOrdinal.get(ordinal) ?? `the card in ${ordinal + 1}`,
        ),
      });
    });
    return out;
  }, [plan]);

  const commit = () => {
    setCommitting(true);
    void autoOrganize(db, binderId, strategy)
      .then(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.goBack();
      })
      .catch(() => {
        setCommitting(false);
        Alert.alert('Update failed', 'The app binder could not be updated.');
      });
  };

  if (!plan) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.hint}>Working out the moves…</Text>
      </View>
    );
  }

  if (steps.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.bigCheck}>✓</Text>
        <Text style={styles.hint}>Your binder is already in this order.</Text>
      </View>
    );
  }

  const allDone = checked.size === steps.length;

  return (
    <View style={styles.container}>
      <Text style={styles.summary}>
        {plan.movingCount} card{plan.movingCount === 1 ? '' : 's'} move in{' '}
        {steps.length} step{steps.length === 1 ? '' : 's'} — work top to bottom.
      </Text>
      <FlatList
        data={steps}
        keyExtractor={(s) => s.key}
        renderItem={({ item, index }) => {
          const done = checked.has(item.key);
          return (
            <Pressable
              style={[styles.step, done && styles.stepDone]}
              onPress={() => {
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (done) next.delete(item.key);
                  else next.add(item.key);
                  return next;
                });
                void Haptics.selectionAsync();
              }}
            >
              <View style={[styles.checkbox, done && styles.checkboxDone]}>
                {done && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>
                  {index + 1}. {item.title}
                </Text>
                {item.details?.map((line, i) => (
                  <Text key={i} style={[styles.stepDetail, done && styles.stepTitleDone]}>
                    {line}
                  </Text>
                ))}
              </View>
            </Pressable>
          );
        }}
      />
      <Pressable
        style={[styles.commitBtn, (!allDone || committing) && styles.commitBtnOff]}
        disabled={!allDone || committing}
        onPress={commit}
      >
        <Text style={styles.commitText}>
          {allDone ? 'Done — update the app binder' : `${checked.size}/${steps.length} steps done`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  hint: { color: '#999', textAlign: 'center' },
  bigCheck: { fontSize: 44, color: '#66bb6a' },
  summary: {
    padding: 14,
    fontSize: 13,
    color: '#78909c',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  stepDone: { backgroundColor: '#f1f8e9' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#cfd8dc',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxDone: { borderColor: '#66bb6a', backgroundColor: '#66bb6a' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepText: { flex: 1, gap: 3 },
  stepTitle: { fontSize: 14, fontWeight: '500', color: '#333' },
  stepTitleDone: { color: '#9ccc9c' },
  stepDetail: { fontSize: 12.5, color: '#888', lineHeight: 17 },
  commitBtn: {
    margin: 14,
    backgroundColor: '#e3350d',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  commitBtnOff: { backgroundColor: '#cfd8dc' },
  commitText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
