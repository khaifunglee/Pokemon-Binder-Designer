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
  setStatus: (status: Partial<Omit<SyncState, 'setStatus' | 'setIdle'>>) => void;
  setIdle: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  phase: 'idle',
  message: null,
  done: 0,
  total: 0,
  failedSetIds: [],
  setStatus: (status) => set(status),
  setIdle: () => set({ phase: 'idle', message: null, done: 0, total: 0 }),
}));
