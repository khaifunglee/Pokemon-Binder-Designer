import { groupRegions, isSolidRectangle, mergeUnion, regionAnchorIndex } from '../merge';
import type { MergeCell } from '../merge';

// 3x3 grid: indexes 0..8, rows of 3.
const cell = (
  slotIndex: number,
  mergedGroupId: string | null = null,
): MergeCell => ({ slotId: `s${slotIndex}`, slotIndex, mergedGroupId });

describe('isSolidRectangle', () => {
  it('accepts singles, rows, columns, and blocks', () => {
    expect(isSolidRectangle([4], '3x3')).toBe(true);
    expect(isSolidRectangle([0, 1], '3x3')).toBe(true);
    expect(isSolidRectangle([1, 4, 7], '3x3')).toBe(true);
    expect(isSolidRectangle([0, 1, 3, 4], '3x3')).toBe(true);
    expect(isSolidRectangle([0, 1, 2, 3, 4, 5, 6, 7, 8], '3x3')).toBe(true);
  });

  it('rejects L-shapes, gaps, wraps, and duplicates', () => {
    expect(isSolidRectangle([0, 1, 3], '3x3')).toBe(false); // L
    expect(isSolidRectangle([0, 2], '3x3')).toBe(false); // gap
    expect(isSolidRectangle([2, 3], '3x3')).toBe(false); // row wrap
    expect(isSolidRectangle([0, 0], '3x3')).toBe(false); // duplicate
    expect(isSolidRectangle([], '3x3')).toBe(false);
  });
});

describe('mergeUnion', () => {
  it('merges two loose neighbours', () => {
    const cells = [cell(0), cell(1), cell(2)];
    const union = mergeUnion(cells, '3x3', 0, 'right');
    expect(union?.map((c) => c.slotIndex).sort()).toEqual([0, 1]);
  });

  it('merges downward', () => {
    const cells = [cell(0), cell(3)];
    expect(mergeUnion(cells, '3x3', 0, 'down')?.map((c) => c.slotIndex)).toEqual([0, 3]);
  });

  it('extends an existing group when the result stays rectangular', () => {
    // Group g spans 0,1; merging 0 down pulls in 3 → not rectangular (missing 4) → null.
    const cells = [cell(0, 'g'), cell(1, 'g'), cell(3), cell(4)];
    expect(mergeUnion(cells, '3x3', 0, 'down')).toBeNull();
    // Merging groups {0,1} and {3,4} via 0↓3 forms the 2x2 block.
    const cells2 = [cell(0, 'g'), cell(1, 'g'), cell(3, 'h'), cell(4, 'h')];
    expect(
      mergeUnion(cells2, '3x3', 0, 'down')
        ?.map((c) => c.slotIndex)
        .sort(),
    ).toEqual([0, 1, 3, 4]);
  });

  it('refuses to merge across the row edge or off-grid', () => {
    const cells = [cell(2), cell(3), cell(6), cell(7), cell(8)];
    expect(mergeUnion(cells, '3x3', 2, 'right')).toBeNull(); // 2 is row end
    expect(mergeUnion(cells, '3x3', 7, 'down')).toBeNull(); // below bottom row: no cell
  });
});

describe('groupRegions / regionAnchorIndex', () => {
  it('describes bounding boxes per group, anchored top-left', () => {
    const cells = [
      cell(0, 'g'),
      cell(1, 'g'),
      cell(3, 'g'),
      cell(4, 'g'),
      cell(2),
      cell(8, 'h'),
      cell(5, 'h'),
    ];
    const regions = groupRegions(cells, '3x3');
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({
      groupId: 'g',
      minRow: 0,
      minCol: 0,
      maxRow: 1,
      maxCol: 1,
      slotIndexes: [0, 1, 3, 4],
    });
    expect(regionAnchorIndex(regions[0])).toBe(0);
    expect(regions[1]).toMatchObject({ groupId: 'h', minRow: 1, maxRow: 2, minCol: 2, maxCol: 2 });
  });
});
