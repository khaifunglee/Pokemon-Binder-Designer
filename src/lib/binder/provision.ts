import type {
  BinderInsert,
  BinderLayout,
  PageRow,
  SlotRow,
  SortStrategy,
  VisualTheme,
} from '../../db/schema';
import { layoutSpec } from './layout';

/** Injectable so builders stay pure/deterministic under test. */
export type IdFn = () => string;

export interface NewBinderInput {
  name: string;
  layout: BinderLayout;
  sortStrategy?: SortStrategy;
  visualTheme?: VisualTheme;
  variantStacking?: boolean;
  /** Initial page count; a binder always has at least one page. */
  pageCount?: number;
}

export interface BinderProvision {
  binder: BinderInsert;
  pages: PageRow[];
  slots: SlotRow[];
}

/**
 * Empty slot rows are pre-created for every pocket: drag & drop, merged
 * groups, and the diff engine all address concrete slot rows, including
 * empty pockets.
 */
export function buildPageSlots(
  layout: BinderLayout,
  pageId: string,
  newId: IdFn,
): SlotRow[] {
  const { slotsPerPage } = layoutSpec(layout);
  return Array.from({ length: slotsPerPage }, (_, slotIndex) => ({
    id: newId(),
    pageId,
    slotIndex,
    cardId: null,
    variant: null,
    quantity: 1,
    condition: null,
    mergedGroupId: null,
    customImageUri: null,
  }));
}

export function buildPages(
  layout: BinderLayout,
  binderId: string,
  firstPageIndex: number,
  count: number,
  newId: IdFn,
): { pages: PageRow[]; slots: SlotRow[] } {
  const pages: PageRow[] = [];
  const slots: SlotRow[] = [];
  for (let i = 0; i < count; i++) {
    const page: PageRow = {
      id: newId(),
      binderId,
      pageIndex: firstPageIndex + i,
    };
    pages.push(page);
    slots.push(...buildPageSlots(layout, page.id, newId));
  }
  return { pages, slots };
}

export function buildBinder(
  input: NewBinderInput,
  newId: IdFn,
  now: Date = new Date(),
): BinderProvision {
  const binder: BinderInsert = {
    id: newId(),
    name: input.name,
    layout: input.layout,
    sortStrategy: input.sortStrategy ?? 'custom',
    visualTheme: input.visualTheme ?? null,
    variantStacking: input.variantStacking ?? false,
    createdAt: now,
    updatedAt: now,
  };
  const pageCount = Math.max(1, input.pageCount ?? 1);
  const { pages, slots } = buildPages(input.layout, binder.id, 0, pageCount, newId);
  return { binder, pages, slots };
}
