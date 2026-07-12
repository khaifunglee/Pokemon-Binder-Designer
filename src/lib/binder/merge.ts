import { layoutSpec, slotIndexAt, slotPosition } from './layout';
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

export type MergeDirection = 'left' | 'right' | 'up' | 'down';

export const MERGE_DIRECTIONS: MergeDirection[] = ['left', 'right', 'up', 'down'];

/**
 * The cells a merge would produce: the bounding rectangle of the source's
 * group plus the neighbour's group, absorbing loose cells needed to keep
 * the region solid. Returns null when the neighbour is off-page, already
 * in the source's group, or another merged group sticks out of the
 * resulting rectangle.
 */
export function mergeUnion(
  cells: MergeCell[],
  layout: BinderLayout,
  sourceSlotIndex: number,
  direction: MergeDirection,
): MergeCell[] | null {
  const { cols, slotsPerPage } = layoutSpec(layout);
  const source = cells.find((c) => c.slotIndex === sourceSlotIndex);
  if (!source) return null;

  const { col } = slotPosition(layout, sourceSlotIndex);
  let targetIndex: number;
  switch (direction) {
    case 'left':
      targetIndex = col > 0 ? sourceSlotIndex - 1 : -1;
      break;
    case 'right':
      targetIndex = col + 1 < cols ? sourceSlotIndex + 1 : -1;
      break;
    case 'up':
      targetIndex = sourceSlotIndex - cols;
      break;
    case 'down':
      targetIndex = sourceSlotIndex + cols;
      break;
  }
  if (targetIndex < 0 || targetIndex >= slotsPerPage) return null;
  const target = cells.find((c) => c.slotIndex === targetIndex);
  if (!target) return null;
  // Already merged together — nothing to do, so no menu entry.
  if (source.mergedGroupId !== null && source.mergedGroupId === target.mergedGroupId)
    return null;

  const groupOf = (cell: MergeCell): MergeCell[] =>
    cell.mergedGroupId === null
      ? [cell]
      : cells.filter((c) => c.mergedGroupId === cell.mergedGroupId);

  const seed = [...groupOf(source), ...groupOf(target)];
  const positions = seed.map((c) => slotPosition(layout, c.slotIndex));
  const minRow = Math.min(...positions.map((p) => p.row));
  const maxRow = Math.max(...positions.map((p) => p.row));
  const minCol = Math.min(...positions.map((p) => p.col));
  const maxCol = Math.max(...positions.map((p) => p.col));

  const byIndex = new Map(cells.map((c) => [c.slotIndex, c]));
  const result: MergeCell[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cell = byIndex.get(slotIndexAt(layout, r, c));
      if (!cell) return null;
      result.push(cell);
    }
  }
  // No merged group may extend beyond the rectangle we'd form.
  const inside = new Set(result.map((c) => c.slotIndex));
  for (const cell of result) {
    if (cell.mergedGroupId === null) continue;
    for (const member of groupOf(cell)) {
      if (!inside.has(member.slotIndex)) return null;
    }
  }
  return result;
}

/**
 * Like mergeUnion, but the source is the whole group of the given slot:
 * tries the merge from every member, so "merge right" works from a
 * region's anchor even when the anchor isn't on the group's right edge.
 */
export function groupMergeUnion(
  cells: MergeCell[],
  layout: BinderLayout,
  sourceSlotIndex: number,
  direction: MergeDirection,
): MergeCell[] | null {
  const source = cells.find((c) => c.slotIndex === sourceSlotIndex);
  if (!source) return null;
  const members =
    source.mergedGroupId === null
      ? [source]
      : cells.filter((c) => c.mergedGroupId === source.mergedGroupId);
  for (const member of members) {
    const union = mergeUnion(cells, layout, member.slotIndex, direction);
    if (union) return union;
  }
  return null;
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
