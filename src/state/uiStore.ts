import { create } from 'zustand';

/**
 * Transient UI signals that cross screens. `lastPlaced` lets the binder
 * grid play the sleeve slide-in only for the pocket that was just
 * filled — never for pockets mounting during normal page renders.
 */
interface UiState {
  lastPlacedSlotId: string | null;
  lastPlacedAt: number;
  notePlacement: (slotId: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  lastPlacedSlotId: null,
  lastPlacedAt: 0,
  notePlacement: (slotId) => set({ lastPlacedSlotId: slotId, lastPlacedAt: Date.now() }),
}));
