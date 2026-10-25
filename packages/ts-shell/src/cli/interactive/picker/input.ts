import { Editor } from '../../../presentation/tui/editor.js';
import { truncateToWidth } from '../../../presentation/tui/text/layout.js';
import type { ParsedKeyEvent } from '../../../presentation/tui/input/keys.js';
import { graphemeBoundaries } from '../../../presentation/tui/text/measure.js';

export interface PickerInput<T> {
  readonly initial: string;
  readonly label: string;
  /** Single-line credentials render only bullets and never enter prompt history. */
  readonly masked?: boolean;
  /** Inspect bounded text with the same wrapping and cursor navigation, without editing. */
  readonly readOnly?: boolean;
  /** Modified Enter inserts a newline; plain Enter still submits through the host. */
  readonly multiline?: boolean;
  readonly hint?: string;
  validate(text: string): string | undefined;
  apply(text: string): Promise<T>;
}

const MAX_BYTES = 64 * 1024;

/** A bounded form reuses the prompt editor's grapheme motion, wrapping and undo. */
export class InputForm {
  private editor = new Editor();
  private readonly display = new Editor();
  private error: string | undefined;
  private initialRejected = false;
  constructor(readonly input: Omit<PickerInput<unknown>, 'apply'>) {
    if (Buffer.byteLength(input.initial) <= MAX_BYTES) {
      this.editor.setText(input.initial);
      if (input.readOnly) this.editor.setCursorOffset(0);
    }
    else {
      this.initialRejected = true;
      this.error = 'Value is too large for this editor. Edit the configuration file instead.';
    }
  }

  render(title: string, width: number, height: number): string[] {
    const budget = Math.max(0, Math.floor(height));
    if (budget === 0 || width <= 0) return [];
    const header = budget >= 4 ? [title, this.input.label] : budget === 3 ? [this.input.label] : [];
    const hint = this.input.multiline && !this.input.masked
      ? 'Enter: stage    Shift+Enter/Ctrl+J: newline    Esc: cancel    Ctrl+U: clear'
      : 'Enter: stage value    Esc: cancel    Ctrl+U: clear';
    const footer = budget >= 2 ? [this.error ?? this.input.hint ?? hint] : [];
    const capacity = budget - header.length - footer.length;
    const rows = [...header, ...this.renderInput(width, this.input.readOnly ? capacity : Math.min(6, capacity)), ...footer];
    return rows.map(row => truncateToWidth(row, width));
  }

  paste(text: string): void {
    if (this.input.readOnly) return;
    if (this.input.masked && /[\r\n\t]/.test(text)) { this.error = 'Enter a single-line value.'; return; }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) { this.error = 'Control characters are not accepted.'; return; }
    if (Buffer.byteLength(this.editor.getText()) + Buffer.byteLength(text) > MAX_BYTES) { this.error = 'Value exceeds the editor size limit.'; return; }
    this.editor.insert(text);
    if (text) this.initialRejected = false;
    if (!this.initialRejected) this.error = undefined;
  }

  key(event: ParsedKeyEvent): void {
    if (this.input.readOnly && !['left', 'right', 'up', 'down', 'home', 'end', 'ctrl+a', 'ctrl+e'].includes(event.keyId)) return;
    if (this.input.masked && ['up', 'down'].includes(event.keyId)) {
      this.syncDisplay();
      this.display.move(event.keyId as 'up' | 'down');
      const offsets = graphemeBoundaries(this.editor.getText());
      this.editor.setCursorOffset(offsets[this.display.snapshot().cursor] ?? 0);
    }
    else if (['left', 'right', 'up', 'down'].includes(event.keyId)) this.editor.move(event.keyId as 'left' | 'right' | 'up' | 'down');
    else if (event.keyId === 'home' || event.keyId === 'ctrl+a') this.editor.move('line-start');
    else if (event.keyId === 'end' || event.keyId === 'ctrl+e') this.editor.move('line-end');
    else if (event.keyId === 'backspace') this.editor.backspace();
    else if (event.keyId === 'delete') this.editor.deleteForward();
    else if (event.keyId === 'ctrl+u') {
      if (this.input.masked) this.editor = new Editor(); else this.editor.clear();
      this.initialRejected = false; this.error = undefined;
    }
    else if (event.keyId === 'ctrl+z') this.editor.undo();
    else if (['shift+enter', 'ctrl+j'].includes(event.keyId)) {
      if (this.input.multiline && !this.input.masked) this.paste('\n');
    }
    else if (event.text && !event.ctrl && !event.alt && !event.meta) this.paste(event.text);
  }

  value(): string | undefined {
    if (this.initialRejected) return undefined;
    const text = this.editor.getText();
    this.error = this.input.validate(text);
    return this.error ? undefined : text;
  }

  private renderInput(width: number, height: number): string[] {
    if (!this.input.masked) return this.editor.render(width, height);
    this.syncDisplay();
    return this.display.render(width, height);
  }

  private syncDisplay(): void {
    const snapshot = this.editor.snapshot(), offsets = graphemeBoundaries(snapshot.text);
    this.display.setText('•'.repeat(offsets.length - 1));
    this.display.setCursorOffset(offsets.indexOf(snapshot.cursor));
  }
}
