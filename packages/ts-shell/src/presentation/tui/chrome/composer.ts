import type { Editor } from "../editor.js";
import type { ComposerState, SourceSelection } from "../composer/contract.js";
import { layoutComposer } from "../composer/layout.js";
import { highlightComposer } from "../composer/projection.js";

export { composerTextWidth } from "../composer/layout.js";

export type { ComposerState } from "../composer/contract.js";

/** Compatibility entry point; layout and source selection share the composer owner. */
export function renderComposer(
  editor: Editor, state: ComposerState, width: number, maxRows?: number, selection?: SourceSelection,
): string[] {
  return highlightComposer(layoutComposer(editor, state, width, maxRows), selection);
}
