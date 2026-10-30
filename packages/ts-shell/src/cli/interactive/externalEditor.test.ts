import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { editExternally, resolveEditor, splitEditorCommand } from "./externalEditor.js";

/**
 * The external editor.
 *
 * The failure that matters is not the editor failing — it is the editor failing
 * and leaving the terminal in raw mode, which strands the session with no visible
 * prompt. So the terminal release is asserted on every path, including the ones
 * where nothing else works.
 */
describe("external editor", () => {
  /** A stand-in that records whether the terminal was released and restored. */
  function tracker(): { suspendTerminal: <T>(run: () => T) => T; depth: () => number } {
    let depth = 0;
    return {
      depth: () => depth,
      suspendTerminal: <T,>(run: () => T): T => {
        depth += 1;
        try {
          return run();
        } finally {
          depth -= 1;
        }
      },
    };
  }

  describe("choosing the editor", () => {
    it("reads the preference in the order a person expects", () => {
      expect(resolveEditor({ CHEERS_EDITOR: "a", VISUAL: "b", EDITOR: "c" })).toBe("a");
      expect(resolveEditor({ VISUAL: "b", EDITOR: "c" })).toBe("b");
      expect(resolveEditor({ EDITOR: "c" })).toBe("c");
    });

    it("skips a blank value rather than failing on it", () => {
      expect(resolveEditor({ VISUAL: "   ", EDITOR: "c" })).toBe("c");
    });

    it("names a fallback rather than leaving nothing", () => {
      expect(resolveEditor({})).toBe(process.platform === "win32" ? "notepad" : "nano");
    });
  });

  describe("splitting the command", () => {
    it("separates the program from its arguments", () => {
      // `$EDITOR` is a command line, not a path: `code --wait` and `vim -u NONE`
      // are both entirely valid values.
      expect(splitEditorCommand("code --wait")).toEqual({ program: "code", args: ["--wait"] });
      expect(splitEditorCommand("vim -u NONE")).toEqual({ program: "vim", args: ["-u", "NONE"] });
      expect(splitEditorCommand("nano")).toEqual({ program: "nano", args: [] });
    });

    it("tolerates extra whitespace", () => {
      expect(splitEditorCommand("  code   --wait  ")).toEqual({ program: "code", args: ["--wait"] });
    });

    it("keeps a quoted program path whole", () => {
      // An editor whose path contains a space is written quoted, and splitting on
      // whitespace alone would take the opening quote as part of the program name
      // and fail to find an editor that is installed.
      expect(splitEditorCommand('"/Applications/Sublime Text.app/bin/subl" -w')).toEqual({
        program: "/Applications/Sublime Text.app/bin/subl",
        args: ["-w"],
      });
      expect(splitEditorCommand("'/opt/my editor/bin/edit' --wait")).toEqual({
        program: "/opt/my editor/bin/edit",
        args: ["--wait"],
      });
    });

    it("keeps quoted arguments whole, including empty ones", () => {
      expect(splitEditorCommand('code --user-data-dir="/tmp/a b"')).toEqual({
        program: "code",
        args: ['--user-data-dir=/tmp/a b'],
      });
      expect(splitEditorCommand('code ""')).toEqual({ program: "code", args: [""] });
    });

    it("takes an unterminated quote as ending at the end of the line", () => {
      // The value was written by hand; a stray quote is more likely than an
      // argument that means nothing.
      expect(splitEditorCommand('"/opt/my editor/edit -w')).toEqual({
        program: "/opt/my editor/edit -w",
        args: [],
      });
    });
  });

  describe("running it", () => {
    it("returns the edited text", () => {
      const terminal = tracker();
      const result = editExternally({
        text: "original",
        suspendTerminal: terminal.suspendTerminal,
        env: { EDITOR: "sed -i s/original/edited/" },
      });

      expect(result.text).toBe("edited");
      expect(terminal.depth()).toBe(0);
    });

    it("strips one trailing newline, which editors add on save", () => {
      const terminal = tracker();
      const result = editExternally({
        text: "original",
        suspendTerminal: terminal.suspendTerminal,
        env: { EDITOR: "sed -i s/original/edited/" },
      });

      expect(result.text?.endsWith("\n")).toBe(false);
    });

    it.each([
      { name: 'CRLF save', original: 'original', saved: 'edited\r\n', expected: 'edited' },
      { name: 'bare CR save', original: 'original', saved: 'edited\r', expected: 'edited' },
      { name: 'extra blank line', original: 'original', saved: 'edited\r\n\r\n', expected: 'edited\n' },
      { name: 'mixed line endings and tab', original: 'original', saved: 'first\r\n\tsecond\rthird\r\n', expected: 'first\n\tsecond\nthird' },
      { name: 'only line ending changed', original: 'original\n', saved: 'original\r\n', expected: undefined },
    ])('handles the logical newline in a $name without adding an empty draft line', ({ original, saved, expected }) => {
      const terminal = tracker();
      const temporaryRoot = path.resolve('../../.tmp');
      fs.mkdirSync(temporaryRoot, { recursive: true });
      const directory = fs.mkdtempSync(path.join(temporaryRoot, 'external-editor-'));
      const editor = path.join(directory, 'edit.mjs');
      try {
        fs.writeFileSync(editor, `import fs from 'node:fs'; fs.writeFileSync(process.argv[2], ${JSON.stringify(saved)});`);
        const result = editExternally({ text: original, suspendTerminal: terminal.suspendTerminal,
          env: { EDITOR: `rtk proxy node ${editor}` } });
        expect(result.text).toBe(expected);
        if (expected === undefined) expect(result.message).toContain('No changes');
        expect(terminal.depth()).toBe(0);
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });

    it("reports an unchanged save instead of rewriting the draft", () => {
      const terminal = tracker();
      const result = editExternally({
        text: "original",
        suspendTerminal: terminal.suspendTerminal,
        env: { EDITOR: "true" },
      });

      expect(result.text).toBeUndefined();
      expect(result.message).toContain("No changes");
    });

    it("keeps the draft when the editor fails, and still restores the terminal", () => {
      const terminal = tracker();
      const result = editExternally({
        text: "original",
        suspendTerminal: terminal.suspendTerminal,
        env: { EDITOR: "false" },
      });

      expect(result.text).toBeUndefined();
      expect(result.message).toContain("status 1");
      expect(terminal.depth()).toBe(0);
    });

    it("reports a missing editor rather than throwing", () => {
      const terminal = tracker();
      const result = editExternally({
        text: "original",
        suspendTerminal: terminal.suspendTerminal,
        env: { EDITOR: "definitely-not-a-real-editor-xyz" },
      });

      expect(result.text).toBeUndefined();
      expect(result.message).toContain("Could not run");
      expect(terminal.depth()).toBe(0);
    });

    it("propagates a failure of the terminal handoff, having cleaned up", () => {
      // The temporary file must not survive a handoff that never happened.
      const created: string[] = [];
      const spy = vi.spyOn(fs, "mkdtempSync").mockImplementation((prefix) => {
        const directory = `${String(prefix)}probe`;
        created.push(directory);
        fs.mkdirSync(directory, { recursive: true });
        return directory;
      });

      try {
        expect(() =>
          editExternally({
            text: "x",
            suspendTerminal: () => {
              throw new Error("terminal exploded");
            },
            env: { EDITOR: "true" },
          }),
        ).toThrow("terminal exploded");
      } finally {
        spy.mockRestore();
      }

      expect(created.length).toBeGreaterThan(0);
      expect(created.every((directory) => !fs.existsSync(directory))).toBe(true);
    });

    it("reports a vanished draft instead of throwing", () => {
      // An editor that renames what it saves, or a plugin that cleans up after
      // itself, exits successfully with nothing left to read. That is not a
      // failure of the editor, and it must not surface as an exception out of
      // here — the caller owns the draft and has no way to catch it.
      const terminal = tracker();
      const result = editExternally({
        text: "original",
        suspendTerminal: terminal.suspendTerminal,
        // Deletes the file it was given, then succeeds.
        env: { EDITOR: "sh -c 'rm -f \"$0\"' " },
      });

      expect(result.text).toBeUndefined();
      expect(result.message).toContain("unchanged");
      expect(terminal.depth()).toBe(0);
    });

    it("writes the draft where a later git status will not find it", () => {
      // A draft is not part of the project.
      let capturedDirectory = "";
      const spy = vi.spyOn(fs, "mkdtempSync").mockImplementation((prefix) => {
        capturedDirectory = `${String(prefix)}probe`;
        fs.mkdirSync(capturedDirectory, { recursive: true });
        return capturedDirectory;
      });

      try {
        editExternally({
          text: "draft",
          suspendTerminal: (run) => run(),
          env: { EDITOR: "true" },
        });
      } finally {
        spy.mockRestore();
      }

      expect(capturedDirectory).not.toContain(process.cwd());
    });
  });
});
