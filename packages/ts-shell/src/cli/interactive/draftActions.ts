import type { DraftStash } from "../../presentation/tui/editor/draftStash.js";
import type { SourceSelection } from "../../presentation/tui/composer/contract.js";
import type { Editor } from "../../presentation/tui/editor.js";
import { resetVimState } from "./keymap.js";

export interface DraftActionHost {
  readonly editor: Editor;
  readonly stash: DraftStash;
  readonly shortcut: (id: string) => string | undefined;
  readonly copy: (text: string) => void;
  readonly clearSelection: () => void;
  readonly syncSuggestions: (mayOpen: boolean) => void;
  readonly setToast: (message: string) => void;
  readonly requestRender: () => void;
}

export function replaceDraftState(host: Pick<DraftActionHost, "editor" | "clearSelection">, text: string): void {
  resetVimState(host.editor);
  host.clearSelection();
  host.editor.setDraftText(text);
}

export function copyDraftSelection(
  host: Pick<DraftActionHost, "editor" | "clearSelection" | "copy">,
  selection: SourceSelection,
): boolean {
  const snapshot = host.editor.snapshot();
  host.clearSelection();
  if (
    selection.sourceRevision !== snapshot.revision ||
    selection.start < 0 ||
    selection.end > snapshot.text.length ||
    selection.start >= selection.end
  ) {
    return false;
  }
  const text = snapshot.text.slice(selection.start, selection.end);
  if (!text) return false;
  host.copy(text);
  return true;
}

export function stashDraftState(host: DraftActionHost): void {
  const snapshot = host.editor.snapshot();
  const hasText = snapshot.text.trim().length > 0;
  if (hasText && !host.stash.hasDraft) {
    if (!host.stash.stash({ text: snapshot.text, cursor: snapshot.cursor })) {
      host.setToast("A draft is already stashed; take it back before setting this one aside.");
      host.requestRender();
      return;
    }
    resetVimState(host.editor);
    host.clearSelection();
    host.editor.clear();
    host.syncSuggestions(false);
    const key = host.shortcut("tui.input.stash");
    host.setToast(key ? `Draft stashed · ${key} takes it back` : "Draft stashed (shortcut unbound)");
    host.requestRender();
    return;
  }
  const restored = host.stash.restore();
  if (!restored) {
    host.setToast("No stashed draft.");
    host.requestRender();
    return;
  }
  if (hasText) host.stash.stash({ text: snapshot.text, cursor: snapshot.cursor });
  resetVimState(host.editor);
  host.clearSelection();
  host.editor.setDraftText(restored.text);
  host.editor.setCursorOffset(restored.cursor);
  host.syncSuggestions(false);
  host.requestRender();
}
