import { Editor } from "../editor.js";
import type { PointerEvent, PointerResult, ViewComponent } from "./contract.js";

export interface EditorCallbacks {
  readonly onSubmit?: (text: string) => void;
  readonly onChange?: (text: string) => void;
}

export class PromptEditor implements ViewComponent {
  focused = true;
  private readonly editor: Editor;
  private readonly callbacks: EditorCallbacks;

  constructor(editor?: Editor, callbacks: EditorCallbacks = {}) {
    this.editor = editor ?? new Editor();
    this.callbacks = callbacks;
  }

  get inner(): Editor {
    return this.editor;
  }

  getText(): string {
    return this.editor.getText();
  }

  setText(text: string): void {
    this.editor.setText(text);
    this.callbacks.onChange?.(this.editor.getText());
  }

  clear(): void {
    this.editor.clear();
    this.callbacks.onChange?.("");
  }

  insert(text: string): void {
    this.editor.insert(text);
    this.callbacks.onChange?.(this.editor.getText());
  }

  submit(): string {
    const text = this.editor.getText();
    this.callbacks.onSubmit?.(text);
    return text;
  }

  handleInput(data: string): void {
    if (data === "\r" || data === "\n") {
      if (!this.callbacks.onSubmit) return;
      this.submit();
      return;
    }
    if (data.length === 1 && data >= " " && data !== "\u007f") {
      this.editor.insert(data);
      this.callbacks.onChange?.(this.editor.getText());
    }
  }

  handlePointer(_event: PointerEvent): PointerResult | undefined {
    return undefined;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const previous = this.editor.focused;
    this.editor.focused = this.focused;
    try {
      return this.editor.render(Math.max(1, Math.floor(width)));
    } finally {
      this.editor.focused = previous;
    }
  }
}
