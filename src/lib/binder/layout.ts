import type { BinderLayout } from '../../db/schema';

export interface LayoutSpec {
  rows: number;
  cols: number;
  slotsPerPage: number;
}

const SPECS: Record<BinderLayout, LayoutSpec> = {
  '2x2': { rows: 2, cols: 2, slotsPerPage: 4 },
  '3x3': { rows: 3, cols: 3, slotsPerPage: 9 },
  '3x4': { rows: 4, cols: 3, slotsPerPage: 12 }, // named cols x rows, like binder products
  '4x4': { rows: 4, cols: 4, slotsPerPage: 16 },
};

export function layoutSpec(layout: BinderLayout): LayoutSpec {
  return SPECS[layout];
}

/** Row/col of a slot on its page. Slots run left→right, top→bottom. */
export function slotPosition(
  layout: BinderLayout,
  slotIndex: number,
): { row: number; col: number } {
  const { cols } = layoutSpec(layout);
  return { row: Math.floor(slotIndex / cols), col: slotIndex % cols };
}

export function slotIndexAt(
  layout: BinderLayout,
  row: number,
  col: number,
): number {
  return row * layoutSpec(layout).cols + col;
}

/**
 * A binder-wide slot ordinal (0-based, page order) ↔ (page, slot) address.
 * Sort strategies produce ordinals; placement needs addresses.
 */
export function addressForOrdinal(
  layout: BinderLayout,
  ordinal: number,
): { pageIndex: number; slotIndex: number } {
  const { slotsPerPage } = layoutSpec(layout);
  return {
    pageIndex: Math.floor(ordinal / slotsPerPage),
    slotIndex: ordinal % slotsPerPage,
  };
}

export function ordinalForAddress(
  layout: BinderLayout,
  pageIndex: number,
  slotIndex: number,
): number {
  return pageIndex * layoutSpec(layout).slotsPerPage + slotIndex;
}

/** Pages needed to hold `cardCount` cards (min 1 — a binder has a page). */
export function pagesNeeded(layout: BinderLayout, cardCount: number): number {
  return Math.max(1, Math.ceil(cardCount / layoutSpec(layout).slotsPerPage));
}
