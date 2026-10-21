import { modelPicker } from "./model.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { getRuntimeConfig, getUserRuntimeConfigPath } from "../../../config/runtimeConfig.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionPicker } from "./connections.js";
import { copyPicker } from "./copy.js";
import { restorePicker } from "./restore.js";
import { sourcePicker } from "./sources.js";
import { approvalPicker } from "./approval.js";
import { opensPicker, pickerFor, type PickerHost } from "./registry.js";
import { Transcript } from "../../../presentation/tui/transcript/container.js";
import { textBlock } from "../../../presentation/tui/transcript/blocks.js";

const CONTEXT = { cwd: "/workspace", sessionId: "sess_test" };

describe("which commands open a chooser", () => {
  it.each(["/resume", "/pin", "/history", "/mcp", "/connect", "/restore", "/marketplace", "/plugin", "/copy"])(
    "opens one for a bare %s",
    (command) => {
      expect(opensPicker(command)).toBe(true);
    },
  );

  it("disables effort levels the selected model cannot honour", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-picker-"));
    try {
      const config = getRuntimeConfig(root);
      const context = { cwd: root, projectRoot: root, sessionId: "s", runtimeConfig: config,
        readConfiguration: () => ({ config, catalog: loadCatalog() }),
        resolveConfigTarget: () => ({ provider: "deepseek", model: "deepseek-reasoner" }) } as unknown as CommandContext;
      expect(opensPicker("/thinking")).toBe(true);
      const picker = pickerFor("/thinking", { commandContext: context } as unknown as PickerHost)!;
      const rows = await picker.load();
      expect(rows.map(row => row.id)).toEqual(["auto", "low", "medium", "high"]);
      expect(rows.filter(row => row.id !== "auto").every(row => row.disabled && row.note === "unsupported")).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("opens a read-only advisor inspector when state exists", async () => {
    const state = {
      schemaVersion: 1, sessionId: 's', sessionCreatedAt: '2026-01-01T00:00:00.000Z',
      workspace: { path: '/w', identity: 'i' }, epoch: 2, enabled: true, eligible: 1, captured: 1, status: 'reviewed',
      checkpoints: [{ id: 'checkpoint-1', timestamp: '2026-01-01T00:00:00.000Z', sourcePromptEntryId: 'entry-1', step: 3,
        willContinue: false, failed: false, digest: 'abc', text: 'captured text', truncated: false, frontier: '', goal: '' }],
      notes: [{ id: 'note-1', checkpointId: 'checkpoint-1', checkpointDigest: 'abc', epoch: 2, target: 'model/x',
        timestamp: '2026-01-01T00:00:00.000Z', text: 'advice', coverage: { checkpoints: [{ id: 'checkpoint-1', digest: 'abc' }], truncated: false } }],
    } as never;
    const host = { commandContext: CONTEXT, advisorState: () => state } as unknown as PickerHost;
    expect(opensPicker('/advisor')).toBe(true);
    expect(pickerFor('/advisor', { commandContext: CONTEXT } as unknown as PickerHost)).toBeUndefined();
    const picker = pickerFor('/advisor', host)!;
    const rows = await picker.load();
    expect(rows.map(row => row.id)).toEqual(['checkpoint:checkpoint-1', 'note:note-1']);
    expect(picker.detail?.('note:note-1')?.join('\n')).toContain('advice');
    expect((await picker.apply(['note:note-1']))?.note).toContain('Read-only');
  });

  it("opens the jobs hub only when a job composition exists", () => {
    expect(opensPicker('/hub')).toBe(true);
    const host = { commandContext: CONTEXT } as unknown as PickerHost;
    expect(pickerFor('/hub', host)).toBeUndefined();
    expect(pickerFor('/hub', { ...host, jobs: {} as never })).toBeDefined();
  });

  it.each(["/models", "/sessions", "/session", "/providers", "/plugins", "/skills", "/cp", "/approval-policy"])("opens the same chooser for synonymous %s", (command) => {
    expect(opensPicker(command)).toBe(true);
    expect(opensPicker(`${command} argument`)).toBe(false);
  });

  it.each(["/recall", "/retain"])("does not turn independent %s into a picker", (command) => {
    expect(opensPicker(command)).toBe(false);
  });

  it("constructs the same model chooser for its alias", async () => {
    const host = { commandContext: CONTEXT } as PickerHost;
    const canonical = pickerFor("/model", host)!;
    const alias = pickerFor("/models", host)!;
    expect(alias.title).toBe(canonical.title);
    expect(alias.form).toBe(canonical.form);
    expect(await alias.load()).toEqual(await canonical.load());
  });

  it("leaves a command with arguments to run as typed", () => {
    expect(opensPicker("/restore execute --all")).toBe(false);
    expect(opensPicker("/resume sess_abc")).toBe(false);
    expect(opensPicker('/pin here on')).toBe(false);
  });

  it('reuses the saved-session chooser for pin without offering resume, rename or delete actions', () => {
    const host = { commandContext: CONTEXT, sessionContext: () => ({ sessionId: 's', projectRoot: '/workspace', busy: false }) } as unknown as PickerHost;
    const pin = pickerFor('/pin', host)!;
    expect(pin.title).toBe('Pin saved session');
    expect(pin.onDelete).toBeUndefined();
    expect(pin.onRename).toBeUndefined();
    expect(pin.chips?.select('all')?.title).toBe('Pin saved session');
  });

  it('opens history as a read-only tree chooser and keeps direct forms routed', () => {
    const picker = pickerFor('/history', { commandContext: CONTEXT, rewind: vi.fn(async () => undefined) } as unknown as PickerHost)!;
    expect(picker.title).toBe('Session history');
    expect(opensPicker('/history list')).toBe(false);
    expect(opensPicker('/history export "archive.json"')).toBe(false);
    expect(opensPicker('/history --help')).toBe(false);
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
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "source-picker-"));
    vi.stubEnv("CHEERS_MARKETPLACES_FILE", path.join(directory, "sources.json"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  it("drafts an add rather than asking for a URL in the list", async () => {
    const picker = sourcePicker(CONTEXT);

    expect(await picker.apply(["add"])).toEqual({ draft: "/marketplace add " });
  });

  it("offers registration without inventing a default source", async () => {
    const picker = sourcePicker(CONTEXT);
    expect((await picker.load()).map((option) => option.id)).toEqual(["add"]);
    expect(await picker.apply(["unknown-source"])).toBeUndefined();
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
    const hash = createHash('sha256').update('before').digest('hex');
    fs.mkdirSync(path.join(namespace, "blobs"), { recursive: true });
    fs.writeFileSync(path.join(namespace, "blobs", `${hash}.content`), "before", "utf8");
    fs.writeFileSync(
      path.join(namespace, "records", `${options.recordId}.json`),
      JSON.stringify({
        schemaVersion: 1,
        authorityId: options.authorityId,
        recordId: options.recordId,
        workspaceRelativePath: options.relativePath,
        operationKind: "update",
        beforeState: "exists",
        beforeContentHash: hash,
        beforeContentSizeBytes: 6,
        beforeContentRef: `blobs/${hash}.content`,
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
    expect(options[0]).toMatchObject({ id: "edit-one:record-a", label: "src/a.ts", note: "restorable" });
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

    expect(options.map((option) => option.id)).toEqual(["edit-two:newer", "edit-one:older"]);
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

    const outcome = await picker.apply(["edit-one:record-a"]);

    expect(outcome?.draft).toContain("/restore preview");
    expect(outcome?.draft).toContain("--authority-id=edit-one");
    expect(outcome?.draft).toContain("--record=record-a");
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

    const outcome = await picker.apply(["edit-one:record-a", "edit-two:record-b"]);

    expect(outcome?.note).toContain("different edits");
    expect(outcome?.draft).toBeUndefined();
  });

  it("says plainly when nothing was selected", async () => {
    const picker = restorePicker(workspace);
    await picker.load();

    expect((await picker.apply([]))?.note).toContain("nothing will be restored");
  });
});

describe("approval chooser", () => {
  const samplePrompt = {
    id: "esc_sample",
    title: "write execute",
    message: "tool wants to write",
    context: { toolName: "write", operation: "write", target: "src/index.ts" },
    options: [],
    defaultOption: "deny" as const,
    recommendedAction: "deny",
    severity: "medium" as const,
  };

  it("offers three standard choices with shortcut notes", async () => {
    const onSettle = vi.fn();
    const picker = approvalPicker(samplePrompt, onSettle);
    const options = await picker.load();
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.id)).toEqual(["allow-once", "allow-always", "deny"]);
    expect(options[0]!.note).toBe("1 / y");
    expect(options[1]!.note).toBe("2 / a");
    expect(options[2]!.note).toBe("3 / n / d / esc");
    expect(options[0]!.detail).toContain("src/index.ts");
  });

  it("applies selected choice to onSettle callback", async () => {
    const onSettle = vi.fn();
    const picker = approvalPicker(samplePrompt, onSettle);
    await picker.apply(["allow-always"]);
    expect(onSettle).toHaveBeenCalledWith({ decision: "allow-always" });
  });

  it('honors a consumption prompt that permits only a one-time choice', async () => {
    const onSettle = vi.fn();
    const picker = approvalPicker({ ...samplePrompt, options: [
      { value: 'allow-once', label: 'Allow once', description: 'Confirm this request' },
      { value: 'deny', label: 'Deny', description: 'Refuse' },
    ] }, onSettle);
    expect((await picker.load()).map(option => option.id)).toEqual(['allow-once', 'deny']);
    await picker.apply(['allow-always']);
    expect(onSettle).toHaveBeenLastCalledWith({ decision: 'deny' });
    await picker.apply(['allow-once']);
    expect(onSettle).toHaveBeenLastCalledWith({ decision: 'allow-once' });
  });

  it("settles with deny when preview ends or cancelled", () => {
    const onSettle = vi.fn();
    const picker = approvalPicker(samplePrompt, onSettle);
    picker.previewEnd?.();
    expect(onSettle).toHaveBeenCalledWith({ decision: "deny" });
  });

  it("gracefully handles prompts with missing context", async () => {
    const onSettle = vi.fn();
    const minimalPrompt = {
      id: "esc_min",
      title: "minimal",
      message: "minimal prompt",
      options: [],
      defaultOption: "deny" as const,
      recommendedAction: "deny",
      severity: "low" as const,
    } as unknown as EscalationPrompt;
    const picker = approvalPicker(minimalPrompt, onSettle);
    expect(picker.title).toBe("Permission: tool");
    const options = await picker.load();
    expect(options).toHaveLength(3);
    expect(options[0]!.detail).toContain("Allow tool");
  });
});


it('marks accepted model and connection selections instead of pending disk selections', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'accepted-pickers-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
  try {
    const provider = loadCatalog().find(item => item.id === 'openai')!;
    const model = provider.models[0]!.id;
    const connections = [{ id: 'first', provider: 'openai' as const, authType: 'api-key' as const, apiKey: 'synthetic-accepted-account',
      model, status: 'connected' as const, createdAt: 'now', updatedAt: 'now' }];
    const runtimeConfig = { ...getRuntimeConfig(root), activeProviderConnectionId: 'first', providerConnections: connections };
    const file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ activeProviderConnectionId: 'pending', providerConnections: [{ ...connections[0], id: 'pending', model: 'pending-model' }] }));
    const context = { cwd: root, runtimeConfig };
    expect((await connectionPicker(context).load()).filter(row => row.note === 'active').map(row => row.id)).toEqual(['use:first']);
    const picker = modelPicker(context);
    expect((await picker.load()).filter(row => row.note === 'active').map(row => row.id)).toEqual([`model:${JSON.stringify(["first", "openai", model])}`]);
    const presetFile = path.join(root, ".cheers", "model-presets.json");
    fs.writeFileSync(presetFile, JSON.stringify({ version: 1, presets: { fast: { roles: { default: { connectionId: "first", provider: "openai", model } } } } }));
    const presetRows = await modelPicker({ ...context, sessionId: "sess_preset" }).load();
    expect(presetRows.find(row => row.id === "preset:fast")?.detail).toContain(`openai/${model}`);
    const detail = picker.detail?.(`model:${JSON.stringify(["first", "openai", model])}`) ?? [];
    expect(detail.join('\n')).toContain('Provider:');
    expect(detail.join('\n')).toContain('Availability:');
  } finally { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); }
});
