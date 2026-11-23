import { create } from 'zustand';

/**
 * What the catalogue sync is doing right now, for the onboarding screen
 * and the background status line. Written by src/db/catalogueSync.ts.
 */
export type SyncPhase =
  | 'idle'
  | 'onboarding'
  | 'onboarding-error'
  | 'checking'
  | 'topup'
  | 'resync';

interface SyncState {
  phase: SyncPhase;
  message: string | null;
  done: number;
  total: number;
  /** Sets that failed during onboarding; retried at the next start. */
  failedSetIds: string[];
  /** Sets being downloaded or topped up right now (checklist greys out ↻). */
  busySetIds: string[];
  setStatus: (
    status: Partial<Omit<SyncState, 'setStatus' | 'setIdle' | 'markBusy' | 'markDone'>>,
  ) => void;
  setIdle: () => void;
  markBusy: (setId: string) => void;
  markDone: (setId: string) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  phase: 'idle',
  message: null,
  done: 0,
  total: 0,
  failedSetIds: [],
  busySetIds: [],
  setStatus: (status) => set(status),
  setIdle: () => set({ phase: 'idle', message: null, done: 0, total: 0 }),
  markBusy: (setId) => set((s) => ({ busySetIds: [...s.busySetIds, setId] })),
  // Remove one occurrence: a set can be busy twice (sync, then top-up).
  markDone: (setId) =>
    set((s) => {
      const i = s.busySetIds.indexOf(setId);
      return i === -1
        ? s
        : { busySetIds: [...s.busySetIds.slice(0, i), ...s.busySetIds.slice(i + 1)] };
    }),
}));

/** True while the given set is being downloaded or topped up. */
export const useSetBusy = (setId: string): boolean =>
  useSyncStore((s) => s.busySetIds.includes(setId));
