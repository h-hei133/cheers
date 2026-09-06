import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendPromptHistory, loadPromptHistory } from "./historyStore.js";
import { Editor } from "../../presentation/tui/editor.js";

describe("prompt history persistence", () => {
  const tmpDir = path.join(os.tmpdir(), "history-store-test-" + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("loads empty history when no file exists", () => {
    expect(loadPromptHistory(tmpDir)).toEqual([]);
  });

  it("appends and loads prompt history across restarts", () => {
    appendPromptHistory(tmpDir, "git status");
    appendPromptHistory(tmpDir, "npm test");
    appendPromptHistory(tmpDir, "show me the diff");

    const loaded = loadPromptHistory(tmpDir);
    expect(loaded).toEqual(["git status", "npm test", "show me the diff"]);

    const editor = new Editor();
    editor.loadHistory(loaded);
    expect(editor.recall(-1)).toBe(true);
    expect(editor.getText()).toBe("show me the diff");
    expect(editor.recall(-1)).toBe(true);
    expect(editor.getText()).toBe("npm test");
    expect(editor.recall(-1)).toBe(true);
    expect(editor.getText()).toBe("git status");
  });
});
