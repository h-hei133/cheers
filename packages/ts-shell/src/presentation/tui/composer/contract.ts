export type ComposerShapeId = "default" | "band" | "borderless" | "top-rule" | "padded-rules" | "field" | "rail" | "box";
export type StatusAttachment = "top-border" | "top-band" | "top-rule-chip" | "none";

export interface ComposerState {
  readonly busy: boolean;
  readonly shape?: ComposerShapeId;
  readonly status?: { readonly left: string; readonly right: string; readonly full: string };
}

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
  readonly cursorOverflow?: number;
  readonly imeSafeCursorTail?: boolean;
  readonly scrollbarThumb?: boolean;
} | {
  readonly kind: "decoration";
  readonly screenRow: number;
  readonly rendered: string;
};

export interface ComposerLayout {
  readonly shape: ComposerShapeId;
  readonly source: string;
  readonly sourceRevision: number;
  readonly viewportStart: number;
  readonly width: number;
  readonly rows: readonly ComposerLayoutRow[];
  readonly height: number;
}
