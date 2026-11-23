/**
 * GraphQL queries sent to TCGdex, kept here so they're versioned with the
 * code that parses their results (types.ts GqlCard).
 */

/**
 * One set's cards. The id filter is a substring match ("30th-" also hits
 * "30th-c-…"), so callers keep only `set.id === setId`. Nested
 * `set { cards }` is shallow (no variants/illustrator), hence this form.
 */
export const SET_CARDS_QUERY = `query SetCards($prefix: ID!) {
  cards(filters: { id: $prefix }) {
    id
    localId
    name
    rarity
    category
    types
    dexId
    illustrator
    image
    set { id }
    variants { normal reverse holo firstEdition }
  }
}`;
