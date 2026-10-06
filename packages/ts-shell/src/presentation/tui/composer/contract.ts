/** A rendered cell span and the indivisible source grapheme it represents. */
export interface SourceCell {
  readonly columnStart: number;
  readonly columnEnd: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

/** UTF-16 source boundaries; the end is exclusive. */
export interface SourceSelection {
  readonly sourceRevision: number;
  readonly start: number;
  readonly end: number;
}

export type ComposerLayoutRow = {
  readonly kind: "content";
  readonly screenRow: number;
  readonly rendered: string;
  readonly contentColumn: number;
  readonly contentCells: number;
  readonly cells: readonly SourceCell[];
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly breakAfter: "soft" | "logical" | "none";
} | {
  readonly kind: "decoration";
  readonly screenRow: number;
  readonly rendered: string;
};

export interface ComposerLayout {
  readonly source: string;
  readonly sourceRevision: number;
  readonly viewportStart: number;
  readonly width: number;
  readonly rows: readonly ComposerLayoutRow[];
  readonly height: number;
}
