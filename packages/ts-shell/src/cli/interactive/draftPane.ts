import { Editor } from "../../presentation/tui/editor.js";
import type { PasteStore } from "../../presentation/tui/pastes.js";
import { padToWidth, truncateToWidth } from "../../presentation/tui/text/layout.js";
import { defaultTheme } from "../../presentation/theme/theme.js";
import type { ParsedKeyEvent } from "../../presentation/tui/input/keys.js";

/**
 * Full-screen editor for one long piece of text.
 *
 * A pasted file needs room to be read and changed, and the prompt is one or two
 * rows tall. This borrows the whole screen for it — the alternate screen, so the
 * transcript underneath is untouched and comes back exactly as it was.
 *
 * It is the same {@link Editor} the prompt uses, so every motion, kill, and undo
 * that works below works here, and there is no second editor to keep in step.
 */

export interface DraftPaneResult {
  /** The edited text, or undefined when the edit was abandoned. */
  readonly text?: string;
}

export class DraftPane {
  readonly editor = new Editor();
  private open = false;
  private title = "";
  private onClose: ((result: DraftPaneResult) => void) | undefined;

  get active(): boolean {
    return this.open;
  }

  /**
   * Open whatever the caret is standing on: the most recent held paste when the
   * draft has one, and otherwise the draft itself. Which of the two it is decides
   * where the result goes, so the decision and the write-back live together.
   */
  openFrom(editor: Editor, pastes: PasteStore, onDone: () => void): void {
    const held = pastes.idsIn(editor.getText());
    const id = held[held.length - 1];
    if (id === undefined) {
      this.start("Editing the draft", editor.getText(), (result) => {
        if (result.text !== undefined) editor.setText(result.text);
        onDone();
      });
      return;
    }
    this.start(`Editing paste #${id}`, pastes.get(id) ?? "", (result) => {
      if (result.text === undefined) return onDone();
      editor.setText(pastes.rewrite(editor.getText(), id, result.text));
      onDone();
    });
  }

  /** Take the screen to edit `text`, calling back with the outcome. */
  start(title: string, text: string, onClose: (result: DraftPaneResult) => void): void {
    this.open = true;
    this.title = title;
    this.onClose = onClose;
    this.editor.setText(text);
    this.editor.focused = true;
  }

  /** Route one key. Returns false only when the pane is closed. */
  handleKey(event: ParsedKeyEvent): boolean {
    if (!this.open) return false;
    switch (event.keyId) {
      case "escape":
        this.finish({});
        return true;
      // Enter inserts a newline here: this is a text pane, and the only way out is
      // deliberate. Saving takes the same key that saves in an editor.
      case "ctrl+s":
      case "ctrl+o":
        this.finish({ text: this.editor.getText() });
        return true;
      case "enter":
        this.editor.newline();
        return true;
      case "backspace":
        this.editor.backspace();
        return true;
      case "delete":
        this.editor.deleteForward();
        return true;
      case "up":
        this.editor.move("up");
        return true;
      case "down":
        this.editor.move("down");
        return true;
      case "left":
        this.editor.move("left");
        return true;
      case "right":
        this.editor.move("right");
        return true;
      case "home":
      case "ctrl+a":
        this.editor.move("line-start");
        return true;
      case "end":
      case "ctrl+e":
        this.editor.move("line-end");
        return true;
      case "ctrl+k":
        this.editor.kill("line-end");
        return true;
      case "ctrl+u":
        this.editor.kill("line-start");
        return true;
      case "ctrl+w":
        this.editor.kill("word-left");
        return true;
      case "ctrl+z":
        this.editor.undo();
        return true;
      default:
        if (event.text && !event.ctrl && !event.alt && !event.meta) this.editor.insert(event.text);
        return true;
    }
  }

  /** Text pasted while the pane is open goes in as text, however long it is. */
  handlePaste(text: string): void {
    if (this.open) this.editor.insert(text);
  }

  /** Rows for the whole screen. */
  render(width: number, height: number): string[] {
    const inner = Math.max(8, width);
    const head = defaultTheme.bold(truncateToWidth(`  ${this.title}`, inner));
    const foot = defaultTheme.dim(
      truncateToWidth("  esc discard  ·  ctrl+s keep  ·  enter newline", inner),
    );
    const bodyHeight = Math.max(1, height - 3);
    const body = this.editor.render(inner - 2).slice(0, bodyHeight);
    const rows = [head, "", ...body.map((row) => `  ${row}`)];
    while (rows.length < height - 1) rows.push("");
    rows.push(foot);
    return rows.map((row) => padToWidth(row, inner));
  }

  private finish(result: DraftPaneResult): void {
    this.open = false;
    const onClose = this.onClose;
    this.onClose = undefined;
    onClose?.(result);
  }
}
