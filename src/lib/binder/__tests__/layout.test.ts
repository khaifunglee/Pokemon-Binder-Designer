import { BINDER_LAYOUTS } from '../../../db/schema';
import {
  addressForOrdinal,
  layoutSpec,
  ordinalForAddress,
  pagesNeeded,
  slotIndexAt,
  slotPosition,
} from '../layout';

describe('layoutSpec', () => {
  it('matches binder product naming (cols x rows)', () => {
    expect(layoutSpec('2x2')).toEqual({ rows: 2, cols: 2, slotsPerPage: 4 });
    expect(layoutSpec('3x3')).toEqual({ rows: 3, cols: 3, slotsPerPage: 9 });
    expect(layoutSpec('3x4')).toEqual({ rows: 4, cols: 3, slotsPerPage: 12 });
    expect(layoutSpec('4x4')).toEqual({ rows: 4, cols: 4, slotsPerPage: 16 });
  });
});

describe('slotPosition / slotIndexAt', () => {
  it('runs left-to-right, top-to-bottom', () => {
    expect(slotPosition('3x3', 0)).toEqual({ row: 0, col: 0 });
    expect(slotPosition('3x3', 2)).toEqual({ row: 0, col: 2 });
    expect(slotPosition('3x3', 3)).toEqual({ row: 1, col: 0 });
    expect(slotPosition('3x3', 8)).toEqual({ row: 2, col: 2 });
    expect(slotPosition('3x4', 11)).toEqual({ row: 3, col: 2 });
  });

  it('round-trips for every slot of every layout', () => {
    for (const layout of BINDER_LAYOUTS) {
      const { slotsPerPage } = layoutSpec(layout);
      for (let i = 0; i < slotsPerPage; i++) {
        const { row, col } = slotPosition(layout, i);
        expect(slotIndexAt(layout, row, col)).toBe(i);
      }
    }
  });
});

describe('addressForOrdinal / ordinalForAddress', () => {
  it('maps ordinals across pages', () => {
    expect(addressForOrdinal('3x3', 0)).toEqual({ pageIndex: 0, slotIndex: 0 });
    expect(addressForOrdinal('3x3', 8)).toEqual({ pageIndex: 0, slotIndex: 8 });
    expect(addressForOrdinal('3x3', 9)).toEqual({ pageIndex: 1, slotIndex: 0 });
    expect(addressForOrdinal('2x2', 10)).toEqual({ pageIndex: 2, slotIndex: 2 });
  });

  it('round-trips', () => {
    for (const layout of BINDER_LAYOUTS) {
      for (let ordinal = 0; ordinal < 100; ordinal++) {
        const { pageIndex, slotIndex } = addressForOrdinal(layout, ordinal);
        expect(ordinalForAddress(layout, pageIndex, slotIndex)).toBe(ordinal);
      }
    }
  });
});

describe('pagesNeeded', () => {
  it('rounds up and never returns zero', () => {
    expect(pagesNeeded('3x3', 0)).toBe(1);
    expect(pagesNeeded('3x3', 1)).toBe(1);
    expect(pagesNeeded('3x3', 9)).toBe(1);
    expect(pagesNeeded('3x3', 10)).toBe(2);
    expect(pagesNeeded('4x4', 33)).toBe(3);
  });
});
