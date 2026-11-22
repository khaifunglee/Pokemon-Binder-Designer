import { buildBinder, buildPages, buildPageSlots } from '../provision';

function sequentialIds(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

describe('buildPageSlots', () => {
  it('creates one empty slot row per pocket', () => {
    const slots = buildPageSlots('3x3', 'page-1', sequentialIds());
    expect(slots).toHaveLength(9);
    expect(slots.map((s) => s.slotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const slot of slots) {
      expect(slot.pageId).toBe('page-1');
      expect(slot.cardId).toBeNull();
      expect(slot.quantity).toBe(1);
    }
  });
});

describe('buildPages', () => {
  it('numbers pages from the given index', () => {
    const { pages, slots } = buildPages('2x2', 'binder-1', 3, 2, sequentialIds());
    expect(pages.map((p) => p.pageIndex)).toEqual([3, 4]);
    expect(pages.every((p) => p.binderId === 'binder-1')).toBe(true);
    expect(slots).toHaveLength(8);
    expect(slots.filter((s) => s.pageId === pages[0].id)).toHaveLength(4);
    expect(slots.filter((s) => s.pageId === pages[1].id)).toHaveLength(4);
  });

  it('generates unique ids across pages and slots', () => {
    const { pages, slots } = buildPages('4x4', 'b', 0, 3, sequentialIds());
    const ids = [...pages.map((p) => p.id), ...slots.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildBinder', () => {
  it('applies defaults', () => {
    const now = new Date('2026-07-07T00:00:00Z');
    const { binder, pages, slots } = buildBinder(
      { name: 'My Binder', layout: '3x3' },
      sequentialIds(),
      now,
    );
    expect(binder).toMatchObject({
      name: 'My Binder',
      layout: '3x3',
      sortStrategy: 'custom',
      variantStacking: false,
      visualTheme: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(pages).toHaveLength(1);
    expect(slots).toHaveLength(9);
    expect(pages[0].binderId).toBe(binder.id);
  });

  it('provisions the requested page count, minimum one', () => {
    const ids = sequentialIds();
    expect(
      buildBinder({ name: 'a', layout: '2x2', pageCount: 5 }, ids).pages,
    ).toHaveLength(5);
    expect(
      buildBinder({ name: 'a', layout: '2x2', pageCount: 0 }, ids).pages,
    ).toHaveLength(1);
  });
});
