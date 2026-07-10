import { layoutSpec, slotPosition } from './layout';
import type { BinderLayout } from '../../db/schema';

/**
 * Merged pockets: adjacent slots sharing a merged_group_id render as one
 * region (custom images / oversized aesthetics). Groups must always form
 * a solid rectangle on their page — these helpers validate and describe
 * them; the DB layer just writes group ids.
 */

export interface MergeCell {
  slotId: string;
  slotIndex: number;
  mergedGroupId: string | null;
}

export interface Region {
  groupId: string;
  minRow: number;
  minCol: number;
  maxRow: number;
  maxCol: number;
  slotIndexes: number[];
}

/** True iff the slot indexes tile a solid rectangle on a `cols`-wide grid. */
export function isSolidRectangle(slotIndexes: number[], layout: BinderLayout): boolean {
  if (slotIndexes.length === 0) return false;
  const positions = slotIndexes.map((i) => slotPosition(layout, i));
  const minRow = Math.min(...positions.map((p) => p.row));
  const maxRow = Math.max(...positions.map((p) => p.row));
  const minCol = Math.min(...positions.map((p) => p.col));
  const maxCol = Math.max(...positions.map((p) => p.col));
  const area = (maxRow - minRow + 1) * (maxCol - minCol + 1);
  const unique = new Set(slotIndexes);
  return unique.size === slotIndexes.length && unique.size === area;
}

/**
 * The cells a merge would produce: the source's whole group (or just the
 * source) plus the neighbour's whole group (or just the neighbour).
 * Returns null when the neighbour is off-page or the union isn't a solid
 * rectangle.
 */
export function mergeUnion(
  cells: MergeCell[],
  layout: BinderLayout,
  sourceSlotIndex: number,
  direction: 'right' | 'down',
): MergeCell[] | null {
  const { cols } = layoutSpec(layout);
  const source = cells.find((c) => c.slotIndex === sourceSlotIndex);
  if (!source) return null;

  const { col } = slotPosition(layout, sourceSlotIndex);
  const targetIndex =
    direction === 'right'
      ? col + 1 < cols
        ? sourceSlotIndex + 1
        : -1
      : sourceSlotIndex + cols;
  const target = cells.find((c) => c.slotIndex === targetIndex);
  if (targetIndex < 0 || !target) return null;

  const groupOf = (cell: MergeCell): MergeCell[] =>
    cell.mergedGroupId === null
      ? [cell]
      : cells.filter((c) => c.mergedGroupId === cell.mergedGroupId);

  const union = new Map<number, MergeCell>();
  for (const c of [...groupOf(source), ...groupOf(target)]) union.set(c.slotIndex, c);
  const result = [...union.values()];

  return isSolidRectangle(result.map((c) => c.slotIndex), layout) ? result : null;
}

/** Rendering descriptors for every merged group on a page. */
export function groupRegions(cells: MergeCell[], layout: BinderLayout): Region[] {
  const byGroup = new Map<string, MergeCell[]>();
  for (const c of cells) {
    if (c.mergedGroupId === null) continue;
    const list = byGroup.get(c.mergedGroupId) ?? [];
    list.push(c);
    byGroup.set(c.mergedGroupId, list);
  }
  const regions: Region[] = [];
  for (const [groupId, group] of byGroup) {
    const positions = group.map((c) => slotPosition(layout, c.slotIndex));
    regions.push({
      groupId,
      minRow: Math.min(...positions.map((p) => p.row)),
      minCol: Math.min(...positions.map((p) => p.col)),
      maxRow: Math.max(...positions.map((p) => p.row)),
      maxCol: Math.max(...positions.map((p) => p.col)),
      slotIndexes: group.map((c) => c.slotIndex).sort((a, b) => a - b),
    });
  }
  return regions.sort((a, b) => a.slotIndexes[0] - b.slotIndexes[0]);
}

/** The anchor (top-left) cell holds the region's content/custom image. */
export function regionAnchorIndex(region: Region): number {
  return region.slotIndexes[0];
}
