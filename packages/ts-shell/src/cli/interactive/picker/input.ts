import { Editor } from '../../../presentation/tui/editor.js';
import { truncateToWidth } from '../../../presentation/tui/text/layout.js';
import type { ParsedKeyEvent } from '../../../presentation/tui/input/keys.js';

export interface PickerInput<T> {
  readonly initial: string;
  readonly label: string;
  validate(text: string): string | undefined;
  apply(text: string): Promise<T>;
}

const MAX_BYTES = 64 * 1024;

/** A bounded form reuses the prompt editor's grapheme motion, wrapping and undo. */
export class InputForm {
  private readonly editor = new Editor();
  private error: string | undefined;
  constructor(readonly input: Omit<PickerInput<unknown>, 'apply'>) {
    if (Buffer.byteLength(input.initial) <= MAX_BYTES) this.editor.setText(input.initial);
    else this.error = 'Value is too large for this editor. Edit the configuration file instead.';
  }

  render(title: string, width: number, height: number): string[] {
    const rows = [title, this.input.label, ...this.editor.render(width, Math.max(1, Math.min(6, height - 5))),
      this.error ?? 'Enter: stage value    Esc: cancel    Ctrl+U: clear'];
    return rows.map(row => truncateToWidth(row, width));
  }

  paste(text: string): void {
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) { this.error = 'Control characters are not accepted.'; return; }
    if (Buffer.byteLength(this.editor.getText()) + Buffer.byteLength(text) > MAX_BYTES) { this.error = 'Value exceeds the editor size limit.'; return; }
    this.editor.insert(text); this.error = undefined;
  }

  key(event: ParsedKeyEvent): void {
    if (['left', 'right', 'up', 'down'].includes(event.keyId)) this.editor.move(event.keyId as 'left' | 'right' | 'up' | 'down');
    else if (event.keyId === 'home' || event.keyId === 'ctrl+a') this.editor.move('line-start');
    else if (event.keyId === 'end' || event.keyId === 'ctrl+e') this.editor.move('line-end');
    else if (event.keyId === 'backspace') this.editor.backspace();
    else if (event.keyId === 'delete') this.editor.deleteForward();
    else if (event.keyId === 'ctrl+u') this.editor.clear();
    else if (event.keyId === 'ctrl+z') this.editor.undo();
    else if (event.text && !event.ctrl && !event.alt && !event.meta) this.paste(event.text);
  }

  value(): string | undefined {
    const text = this.editor.getText();
    this.error = this.input.validate(text);
    return this.error ? undefined : text;
  }
}
