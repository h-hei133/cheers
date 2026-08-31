import type { ParsedKeyEvent } from "./input/keys.js";
import type { Editor } from "./editor.js";
import type { SelectList } from "./selectList.js";

export interface InputControllerCallbacks {
  readonly onCancelRun?: () => void;
  readonly onSubmit?: (text: string) => void;
  readonly onExit?: () => void;
  readonly onRequestRedraw: () => void;
}

/**
 * Native Input Controller with Escape Multi-Tier Cancellation Ladder
 * and Emacs-Style Editing Shortcuts.
 */
export class InputController {
  private autocompleteActive = false;

  constructor(
    private readonly editor: Editor,
    private readonly selectList: SelectList,
    private readonly callbacks: InputControllerCallbacks,
  ) {}

  setAutocompleteActive(active: boolean): void {
    this.autocompleteActive = active;
  }

  isAutocompleteActive(): boolean {
    return this.autocompleteActive && this.selectList.getItems().length > 0;
  }

  handleKey(event: ParsedKeyEvent, isExecuting: boolean): void {
    // 1. If currently executing an active agent turn:
    if (isExecuting) {
      if (event.keyId === "escape") {
        this.callbacks.onCancelRun?.();
      }
      return;
    }

    // 2. Multi-tier Escape Cancellation:
    if (event.keyId === "escape") {
      if (this.isAutocompleteActive()) {
        this.autocompleteActive = false;
        this.callbacks.onRequestRedraw();
        return;
      }
      // In idle state, Escape preserves the draft
      return;
    }

    // 3. Autocomplete Navigation Interception:
    if (this.isAutocompleteActive()) {
      if (event.keyId === "up") {
        this.selectList.moveUp();
        this.callbacks.onRequestRedraw();
        return;
      }
      if (event.keyId === "down") {
        this.selectList.moveDown();
        this.callbacks.onRequestRedraw();
        return;
      }
      if (event.keyId === "tab") {
        const chosen = this.selectList.getSelectedItem();
        if (chosen) {
          this.editor.setText(`${chosen.value} `);
          this.autocompleteActive = false;
          this.callbacks.onRequestRedraw();
          return;
        }
      }
    }

    // 4. Tab Autocomplete Trigger:
    if (event.keyId === "tab") {
      const text = this.editor.getText().trim();
      if (text.startsWith("/")) {
        this.autocompleteActive = true;
      }
      this.callbacks.onRequestRedraw();
      return;
    }

    // 5. Submit Handling:
    if (event.keyId === "enter") {
      const text = this.editor.getText().trim();
      if (!text) {
        // Empty enter: No-op, do NOT scroll screen
        this.callbacks.onRequestRedraw();
        return;
      }
      this.editor.pushHistory(text);
      this.editor.clear();
      this.autocompleteActive = false;
      this.callbacks.onSubmit?.(text);
      return;
    }

    // 6. Emacs & Standard Navigation Shortcuts:
    if (event.keyId === "ctrl+c") {
      if (this.editor.getText().length > 0) {
        this.editor.clear();
        this.autocompleteActive = false;
        this.callbacks.onRequestRedraw();
        return;
      }
      this.callbacks.onExit?.();
      return;
    }

    if (event.keyId === "ctrl+d") {
      this.callbacks.onExit?.();
      return;
    }

    if (event.keyId === "backspace") {
      this.editor.backspace();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "delete") {
      this.editor.delete();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "ctrl+k") {
      this.editor.killToEndOfLine();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "ctrl+u") {
      this.editor.killToStartOfLine();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "ctrl+y") {
      this.editor.yank();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "ctrl+z") {
      this.editor.undo();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "left") {
      this.editor.moveLeft();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "right") {
      this.editor.moveRight();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "up") {
      if (!this.editor.moveUp()) this.editor.navigateHistory(-1);
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "down") {
      if (!this.editor.moveDown()) this.editor.navigateHistory(1);
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "home" || event.keyId === "ctrl+a") {
      this.editor.moveToHome();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "end" || event.keyId === "ctrl+e") {
      this.editor.moveToEnd();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "alt+left" || event.keyId === "ctrl+left") {
      this.editor.moveWordLeft();
      this.callbacks.onRequestRedraw();
      return;
    }

    if (event.keyId === "alt+right" || event.keyId === "ctrl+right") {
      this.editor.moveWordRight();
      this.callbacks.onRequestRedraw();
      return;
    }

    // 7. Printable Characters Insertion (Strictly filter \t)
    if (event.raw && !event.ctrl && !event.alt && !event.meta && event.raw.length === 1 && event.raw !== "\t") {
      this.editor.insert(event.raw);
      this.callbacks.onRequestRedraw();
    }
  }
}
