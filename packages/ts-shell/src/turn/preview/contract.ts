/** One response's display progress. The index is local to this preview. */
export type ToolPreview = {
  readonly phase: 'start' | 'update';
  readonly previewId: string;
  readonly index: number;
  readonly toolName: string;
  readonly fields: readonly string[];
  readonly target?: string;
  readonly truncated?: true;
} | { readonly phase: 'end'; readonly previewId: string };
