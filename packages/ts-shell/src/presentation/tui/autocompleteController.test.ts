import { describe, it, expect, beforeEach } from "vitest";
import { AutocompleteController } from "./autocompleteController.js";
import { TextEditor } from "./textEditor.js";
import { parseKeyEvent } from "./input/keys.js";

describe("AutocompleteController Lifecycle", () => {
  let controller: AutocompleteController;
  let editor: TextEditor;

  beforeEach(() => {
    controller = new AutocompleteController();
    editor = new TextEditor();
  });

  it("activates when editor contains slash command prefix", () => {
    controller.update("/mo");
    expect(controller.isActive()).toBe(true);
    expect(controller.getSelectedSuggestion()?.name).toBe("/model");
  });

  it("navigates down and up through suggestions with arrow keys", () => {
    controller.update("/c");
    expect(controller.isActive()).toBe(true);

    const first = controller.getSelectedSuggestion()?.name;
    const downKey = parseKeyEvent("\x1b[B"); // Arrow Down
    const consumed = controller.handleKey(downKey, editor);

    expect(consumed).toBe(true);
    expect(controller.getSelectedSuggestion()?.name).not.toBe(first);
  });

  it("completes selected command into editor upon Tab or Enter", () => {
    controller.update("/hel");
    const tabKey = parseKeyEvent("\t");
    const consumed = controller.handleKey(tabKey, editor);

    expect(consumed).toBe(true);
    expect(editor.getText()).toBe("/help ");
    expect(controller.isActive()).toBe(false);
  });

  it("dismisses popup upon Escape without modifying editor", () => {
    editor.setText("/hel");
    controller.update("/hel");
    const escKey = parseKeyEvent("\x1b");
    const consumed = controller.handleKey(escKey, editor);

    expect(consumed).toBe(true);
    expect(controller.isActive()).toBe(false);
    expect(editor.getText()).toBe("/hel");
  });
});
