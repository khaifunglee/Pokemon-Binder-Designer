/**
 * Drop-target resolution for drag & drop. Pure math over the page-grid
 * geometry so it can run in worklets and be unit-tested.
 */

export interface GridGeometry {
  /** Top-left of the grid in window coordinates. */
  originX: number;
  originY: number;
  pocketWidth: number;
  pocketHeight: number;
  gap: number;
  rows: number;
  cols: number;
}

/**
 * Slot index under a window point, or null when outside the grid.
 * Points in the gap between pockets snap to the nearest cell, so drops
 * don't fail on pixel-perfect misses.
 */
export function pocketAt(
  geom: GridGeometry,
  x: number,
  y: number,
): number | null {
  'worklet';
  const cellW = geom.pocketWidth + geom.gap;
  const cellH = geom.pocketHeight + geom.gap;
  const relX = x - geom.originX + geom.gap / 2;
  const relY = y - geom.originY + geom.gap / 2;
  if (relX < 0 || relY < 0) return null;
  const col = Math.floor(relX / cellW);
  const row = Math.floor(relY / cellH);
  if (col >= geom.cols || row >= geom.rows) return null;
  return row * geom.cols + col;
}

export type EdgeDirection = -1 | 0 | 1;

/** Which page-flip edge (if any) a window x-coordinate is hovering. */
export function edgeDirection(
  x: number,
  windowWidth: number,
  edgeWidth: number,
): EdgeDirection {
  'worklet';
  if (x <= edgeWidth) return -1;
  if (x >= windowWidth - edgeWidth) return 1;
  return 0;
}
