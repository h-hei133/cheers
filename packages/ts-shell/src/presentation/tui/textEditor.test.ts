import { describe, it, expect, beforeEach } from "vitest";
import { TextEditor } from "./textEditor.js";

describe("TextEditor State Machine", () => {
  let editor: TextEditor;

  beforeEach(() => {
    editor = new TextEditor();
  });

  it("inserts text and advances cursor accurately", () => {
    editor.insertText("hello");
    expect(editor.getText()).toBe("hello");
    expect(editor.getState().cursorCol).toBe(5);

    editor.insertText(" world");
    expect(editor.getText()).toBe("hello world");
    expect(editor.getState().cursorCol).toBe(11);
  });

  it("handles backspace and delete within a line", () => {
    editor.insertText("abcd");
    editor.backspace();
    expect(editor.getText()).toBe("abc");

    editor.moveLeft(); // Cursor on 'c'
    editor.delete();
    expect(editor.getText()).toBe("ab");
  });

  it("handles word-level left/right jumps", () => {
    editor.insertText("first second third");
    editor.moveWordLeft();
    expect(editor.getState().cursorCol).toBe(13); // Start of 'third'

    editor.moveWordLeft();
    expect(editor.getState().cursorCol).toBe(6); // Start of 'second'

    editor.moveWordRight();
    expect(editor.getState().cursorCol).toBe(13); // End of 'second' / start of 'third'
  });

  it("renders lines with inverted cursor block", () => {
    editor.insertText("abc");
    editor.moveLeft(); // Cursor on 'c'
    const rendered = editor.renderWithCursor();

    expect(rendered.length).toBe(1);
    expect(rendered[0]).toContain("\x1b[7mc\x1b[0m");
  });
});
