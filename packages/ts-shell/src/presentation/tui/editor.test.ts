import { describe, expect, it } from "vitest";
import { Editor } from "./editor.js";
import { CURSOR_MARKER } from "./render/paint.js";
import { stripAnsi } from "./text/ansi.js";

/** Render with the cursor marker made visible as a pipe. */
function shown(editor: Editor, width: number): string[] {
  return editor.render(width).map((row) => row.split(CURSOR_MARKER).join("|"));
}

describe("text entry", () => {
  it("inserts at the caret and marks the caret position", () => {
    const editor = new Editor();
    editor.insert("hello");
    expect(editor.getText()).toBe("hello");
    expect(shown(editor, 20)).toEqual(["hello|"]);
  });

  it("expands tabs so the caret column stays truthful", () => {
    const editor = new Editor();
    editor.insert("a\tb");
    expect(editor.getText()).toBe("a  b");
  });

  it("shows a dimmed placeholder for an empty prompt", () => {
    // Dim, because the hint is not the user's text and should not read like it.
    const editor = new Editor();
    editor.placeholder = "Ask anything";
    const rendered = shown(editor, 20)[0]!;
    expect(stripAnsi(rendered)).toBe("|Ask anything");
    expect(rendered).toContain("\x1b[2");
  });

  it("omits the caret marker when it does not hold focus", () => {
    const editor = new Editor();
    editor.focused = false;
    editor.insert("x");
    expect(editor.render(20)).toEqual(["x"]);
  });
});

describe("caret motion by grapheme cluster", () => {
  it("steps over a wide character as one stop", () => {
    const editor = new Editor();
    editor.insert("你好");
    editor.move("left");
    expect(shown(editor, 20)).toEqual(["你|好"]);
  });

  it("steps over an astral character as one stop", () => {
    const editor = new Editor();
    editor.insert("a🚀b");
    editor.move("left");
    editor.move("left");
    expect(shown(editor, 20)).toEqual(["a|🚀b"]);
  });

  it("deletes a whole cluster, never half a surrogate pair", () => {
    const editor = new Editor();
    editor.insert("a🚀b");
    editor.move("line-end");
    editor.backspace();
    editor.backspace();
    expect(editor.getText()).toBe("a");
  });

  it("moves by word in both directions", () => {
    const editor = new Editor();
    editor.insert("alpha beta gamma");
    editor.move("word-left");
    expect(editor.getText().slice(0, 11)).toBe("alpha beta ");
    editor.move("word-left");
    editor.move("word-right");
    expect(editor.move("line-end")).toBe(true);
  });
});

describe("multi-line prompts", () => {
  it("splits at the caret and navigates between rows", () => {
    const editor = new Editor();
    editor.insert("line1");
    editor.newline();
    editor.insert("line2");
    expect(editor.getText()).toBe("line1\nline2");
    expect(shown(editor, 20)).toEqual(["line1", "line2|"]);
    editor.move("up");
    expect(shown(editor, 20)).toEqual(["line1|", "line2"]);
  });

  it("joins rows when backspacing at the start of one", () => {
    const editor = new Editor();
    editor.insert("ab");
    editor.newline();
    editor.backspace();
    expect(editor.getText()).toBe("ab");
  });

  it("inserts pasted newlines as real rows", () => {
    const editor = new Editor();
    editor.insert("one\ntwo\nthree");
    expect(editor.render(40)).toHaveLength(3);
  });
});

describe("soft wrapping", () => {
  it("wraps a long row and keeps the caret on the row that holds it", () => {
    const editor = new Editor();
    editor.insert("abcdefghij");
    expect(shown(editor, 4)).toEqual(["abcd", "efgh", "ij|"]);
  });

  it("wraps wide text without splitting a cluster", () => {
    const editor = new Editor();
    editor.insert("你好世界你好");
    editor.move("line-end");
    expect(shown(editor, 5)).toEqual(["你好", "世界", "你好|"]);
  });
});

describe("kill ring and undo", () => {
  it("cuts and restores the previous word", () => {
    const editor = new Editor();
    editor.insert("hello world");
    editor.kill("word-left");
    expect(editor.getText()).toBe("hello ");
    editor.yank();
    expect(editor.getText()).toBe("hello world");
  });

  it("cuts to the end and to the start of a row", () => {
    const editor = new Editor();
    editor.insert("hello");
    editor.move("line-start");
    editor.kill("line-end");
    expect(editor.getText()).toBe("");
  });

  it("restores the prior state", () => {
    const editor = new Editor();
    editor.insert("abc");
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("");
  });
});

describe("cutting back through a multi-line draft", () => {
  it("takes the row break once the row in front of the caret is empty", () => {
    const editor = new Editor();
    editor.insert("first\nsecond");
    editor.kill("line-start");
    expect(editor.getText()).toBe("first\n");

    // Nothing left in front of the caret on this row, so the row break is what
    // goes — the press that used to do nothing and force a manual move up.
    editor.kill("line-start");
    expect(editor.getText()).toBe("first");

    // The caret landed at the end of the row it merged into, so the next thing
    // typed continues that row instead of appearing at its start.
    editor.insert("!");
    expect(editor.getText()).toBe("first!");
  });

  it("keeps going until the whole draft in front of the caret is gone", () => {
    const editor = new Editor();
    editor.insert("one\ntwo\nthree");
    for (let press = 0; press < 5; press++) editor.kill("line-start");
    expect(editor.getText()).toBe("");
  });

  it("yanks a run of cuts back as one piece, in the order it was written", () => {
    const editor = new Editor();
    editor.insert("one\ntwo");
    editor.kill("line-start");
    editor.kill("line-start");
    editor.kill("line-start");
    expect(editor.getText()).toBe("");
    editor.yank();
    expect(editor.getText()).toBe("one\ntwo");
  });

  it("starts a new entry when something happened between two cuts", () => {
    const editor = new Editor();
    editor.insert("alpha beta");
    editor.kill("line-start");
    editor.insert("gamma");
    editor.kill("line-start");
    editor.yank();
    expect(editor.getText()).toBe("gamma");
  });

  it("stops at the top of the draft rather than reporting a cut it did not make", () => {
    const editor = new Editor();
    editor.insert("only");
    editor.move("line-start");
    editor.kill("line-start");
    expect(editor.getText()).toBe("only");
  });
});

describe("prompt recall", () => {
  it("walks back through history and restores the stashed draft", () => {
    const editor = new Editor();
    editor.pushHistory("first");
    editor.pushHistory("second");
    editor.insert("draft");
    editor.recall(-1);
    expect(editor.getText()).toBe("second");
    editor.recall(-1);
    expect(editor.getText()).toBe("first");
    editor.recall(1);
    expect(editor.getText()).toBe("second");
    editor.recall(1);
    expect(editor.getText()).toBe("draft");
  });

  it("ignores duplicate consecutive submissions", () => {
    const editor = new Editor();
    editor.pushHistory("same");
    editor.pushHistory("same");
    editor.recall(-1);
    expect(editor.recall(-1)).toBe(false);
  });
});
