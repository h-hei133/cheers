import { describe, it, expect, beforeEach } from "vitest";
import { Editor } from "./editor.js";

describe("Multiline Editor Engine", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor();
  });

  it("handles basic text insertion and cursor movement", () => {
    editor.insert("console.log('hello');");
    expect(editor.getText()).toBe("console.log('hello');");

    const offset = editor.getCursorOffset();
    expect(offset.col).toBe(21);
    expect(offset.line).toBe(0);
  });

  it("supports Emacs kill-ring and yank semantics", () => {
    editor.insert("line to be killed");
    editor.moveToHome();
    editor.moveRight();
    editor.moveRight();
    editor.moveRight();
    editor.moveRight(); // After "line"

    editor.killToEndOfLine();
    expect(editor.getText()).toBe("line");

    editor.moveToEnd();
    editor.insert(" - appended");
    editor.yank();
    expect(editor.getText()).toContain(" to be killed");
  });

  it("handles 100-level undo stack correctly", () => {
    editor.insert("step 1");
    editor.insert(" step 2");
    expect(editor.getText()).toBe("step 1 step 2");

    const undone = editor.undo();
    expect(undone).toBe(true);
    expect(editor.getText()).toBe("step 1");
  });
});
