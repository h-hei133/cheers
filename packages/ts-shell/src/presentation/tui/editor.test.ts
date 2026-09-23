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

describe("atomic tokens", () => {
  function editorWithTokens(): Editor {
    const editor = new Editor();
    editor.atomicTokenStart = (line, column) => {
      const before = line.slice(0, column);
      const match = /⎘ #\d+$/.exec(before);
      return match ? column - match[0].length : undefined;
    };
    return editor;
  }

  it("deletes a whole token with one backspace at its end", () => {
    const editor = editorWithTokens();
    editor.insert("fix ⎘ #1 now");
    for (let index = 0; index < " now".length; index++) editor.move("left");
    editor.backspace();
    expect(editor.getText()).toBe("fix  now");
  });

  it("deletes forward through a token in one press", () => {
    const editor = editorWithTokens();
    editor.insert("fix ⎘ #1 now");
    editor.move("line-start");
    editor.move("right");
    editor.move("right");
    editor.move("right");
    editor.move("right");
    editor.deleteForward();
    expect(editor.getText()).toBe("fix  now");
  });

  it("keeps a plain backspace one cluster when no token ends there", () => {
    const editor = editorWithTokens();
    editor.insert("hello");
    editor.backspace();
    expect(editor.getText()).toBe("hell");
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

  it("takes back an undo", () => {
    // An undo that cannot be undone is a key that is dangerous to press: the way
    // back from a mistake becomes a mistake with no way back.
    const editor = new Editor();
    editor.insert("abc");
    editor.undo();

    expect(editor.redo()).toBe(true);
    expect(editor.getText()).toBe("abc");
  });

  it("reports that there is nothing to redo", () => {
    const editor = new Editor();
    expect(editor.redo()).toBe(false);
  });

  it("drops the redo branch once the text moves on", () => {
    // A new edit is a new branch, so redoing into the old one would jump
    // somewhere the text never was.
    const editor = new Editor();
    editor.insert("abc");
    editor.undo();
    editor.insert("xyz");

    expect(editor.redo()).toBe(false);
    expect(editor.getText()).toBe("xyz");
  });

  it("walks back through the kill ring on repeated yank-pop", () => {
    // Without this a yank only ever reaches the most recent cut, and the ones
    // before it are unreachable however many times the key is pressed.
    // Each cut starts from a fresh caret position, which is what makes them
    // separate ring entries rather than one continued entry.
    const editor = new Editor();
    editor.insert("first");
    editor.move("line-start");
    editor.kill("line-end");
    editor.insert("second");
    editor.move("line-start");
    editor.kill("line-end");

    editor.insert(" ");
    editor.yank();
    expect(editor.getText()).toBe(" second");

    // The earlier cut replaces the yank rather than being appended to it.
    editor.yankPop();
    expect(editor.getText()).toBe(" first");
  });

  it("starts the walk over once it reaches the oldest cut", () => {
    const editor = new Editor();
    editor.insert("first");
    editor.move("line-start");
    editor.kill("line-end");
    editor.insert("second");
    editor.move("line-start");
    editor.kill("line-end");

    editor.insert(" ");
    editor.yank();
    editor.yankPop();
    // Two entries, so the next pop returns to the newest rather than stopping.
    editor.yankPop();
    expect(editor.getText()).toBe(" second");
  });

  it("reports that there is nothing to yank-pop to", () => {
    const editor = new Editor();
    editor.insert("alpha");
    editor.kill("word-left");
    editor.yank();

    // One entry in the ring: there is no earlier cut to walk to.
    expect(editor.yankPop()).toBe(false);
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

  it("starts a new entry when the caret moved away and came back", () => {
    // Coalescing used to be decided by where the caret sat, so leaving the spot
    // and returning to it counted as "nothing happened" and the second cut was
    // merged into the first. The two are separate passages and a yank should
    // bring back only the one last cut.
    const editor = new Editor();
    editor.insert("one two");
    editor.kill("word-left");
    editor.move("line-start");
    editor.move("line-end");
    editor.kill("word-left");
    expect(editor.getText()).toBe("");
    editor.yank();
    expect(editor.getText()).toBe("one ");
  });

  it("starts a new entry after a cursor motion, so the earlier cut is not reachable", () => {
    // Two cuts with a motion between them are two entries. Before, the check was
    // "is the caret where the last cut ended", and a motion that returned to that
    // spot made the second cut append to the first.
    const editor = new Editor();
    editor.insert("alpha beta");
    editor.kill("word-left");
    editor.move("line-start");
    editor.move("line-end");
    editor.kill("word-left");
    expect(editor.getText()).toBe("");
    editor.yank();
    // Only the last cut comes back; were they merged this would be "alpha beta".
    expect(editor.getText()).toBe("alpha ");
  });

  it("merges the same two cuts when nothing happens between them", () => {
    // A cut that runs to the end of the row makes the next one start where the
    // last finished, so they are one passage: pressing the key twice extends the
    // same entry, and one yank puts the whole run back.
    const editor = new Editor();
    editor.insert("abcdef");
    editor.move("line-start");
    editor.move("right");
    editor.move("right");
    editor.move("right");
    editor.kill("line-end");
    editor.kill("line-end");
    editor.yank();

    expect(editor.getText()).toBe("abcdef");
  });

  it("refuses to yank-pop once something else has happened", () => {
    // A yank-pop rewrites the text the yank inserted. After an edit that text is
    // part of the draft, so replacing it would throw away what the user typed.
    const editor = new Editor();
    editor.insert("first");
    editor.kill("line-start");
    editor.insert("second");
    editor.move("line-start");
    editor.kill("line-end");
    editor.yank();
    editor.insert("typed");
    expect(editor.yankPop()).toBe(false);
    expect(editor.getText()).toContain("typed");
  });

  it("takes the row break when cutting to the end of a full row", () => {
    // At the end of a row there is no character left, so the break is what goes:
    // the press joined the rows instead of doing nothing.
    const editor = new Editor();
    editor.insert("first\nsecond");
    editor.move("up");
    editor.move("line-end");
    editor.kill("line-end");
    expect(editor.getText()).toBe("firstsecond");
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

  it("marks recalled entries as browsing until edited", () => {
    const editor = new Editor();
    editor.pushHistory("first");
    editor.insert("draft");
    editor.recall(-1);
    expect(editor.browsingHistory).toBe(true);
    editor.insert("!");
    expect(editor.browsingHistory).toBe(false);
    expect(editor.getText()).toBe("first!");
  });

  it("snaps vertical moves to grapheme boundaries", () => {
    const editor = new Editor();
    editor.setText("AB\uD83D\uDE00CD\nxyz");
    editor.move("up");
    editor.move("down");
    expect(editor.getText()).toBe("AB\uD83D\uDE00CD\nxyz");
  });

  it("jumps to document edges", () => {
    const editor = new Editor();
    editor.setText("one\ntwo\nthree");
    editor.move("doc-start");
    editor.move("right");
    editor.move("doc-end");
    expect(editor.getText()).toBe("one\ntwo\nthree");
  });
});

describe("vertical scrolling and height bounds", () => {
  it("bounds output rows to maxRows when text exceeds budget", () => {
    const editor = new Editor();
    editor.setText(Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n"));
    const rows = editor.render(40, 5);
    expect(rows).toHaveLength(5);
  });

  it("keeps the cursor line in the visible slice when scrolling", () => {
    const editor = new Editor();
    editor.setText(Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n"));
    // Move cursor to line 0
    for (let i = 0; i < 20; i++) editor.move("up");
    const topRows = editor.render(40, 5);
    expect(topRows[0]).toContain("line 0");
    expect(topRows.join("\n")).toContain(CURSOR_MARKER);

    // Move cursor to bottom
    for (let i = 0; i < 20; i++) editor.move("down");
    const bottomRows = editor.render(40, 5);
    expect(stripAnsi(bottomRows[4]!)).toContain("line 19");
    expect(bottomRows.join("\n")).toContain(CURSOR_MARKER);
  });

  it("tracks cursor line when scrolling even while unfocused", () => {
    const editor = new Editor();
    editor.focused = false;
    editor.setText(Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n"));
    const bottomRows = editor.render(40, 5);
    expect(bottomRows).toHaveLength(5);
    expect(bottomRows[4]).toContain("line 19");
    expect(bottomRows.join("\n")).not.toContain(CURSOR_MARKER);
  });
});
