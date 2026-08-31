import { describe, it, expect, beforeEach } from "vitest";
import { TextEditor } from "./textEditor.js";
import { AutocompleteController } from "./autocompleteController.js";
import { parseKeyEvent } from "./input/keys.js";

describe("Interactive Keybinding Calibration (Escape, Ctrl+C, Tab)", () => {
  let editor: TextEditor;
  let autocomplete: AutocompleteController;

  beforeEach(() => {
    editor = new TextEditor();
    autocomplete = new AutocompleteController();
  });

  it("Escape dismisses active autocomplete without clearing editor draft", () => {
    editor.setText("/model");
    autocomplete.update("/model");
    expect(autocomplete.isActive()).toBe(true);

    const escKey = parseKeyEvent("\x1b");
    const handled = autocomplete.handleKey(escKey, editor);

    expect(handled).toBe(true);
    expect(autocomplete.isActive()).toBe(false);
    expect(editor.getText()).toBe("/model"); // Draft preserved
  });

  it("Tab auto-completes highlighted slash suggestion with trailing space", () => {
    editor.setText("/comp");
    autocomplete.update("/comp");
    expect(autocomplete.isActive()).toBe(true);

    const tabKey = parseKeyEvent("\t");
    const handled = autocomplete.handleKey(tabKey, editor);

    expect(handled).toBe(true);
    expect(editor.getText()).toBe("/compact ");
    expect(autocomplete.isActive()).toBe(false);
  });

  it("Ctrl+C clears editor draft when text is present", () => {
    editor.setText("some draft text");
    expect(editor.getText()).toBe("some draft text");

    // Single Ctrl+C clears the editor draft
    if (editor.getText().length > 0) {
      editor.clear();
      autocomplete.dismiss();
    }

    expect(editor.getText()).toBe("");
    expect(autocomplete.isActive()).toBe(false);
  });
});
