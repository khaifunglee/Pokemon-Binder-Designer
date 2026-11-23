/**
 * `[catalogue]` lines in the Metro terminal, so the user can see what the
 * sync is doing. Info lines are dev-only; failures always warn. Only ids
 * and counts are logged (public catalogue data), never response bodies.
 */
const PREFIX = '[catalogue] ';

export function logCatalogue(message: string): void {
  if (__DEV__) console.log(PREFIX + message);
}

export function warnCatalogue(message: string, error?: unknown): void {
  const detail =
    error === undefined ? '' : `: ${error instanceof Error ? error.message : String(error)}`;
  console.warn(PREFIX + message + detail);
}
