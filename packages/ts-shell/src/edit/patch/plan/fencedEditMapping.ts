/**
 * What a fenced edit asked the model to replace, in the terms the patch plan
 * speaks.
 *
 * The mapping type used to live in a proposal module that nothing but the patch
 * plan and its conflict handler consumed; it moved here with them so the type
 * sits beside its only readers rather than in a file whose other work was
 * removed.
 *
 * Deliberately minimal: the fields are the ones the patch layer reads. The
 * planner that produced a mapping — the parsing of a fenced block, the
 * matching against file text — was uncalled and was removed with it, and a
 * caller that hands the patch layer a mapping builds it itself.
 */
export type FencedEditMappingSource =
  | "old-new-fenced-blocks"
  | "replace-directive-to-fence";

export interface FencedEditMapping {
  readonly oldText: string;
  readonly newText: string;
  readonly source: FencedEditMappingSource;
}
