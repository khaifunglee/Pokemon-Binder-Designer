export type ImportFormat = 'tcgplayer' | 'pkmnbindr' | 'collectr' | 'generic';

/** One CSV line normalized to our vocabulary, before card resolution. */
export interface ImportRow {
  /** 1-based line number in the source file (header = 1). */
  line: number;
  name: string | null;
  /** Set code as printed by the source (e.g. "SVI", "sv1"). */
  setCode: string | null;
  setName: string | null;
  /** Collector number, normalized: "025/198" → "025". */
  number: string | null;
  quantity: number;
  /** Canonical variant key (KNOWN_VARIANTS) when recognizable. */
  variantHint: string | null;
  condition: string | null;
}

export interface ParsedImport {
  format: ImportFormat;
  rows: ImportRow[];
  /** Lines skipped with a reason (bad quantity, no identifying fields…). */
  skipped: { line: number; reason: string }[];
}
