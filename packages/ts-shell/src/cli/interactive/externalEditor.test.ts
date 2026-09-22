import fs from "node:fs";
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
