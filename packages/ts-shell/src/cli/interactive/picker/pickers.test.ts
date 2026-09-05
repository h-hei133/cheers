import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionPicker } from "./connections.js";
import { copyPicker } from "./copy.js";
import { restorePicker } from "./restore.js";
import { sourcePicker } from "./sources.js";
import { opensPicker } from "./registry.js";
import { sessionPicker } from "./session.js";
import type { SessionManager } from "../../../session/SessionManager.js";
import { Transcript } from "../../../presentation/tui/transcript/container.js";
import { textBlock } from "../../../presentation/tui/transcript/blocks.js";

const CONTEXT = { cwd: "/workspace", sessionId: "sess_test" };

describe("which commands open a chooser", () => {
  it.each(["/resume", "/mcp", "/connect", "/restore", "/marketplace", "/plugin", "/copy"])(
    "opens one for a bare %s",
    (command) => {
      expect(opensPicker(command)).toBe(true);
    },
  );

  it("leaves a command with arguments to run as typed", () => {
    expect(opensPicker("/restore execute --all")).toBe(false);
    expect(opensPicker("/resume sess_abc")).toBe(false);
  });

  it("claims nothing that is not a command", () => {
    expect(opensPicker("restore")).toBe(false);
    expect(opensPicker("what does /restore do?")).toBe(false);
  });
});

describe("copy chooser", () => {
  function transcriptWith(...texts: string[]): Transcript {
    const transcript = new Transcript();
    for (const text of texts) transcript.append(textBlock("assistant", text));
    return transcript;
  }

  it("lists the newest block first and skips empty ones", async () => {
    const picker = copyPicker(transcriptWith("older answer", "   ", "newer answer"), CONTEXT);

    const details = (await picker.load()).map((option) => option.detail);
    expect(details).toEqual(["newer answer", "older answer"]);
  });

  it("has nothing to offer for an empty transcript", async () => {
    expect(await copyPicker(new Transcript(), CONTEXT).load()).toEqual([]);
  });
});

describe("connection chooser", () => {
  it("drafts the login command rather than collecting a secret", async () => {
    const picker = connectionPicker(CONTEXT);
    const options = await picker.load();
    const login = options.find((option) => option.id.startsWith("login:"));

    const outcome = await picker.apply([login!.id]);
    expect(outcome?.draft).toMatch(/^\/connect login \S+ --api-key $/);
    expect(outcome?.note).toBeUndefined();
  });

  it("offers every provider it knows how to reach", async () => {
    const options = await connectionPicker(CONTEXT).load();

    expect(options.length).toBeGreaterThan(1);
  });
});

describe("source chooser", () => {
  it("drafts an add rather than asking for a URL in the list", async () => {
    const picker = sourcePicker(CONTEXT);

    expect(await picker.apply(["add"])).toEqual({ draft: "/marketplace add " });
  });

  it("keeps the default source registered", async () => {
    const picker = sourcePicker(CONTEXT);
    const outcome = await picker.apply(["official"]);

    expect(outcome?.note).toContain("stays registered");
  });
});

describe("restore chooser", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "restore-picker-"));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  function seed(options: {
    readonly authorityId: string;
    readonly recordId: string;
    readonly relativePath: string;
    readonly createdAt: string;
  }): void {
    const namespace = path.join(
      workspace,
      ".sisyphus",
      "edit-snapshots",
      options.authorityId,
    );
    fs.mkdirSync(path.join(namespace, "records"), { recursive: true });
    fs.mkdirSync(path.join(namespace, "content"), { recursive: true });
    fs.writeFileSync(path.join(namespace, "content", `${options.recordId}.txt`), "before", "utf8");
    fs.writeFileSync(
      path.join(namespace, "records", `${options.recordId}.json`),
      JSON.stringify({
        schemaVersion: 1,
        authorityId: options.authorityId,
        recordId: options.recordId,
        workspaceRelativePath: options.relativePath,
        operationKind: "replace",
        beforeState: "exists",
        beforeContentHash: "abc",
        beforeContentSizeBytes: 6,
        beforeContentRef: path.join("content", `${options.recordId}.txt`),
        expectedCurrentState: "unknown",
        capturedAtPhase: "pre-write",
        persistence: "non-default",
        createdAt: options.createdAt,
        evidence: [],
      }),
      "utf8",
    );
  }

  it("has nothing to offer for a project with no snapshots", async () => {
    expect(await restorePicker(workspace).load()).toEqual([]);
  });

  it("lists a recorded snapshot by the path it would overwrite", async () => {
    seed({
      authorityId: "edit-one",
      recordId: "record-a",
      relativePath: "src/a.ts",
      createdAt: new Date().toISOString(),
    });

    const options = await restorePicker(workspace).load();

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ id: "record-a", label: "src/a.ts", note: "restorable" });
  });

  it("shows the newest snapshot first", async () => {
    seed({
      authorityId: "edit-one",
      recordId: "older",
      relativePath: "src/old.ts",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    seed({
      authorityId: "edit-two",
      recordId: "newer",
      relativePath: "src/new.ts",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

    const options = await restorePicker(workspace).load();

    expect(options.map((option) => option.id)).toEqual(["newer", "older"]);
  });

  it("never restores: it hands back the preview command with the choice in it", async () => {
    seed({
      authorityId: "edit-one",
      recordId: "record-a",
      relativePath: "src/a.ts",
      createdAt: new Date().toISOString(),
    });
    const picker = restorePicker(workspace);
    await picker.load();

    const outcome = await picker.apply(["record-a"]);

    expect(outcome?.draft).toContain("/restore preview");
    expect(outcome?.draft).toContain("--authority edit-one");
    expect(outcome?.draft).toContain("--records record-a");
    expect(outcome?.note).toBeUndefined();
  });

  it("refuses to mix records from different edits in one restore", async () => {
    seed({
      authorityId: "edit-one",
      recordId: "record-a",
      relativePath: "src/a.ts",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    seed({
      authorityId: "edit-two",
      recordId: "record-b",
      relativePath: "src/b.ts",
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    const picker = restorePicker(workspace);
    await picker.load();

    const outcome = await picker.apply(["record-a", "record-b"]);

    expect(outcome?.note).toContain("different edits");
    expect(outcome?.draft).toBeUndefined();
  });

  it("says plainly when nothing was selected", async () => {
    const picker = restorePicker(workspace);
    await picker.load();

    expect((await picker.apply([]))?.note).toContain("nothing will be restored");
  });
});

describe("session chooser", () => {
  const manager = {
    listRecentSessions: () => [
      {
        id: "sess_abc12345",
        title: "Fix login flow",
        status: "interrupted",
        turns: [{ role: "user", content: "fix login" }],
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: "sess_def67890",
        status: "completed",
        turns: [],
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
  } as unknown as SessionManager;

  it("labels entries by title, never exposing raw session id", async () => {
    const picker = sessionPicker({
      sessionManager: manager,
      resume: async () => undefined,
      delete: async () => undefined,
      rename: async () => undefined,
    });
    const options = await picker.load();
    expect(options[0]!.label).toBe("Fix login flow");
    expect(options[1]!.label).toBe("New session");
    expect(options[1]!.detail).toContain("sess_def");
  });

  it("declares delete and rename handlers", () => {
    const picker = sessionPicker({
      sessionManager: manager,
      resume: async () => undefined,
      delete: async () => "deleted",
      rename: async () => "renamed",
    });
    expect(typeof picker.onDelete).toBe("function");
    expect(typeof picker.onRename).toBe("function");
  });
});
