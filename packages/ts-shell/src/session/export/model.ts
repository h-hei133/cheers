/** Rendered messages and flat display edges for a standalone exported page. */
export interface ExportEntry {
  readonly id: string;
  readonly role: string;
  readonly content: string;
  readonly html: string;
  readonly toolCalls?: readonly { readonly id: string; readonly name: string; readonly arguments: string }[];
  readonly toolCallId?: string;
  readonly origin?: { readonly provider?: string; readonly model: string };
  readonly timestamp?: string;
}

export interface ExportTreeNode {
  readonly id: string;
  readonly parentId?: string;
  readonly depth: number;
  readonly role?: string;
  readonly kind: string;
  readonly preview: string;
  readonly timestamp?: string;
}

export interface ExportPayload {
  readonly header: { readonly sessionId: string; readonly exportedAt: string; readonly workspace: string };
  readonly tree: readonly ExportTreeNode[];
  readonly entries: readonly ExportEntry[];
  readonly leafId: string | null;
  readonly warnings: readonly string[];
}
