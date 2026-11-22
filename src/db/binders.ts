import { asc, desc, eq, inArray, max } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { buildBinder, buildPages } from '../lib/binder/provision';
import type { NewBinderInput } from '../lib/binder/provision';
import type { Db } from './client';
import { binders, pages, slots } from './schema';
import type { BinderRow, PageRow, SlotRow, VisualTheme } from './schema';

export async function createBinder(
  db: Db,
  input: NewBinderInput,
): Promise<BinderRow> {
  const provision = buildBinder(input, randomUUID);
  await db.transaction(async (tx) => {
    await tx.insert(binders).values(provision.binder);
    await tx.insert(pages).values(provision.pages);
    await tx.insert(slots).values(provision.slots);
  });
  return provision.binder as BinderRow;
}

export async function listBinders(db: Db): Promise<BinderRow[]> {
  return db.select().from(binders).orderBy(desc(binders.updatedAt));
}

export interface BinderPatch {
  name?: string;
  visualTheme?: VisualTheme | null;
  variantStacking?: boolean;
  sortStrategy?: BinderRow['sortStrategy'];
}

export async function updateBinder(
  db: Db,
  binderId: string,
  patch: BinderPatch,
): Promise<void> {
  await db
    .update(binders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(binders.id, binderId));
}

/** Mark a binder as modified (call when its pages/slots change). */
export async function touchBinder(db: Db, binderId: string): Promise<void> {
  await db
    .update(binders)
    .set({ updatedAt: new Date() })
    .where(eq(binders.id, binderId));
}

export async function deleteBinder(db: Db, binderId: string): Promise<void> {
  // FK cascades (PRAGMA foreign_keys=ON) remove pages and slots.
  await db.delete(binders).where(eq(binders.id, binderId));
}

export async function addPages(
  db: Db,
  binderId: string,
  count = 1,
): Promise<PageRow[]> {
  const [binder] = await db
    .select()
    .from(binders)
    .where(eq(binders.id, binderId));
  if (!binder) throw new Error(`binder ${binderId} not found`);

  const [{ maxIndex }] = await db
    .select({ maxIndex: max(pages.pageIndex) })
    .from(pages)
    .where(eq(pages.binderId, binderId));
  const nextIndex = (maxIndex ?? -1) + 1;

  const built = buildPages(binder.layout, binderId, nextIndex, count, randomUUID);
  await db.transaction(async (tx) => {
    await tx.insert(pages).values(built.pages);
    await tx.insert(slots).values(built.slots);
    await tx
      .update(binders)
      .set({ updatedAt: new Date() })
      .where(eq(binders.id, binderId));
  });
  return built.pages;
}

export async function duplicateBinder(
  db: Db,
  binderId: string,
): Promise<BinderRow> {
  const [source] = await db
    .select()
    .from(binders)
    .where(eq(binders.id, binderId));
  if (!source) throw new Error(`binder ${binderId} not found`);

  const sourcePages = await db
    .select()
    .from(pages)
    .where(eq(pages.binderId, binderId));
  const sourceSlots = sourcePages.length
    ? await db
        .select()
        .from(slots)
        .where(inArray(slots.pageId, sourcePages.map((p) => p.id)))
    : [];

  const now = new Date();
  const copy: BinderRow = {
    ...source,
    id: randomUUID(),
    name: `${source.name} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
  const pageIdMap = new Map(sourcePages.map((p) => [p.id, randomUUID()]));
  const copiedPages: PageRow[] = sourcePages.map((p) => ({
    ...p,
    id: pageIdMap.get(p.id)!,
    binderId: copy.id,
  }));
  const copiedSlots: SlotRow[] = sourceSlots.map((s) => ({
    ...s,
    id: randomUUID(),
    pageId: pageIdMap.get(s.pageId)!,
  }));

  await db.transaction(async (tx) => {
    await tx.insert(binders).values(copy);
    if (copiedPages.length) await tx.insert(pages).values(copiedPages);
    if (copiedSlots.length) await tx.insert(slots).values(copiedSlots);
  });
  return copy;
}

export interface BinderDetail {
  binder: BinderRow;
  pages: PageRow[];
  /** Keyed by page id, each list ordered by slotIndex. */
  slotsByPage: Map<string, SlotRow[]>;
}

export async function getBinderDetail(
  db: Db,
  binderId: string,
): Promise<BinderDetail | null> {
  const [binder] = await db
    .select()
    .from(binders)
    .where(eq(binders.id, binderId));
  if (!binder) return null;

  const binderPages = await db
    .select()
    .from(pages)
    .where(eq(pages.binderId, binderId))
    .orderBy(asc(pages.pageIndex));
  const allSlots = binderPages.length
    ? await db
        .select()
        .from(slots)
        .where(inArray(slots.pageId, binderPages.map((p) => p.id)))
        .orderBy(asc(slots.slotIndex))
    : [];

  const slotsByPage = new Map<string, SlotRow[]>(
    binderPages.map((p) => [p.id, []]),
  );
  for (const slot of allSlots) slotsByPage.get(slot.pageId)?.push(slot);

  return { binder, pages: binderPages, slotsByPage };
}
