export type VimMode = "insert" | "normal" | "visual" | "visual-line" | "replace";
export type VimOperator = "d" | "y" | "c";

export interface VimKey {
  readonly key: string;
  readonly text?: string;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly meta?: boolean;
}

export interface VimState {
  readonly mode: VimMode;
  readonly count: number;
  readonly operatorCount?: number;
  readonly operator?: VimOperator;
  readonly pending?: "g" | "r" | "i" | "a" | "f" | "F" | "t" | "T";
  readonly anchor?: number;
  readonly register: string;
  readonly registerLinewise: boolean;
  readonly replaceHistory?: readonly {
    readonly offset: number;
    readonly inserted: string;
    readonly removed: string;
  }[];
}

export type VimEffect =
  | {
    readonly kind: "edit";
    readonly from: number;
    readonly to: number;
    readonly text: string;
    readonly cursorOffset?: number;
    readonly register?: { readonly text: string; readonly linewise: boolean };
  }
  | { readonly kind: "cursor"; readonly offset: number }
  | { readonly kind: "mode"; readonly mode: VimMode; readonly offset?: number }
  | { readonly kind: "undo" }
  | { readonly kind: "redo" }
  | { readonly kind: "none" };
