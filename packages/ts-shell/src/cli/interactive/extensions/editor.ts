import { Editor, type CursorMove } from '../../../presentation/tui/editor.js';
import type { ParsedKeyEvent } from '../../../presentation/tui/input/keys.js';
import { acceptInsertion, dialogText, MAX_UI_EDITOR_BYTES } from './limits.js';

/** Every text-increasing dialog gesture, including newline and yank, shares the bound. */
export class BoundedEditor extends Editor {
  constructor(private readonly notice: () => void) { super(); }
  override insert(text: string): void {
    if (acceptInsertion(this.getText(), text, MAX_UI_EDITOR_BYTES, this.notice)) super.insert(text);
  }
  override setDraftText(text: string): void {
    super.setDraftText(dialogText(text, MAX_UI_EDITOR_BYTES));
  }
  override newline(): void {
    if (acceptInsertion(this.getText(), '\n', MAX_UI_EDITOR_BYTES, this.notice)) super.newline();
  }
  override yank(): void {
    super.yank();
    if (Buffer.byteLength(this.getText(), 'utf8') <= MAX_UI_EDITOR_BYTES) return;
    this.undo();
    // Discard the rejected redo state while retaining the current bounded source.
    this.setDraftText(this.getText());
    this.notice();
  }
}

/** Reuse the prompt editor's mutations and grapheme-aware movement. */
export function editDialogKey(editor: BoundedEditor, event: ParsedKeyEvent): boolean {
  const motions: Readonly<Record<string, CursorMove>> = {
    left: 'left', right: 'right', up: 'up', down: 'down', home: 'line-start', end: 'line-end',
    'ctrl+a': 'line-start', 'ctrl+e': 'line-end', 'ctrl+left': 'word-left', 'ctrl+right': 'word-right',
  };
  const motion = motions[event.keyId];
  if (motion) editor.move(motion);
  else if (event.keyId === 'enter' || event.keyId === 'shift+enter') editor.newline();
  else if (event.keyId === 'backspace') editor.backspace();
  else if (event.keyId === 'delete') editor.deleteForward();
  else if (event.keyId === 'ctrl+z') editor.undo();
  else if (event.keyId === 'ctrl+shift+z') editor.redo();
  else if (event.keyId === 'ctrl+u') editor.kill('line-start');
  else if (event.keyId === 'ctrl+k') editor.kill('line-end');
  else if (event.keyId === 'ctrl+w') editor.kill('word-left');
  else if (event.keyId === 'ctrl+y') editor.yank();
  else if (event.text) {
    if (event.text.length > MAX_UI_EDITOR_BYTES || Buffer.byteLength(event.text, 'utf8') > MAX_UI_EDITOR_BYTES) editor.insert(event.text);
    else editor.insert(dialogText(event.text, MAX_UI_EDITOR_BYTES));
  } else return false;
  return true;
}
