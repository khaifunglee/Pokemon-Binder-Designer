import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const BINDER_LAYOUTS = ['2x2', '3x3', '3x4', '4x4'] as const;
export type BinderLayout = (typeof BINDER_LAYOUTS)[number];

export const SORT_STRATEGIES = [
  'master-set',
  'colour',
  'pokedex',
  'rarity',
  'custom',
] as const;
export type SortStrategy = (typeof SORT_STRATEGIES)[number];

/** Aesthetics only — independent from sort_strategy (see CLAUDE.md). */
export interface VisualTheme {
  coverImageUri?: string;
  accentColor?: string;
}

/**
 * TCGdex sets, ingested at first launch. Cards reference these; set
 * browse/checklists and master-set sorting read from here offline.
 */
export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(), // TCGdex set id, e.g. "me04"
  name: text('name').notNull(),
  series: text('series').notNull(),
  printedTotal: integer('printed_total').notNull(),
  total: integer('total').notNull(),
  releaseDate: text('release_date').notNull(), // TCGdex "YYYY-MM-DD"; '' if the API omits it
  /** TCGplayer/PTCGO set code (e.g. "SVI"); null for ~15% of sets. */
  ptcgoCode: text('ptcgo_code'),
  symbolUri: text('symbol_uri'),
  logoUri: text('logo_uri'),
  /** Set when all cards of the set have been ingested into `cards`. */
  cardsIngestedAt: integer('cards_ingested_at', { mode: 'timestamp_ms' }),
});

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(), // TCGdex card id, e.g. "me04-003"
    name: text('name').notNull(),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id),
    number: text('number').notNull(), // not numeric: "TG12", "025a"
    rarity: text('rarity'),
    supertype: text('supertype').notNull(),
    types: text('types', { mode: 'json' }).$type<string[]>().notNull(),
    nationalPokedexNumbers: text('national_pokedex_numbers', { mode: 'json' })
      .$type<number[]>()
      .notNull(),
    imageSmallUri: text('image_small_uri'),
    imageLargeUri: text('image_large_uri'),
    variants: text('variants', { mode: 'json' }).$type<string[]>().notNull(),
  },
  (t) => [index('cards_set_id_idx').on(t.setId), index('cards_name_idx').on(t.name)],
);

export const binders = sqliteTable('binders', {
  id: text('id').primaryKey(), // client-generated UUID
  name: text('name').notNull(),
  layout: text('layout', { enum: BINDER_LAYOUTS }).notNull(),
  sortStrategy: text('sort_strategy', { enum: SORT_STRATEGIES })
    .notNull()
    .default('custom'),
  visualTheme: text('visual_theme', { mode: 'json' }).$type<VisualTheme>(),
  variantStacking: integer('variant_stacking', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const pages = sqliteTable(
  'pages',
  {
    id: text('id').primaryKey(),
    binderId: text('binder_id')
      .notNull()
      .references(() => binders.id, { onDelete: 'cascade' }),
    pageIndex: integer('page_index').notNull(),
  },
  (t) => [uniqueIndex('pages_binder_page_uq').on(t.binderId, t.pageIndex)],
);

export const slots = sqliteTable(
  'slots',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    slotIndex: integer('slot_index').notNull(),
    cardId: text('card_id').references(() => cards.id), // null = empty pocket
    variant: text('variant'),
    quantity: integer('quantity').notNull().default(1),
    condition: text('condition'),
  },
  (t) => [uniqueIndex('slots_page_slot_uq').on(t.pageId, t.slotIndex)],
);

/** Source of truth for "what I own", independent of binder placement. */
export const collection = sqliteTable(
  'collection',
  {
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id),
    variant: text('variant').notNull(),
    quantityOwned: integer('quantity_owned').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.variant] })],
);

/**
 * Volatile price data, deliberately separate from the immutable card
 * catalog: refreshes touch only these rows, and fetched_at drives
 * TTL-based re-fetching. Canonical currency is USD (TCGplayer market).
 */
export const cardPrices = sqliteTable(
  'card_prices',
  {
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id),
    variant: text('variant').notNull(),
    marketUsd: real('market_usd').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.variant] })],
);

/** USD-based exchange rates (ECB via frankfurter), refreshed on a TTL. */
export const exchangeRates = sqliteTable('exchange_rates', {
  currency: text('currency').primaryKey(), // ISO 4217, e.g. "EUR"
  ratePerUsd: real('rate_per_usd').notNull(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
});

/** App-level key/value settings (e.g. display currency). */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type SetRow = typeof sets.$inferSelect;
export type SetInsert = typeof sets.$inferInsert;
export type CardRow = typeof cards.$inferSelect;
export type CardInsert = typeof cards.$inferInsert;
export type BinderRow = typeof binders.$inferSelect;
export type BinderInsert = typeof binders.$inferInsert;
export type PageRow = typeof pages.$inferSelect;
export type SlotRow = typeof slots.$inferSelect;
export type CollectionRow = typeof collection.$inferSelect;
export type CardPriceRow = typeof cardPrices.$inferSelect;
export type ExchangeRateRow = typeof exchangeRates.$inferSelect;
