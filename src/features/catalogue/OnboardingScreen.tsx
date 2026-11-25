import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { countSyncedSets, markOnboarded, runOnboarding } from '../../db/catalogueSync';
import { db } from '../../db/client';
import { useSyncStore } from '../../state/syncStore';

type Outcome = 'running' | 'error' | 'partial';

/**
 * First launch: the one-time catalogue download (D18). Retry resumes
 * from the sets already downloaded. "Continue" lets a bad set or a lost
 * connection never trap the user: the app opens with what's downloaded
 * and the next app start fetches the rest.
 */
export function OnboardingScreen({ onFinished }: { onFinished: () => void }) {
  const message = useSyncStore((s) => s.message);
  const done = useSyncStore((s) => s.done);
  const total = useSyncStore((s) => s.total);
  const failedCount = useSyncStore((s) => s.failedSetIds.length);
  const [outcome, setOutcome] = useState<Outcome>('running');
  const [connectionLost, setConnectionLost] = useState(false);
  /** Sets already on the device, offered as "Continue with N sets". */
  const [downloaded, setDownloaded] = useState(0);
  const started = useRef(false);

  const start = useCallback(() => {
    setOutcome('running');
    const settle = (next: Outcome) =>
      void countSyncedSets(db)
        .then(setDownloaded)
        .finally(() => setOutcome(next));
    runOnboarding(db)
      .then(({ failedSetIds, connectionLost: lost }) => {
        if (failedSetIds.length === 0) {
          onFinished();
          return;
        }
        setConnectionLost(lost);
        settle('partial');
      })
      .catch(() => settle('error'));
  }, [onFinished]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  const continueAnyway = useCallback(() => {
    void markOnboarded(db).then(onFinished);
  }, [onFinished]);

  const progress = total > 0 ? Math.min(1, done / total) : 0;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Card catalogue</Text>
      {outcome === 'running' && (
        <>
          <ActivityIndicator />
          <Text style={styles.message}>{message ?? 'Downloading one-time card database…'}</Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.hint}>One-time download, about 7 MB.</Text>
        </>
      )}
      {outcome === 'error' && (
        <>
          <Text style={styles.message}>
            Couldn&apos;t download the card catalogue. Check your connection.
          </Text>
          <Pressable style={styles.button} onPress={start}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
          {downloaded > 0 && (
            <>
              <Pressable style={styles.secondary} onPress={continueAnyway}>
                <Text style={styles.secondaryText}>Continue with {downloaded} sets</Text>
              </Pressable>
              <Text style={styles.hint}>The rest download next time the app starts online.</Text>
            </>
          )}
        </>
      )}
      {outcome === 'partial' && (
        <>
          <Text style={styles.message}>
            {connectionLost
              ? `Connection lost. ${failedCount} sets still to download.`
              : `${failedCount} sets couldn't download`}
          </Text>
          <Pressable style={styles.button} onPress={start}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={continueAnyway}>
            <Text style={styles.secondaryText}>
              {downloaded > 0 ? `Continue with ${downloaded} sets` : 'Continue anyway'}
            </Text>
          </Pressable>
          <Text style={styles.hint}>They&apos;ll retry next time the app starts.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 32,
  },
  title: { fontSize: 22, fontWeight: '700' },
  message: { fontSize: 15, textAlign: 'center', color: '#333' },
  hint: { fontSize: 13, color: '#999', textAlign: 'center' },
  track: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#eceff1',
    overflow: 'hidden',
  },
  bar: { height: 8, backgroundColor: '#e3350d' },
  button: {
    backgroundColor: '#e3350d',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondary: { paddingHorizontal: 20, paddingVertical: 10 },
  secondaryText: { color: '#e3350d', fontWeight: '600', fontSize: 15 },
});
