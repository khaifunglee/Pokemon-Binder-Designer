import { edgeDirection, pocketAt } from '../dnd';
import type { GridGeometry } from '../dnd';

const geom: GridGeometry = {
  originX: 20,
  originY: 100,
  pocketWidth: 100,
  pocketHeight: 140,
  gap: 6,
  rows: 3,
  cols: 3,
};

describe('pocketAt', () => {
  it('hits pocket centers', () => {
    expect(pocketAt(geom, 70, 170)).toBe(0); // center of (0,0)
    expect(pocketAt(geom, 70 + 106, 170)).toBe(1);
    expect(pocketAt(geom, 70, 170 + 146)).toBe(3);
    expect(pocketAt(geom, 70 + 2 * 106, 170 + 2 * 146)).toBe(8);
  });

  it('snaps gap points to the nearest cell', () => {
    // x=122 is in the gap between col 0 (ends 120) and col 1 (starts 126)
    expect(pocketAt(geom, 122, 170)).toBe(0);
    expect(pocketAt(geom, 125, 170)).toBe(1);
  });

  it('returns null outside the grid', () => {
    expect(pocketAt(geom, 5, 170)).toBeNull(); // left of grid
    expect(pocketAt(geom, 70, 50)).toBeNull(); // above
    expect(pocketAt(geom, 20 + 3 * 106 + 10, 170)).toBeNull(); // right
    expect(pocketAt(geom, 70, 100 + 3 * 146 + 10)).toBeNull(); // below
  });

  it('covers every cell round-trip', () => {
    for (let row = 0; row < geom.rows; row++) {
      for (let col = 0; col < geom.cols; col++) {
        const x = geom.originX + col * 106 + 50;
        const y = geom.originY + row * 146 + 70;
        expect(pocketAt(geom, x, y)).toBe(row * geom.cols + col);
      }
    }
  });
});

describe('edgeDirection', () => {
  it('detects both edges with a dead center', () => {
    expect(edgeDirection(10, 400, 40)).toBe(-1);
    expect(edgeDirection(40, 400, 40)).toBe(-1);
    expect(edgeDirection(200, 400, 40)).toBe(0);
    expect(edgeDirection(360, 400, 40)).toBe(1);
    expect(edgeDirection(395, 400, 40)).toBe(1);
  });
});
