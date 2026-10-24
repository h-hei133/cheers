import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { ConfigState } from "../../config/state.js";
import { configurationBinding } from "../../core/shell/configuration.js";
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../session/SessionManager.js";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../../session/store/sessionFileLayout.js";
import { readSessionNavigation } from "../../session/query/navigation.js";
import * as sessionNavigation from "../../session/query/navigation.js";
import { isSessionContextMessage } from "../../session/schema/sessionMessage.js";
import { runEntriesCommand } from "../../core/commands/entriesCommandRuntime.js";
import { routeInteractiveCommand } from "../interactive/interactiveCommandRouter.js";
import { runNonInteractivePrompt } from "../../entrypoints/cliRuntimeModule.js";
import { treePicker } from "../interactive/picker/tree.js";
import { navigateSession, readBackSource } from "./navigation.js";
import { pickerFor } from '../interactive/picker/registry.js';
import { sessionCommandFor } from './sessionCommands.js';
import { appendBranchSummaryEvent } from '../../session/transcript/sessionTranscript.js';
import { sessionUsageSink } from '../../session/store/usage.js';

vi.mock('../../session/transcript/sessionTranscript.js', async () => {
  const actual = await vi.importActual<typeof import('../../session/transcript/sessionTranscript.js')>('../../session/transcript/sessionTranscript.js');
  return { ...actual, appendBranchSummaryEvent: vi.fn(actual.appendBranchSummaryEvent) };
});

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-navigation-"));
  vi.stubEnv("HOME", root);
  vi.stubEnv("USERPROFILE", root);
  vi.stubEnv("CHEERS_PROVIDER_MODE", "synthetic");
  vi.stubEnv("CHEERS_TEST_ROOT", root);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function harness() {
  const manager = new SessionManager();
  const session = manager.createNew(root);
  for (const message of [
    { role: "user" as const, content: "First question\nwith detail" },
    { role: "assistant" as const, content: "First answer" },
    { role: "user" as const, content: "Second question" },
    { role: "assistant" as const, content: "Second answer" },
  ]) manager.addTurn(session.id, message);
  const loaded = manager.getSession(session.id)!;
  const turns = loaded.turns;
  const summarize = vi.fn(async () => "The previous branch explored another approach.");
  const lines: string[] = [];
  const input = {
    sessionManager: manager,
    runtimeContext: { session: loaded, cwd: root, projectRoot: root, runtimeConfig: getRuntimeConfig(root),
      configuration: new ConfigState(getRuntimeConfig(root), configurationBinding({ session, projectRoot: root })) } as unknown as ShellRuntimeContext,
    sessionRuntime: { getState: () => "idle", summarizeAbandonedTurns: summarize } as never,
    renderer: { renderLine: (line: string) => lines.push(line) } as never,
    readline: {} as never, mcpGateway: {} as never, logger: {} as never,
    approvalTrustPolicy: {} as never, turnNumber: 0,
    setActiveNonInteractiveApprovalMode: () => {},
  };
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.id);
  return { input, session, turns, summarize, lines, layout };
}

describe("session tree navigation", () => {
  it('refuses a back source after the active session changes during its async read', async () => {
    const { input, session } = harness();
    const snapshot = readSessionNavigation(session.id, root);
    let resolveRead!: (value: ReturnType<typeof readSessionNavigation>) => void;
    vi.spyOn(sessionNavigation, 'readSessionNavigationAsync').mockReturnValue(new Promise(resolve => { resolveRead = resolve; }));
    const pending = readBackSource(input.runtimeContext);
    input.runtimeContext.session = { ...input.runtimeContext.session, id: 'other-session' };
    resolveRead(snapshot);
    await expect(pending).rejects.toThrow('active session changed');
  });

  it('does not adopt an initial navigation snapshot after the active session changes', async () => {
    const { input } = harness();
    const snapshot = readSessionNavigation(input.runtimeContext.session.id, root);
    let resolveRead!: (value: ReturnType<typeof readSessionNavigation>) => void;
    vi.spyOn(sessionNavigation, 'readSessionNavigationAsync').mockReturnValue(new Promise(resolve => { resolveRead = resolve; }));
    const revert = vi.spyOn(input.sessionManager, 'revertTo');
    const pending = navigateSession(input, snapshot.thread.activeLeafId!);
    input.runtimeContext.session = { ...input.runtimeContext.session, id: 'other-session', turns: [] };
    resolveRead(snapshot);
    await expect(pending).rejects.toThrow('active session changed');
    expect(revert).not.toHaveBeenCalled();
    expect(input.runtimeContext.session.id).toBe('other-session');
  });

  it('does not adopt a verified navigation snapshot after the active session changes', async () => {
    const { input, turns } = harness();
    const snapshot = readSessionNavigation(input.runtimeContext.session.id, root);
    let resolveVerification!: (value: ReturnType<typeof readSessionNavigation>) => void;
    const read = vi.spyOn(sessionNavigation, 'readSessionNavigationAsync')
      .mockResolvedValueOnce(snapshot)
      .mockReturnValueOnce(new Promise(resolve => { resolveVerification = resolve; }));
    const revert = vi.spyOn(input.sessionManager, 'revertTo').mockResolvedValue(1);
    const pending = navigateSession(input, turns[0]!.id!);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    input.runtimeContext.session = { ...input.runtimeContext.session, id: 'other-session' };
    resolveVerification(snapshot);
    await expect(pending).resolves.toMatchObject({ status: 'unknown', changed: false });
    expect(revert).toHaveBeenCalledTimes(1);
    expect(input.runtimeContext.session.id).toBe('other-session');
  });

  it('preserves same-session live turns started while navigation verification is pending', async () => {
    const { input, turns, summarize } = harness();
    let running = false;
    input.sessionRuntime = {
      getState: () => running ? 'running' : 'idle',
      summarizeAbandonedTurns: summarize,
    } as never;
    const readAsync = sessionNavigation.readSessionNavigationAsync;
    let resolveVerification: (() => void) | undefined;
    vi.spyOn(sessionNavigation, 'readSessionNavigationAsync')
      .mockImplementationOnce(readAsync)
      .mockImplementationOnce(async (...args) => {
        const snapshot = await readAsync(...args);
        return new Promise(resolve => { resolveVerification = () => resolve(snapshot); });
      });
    const pending = navigateSession(input, turns[0]!.id!);
    await vi.waitFor(() => expect(resolveVerification).toBeDefined());
    const live = input.runtimeContext.session;
    running = true;
    live.turns.push({ id: 'live-pending', role: 'user', content: 'New live turn' });
    resolveVerification!();
    const result = await pending;
    expect(result).toMatchObject({ status: 'unknown', changed: false });
    expect(result.draft).toBeUndefined();
    expect(result.output).toContain('became busy');
    expect(input.runtimeContext.session).toBe(live);
    expect(input.runtimeContext.session.turns.at(-1)?.id).toBe('live-pending');
  });

  it('cancels a prepared navigation before its durable write when only a signal is supplied', async () => {
    const { input, turns, summarize, layout } = harness();
    const before = [layout.metadataPath, layout.statePath, layout.transcriptPath].map(file => fs.readFileSync(file));
    const live = input.runtimeContext.session;
    let finishSummary!: (value: string) => void;
    summarize.mockImplementationOnce(() => new Promise(resolve => { finishSummary = resolve; }));
    const controller = new AbortController();
    const pending = navigateSession({ ...input, signal: controller.signal }, turns[0]!.id!);
    await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
    controller.abort();
    finishSummary('Prepared summary');
    const result = await pending;
    expect(result).toMatchObject({ status: 'unknown', changed: false });
    expect(result.draft).toBeUndefined();
    expect(input.runtimeContext.session).toBe(live);
    expect([layout.metadataPath, layout.statePath, layout.transcriptPath].map(file => fs.readFileSync(file))).toEqual(before);
  });

  it('binds back continuation to its saved version and refuses external changes before the original writer', async () => {
    const { input, session, layout } = harness();
    const source = await readBackSource(input.runtimeContext);
    expect(source.turns).toEqual(input.runtimeContext.session.turns);
    const rewind = vi.fn(async point => {
      const result = await navigateSession(input, point.entryId, point.version);
      return { note: result.output, ...(result.draft !== undefined ? { draft: result.draft } : {}) };
    });
    const picker = pickerFor('/back', { commandContext: { cwd: root, admission: () => undefined },
      sessionTurns: () => source, rewind } as never)!;
    await picker.load();
    const saved = [layout.metadataPath, layout.statePath, layout.transcriptPath].map(file => fs.readFileSync(file));
    fs.appendFileSync(layout.transcriptPath, JSON.stringify({ type: 'message', id: 'external', role: 'assistant', content: 'external change', timestamp: new Date().toISOString() }) + '\n');
    const changed = fs.readFileSync(layout.transcriptPath);
    const revert = vi.spyOn(input.sessionManager, 'revertTo');
    const outcome = await picker.apply([source.turns.find(turn => turn.role === 'user')!.id!]);
    expect(outcome?.note).toContain('saved conversation changed');
    expect(rewind).toHaveBeenCalledWith(expect.objectContaining({ version: source.version }));
    expect(revert).not.toHaveBeenCalled();
    expect(outcome?.draft).toBeUndefined();
    expect(fs.readFileSync(layout.metadataPath)).toEqual(saved[0]);
    expect(fs.readFileSync(layout.statePath)).toEqual(saved[1]);
    expect(fs.readFileSync(layout.transcriptPath)).toEqual(changed);
    expect(input.runtimeContext.session.id).toBe(session.id);
  });

  it('uses the existing saved byte limits before reading back questions, and rejects wrong roots and damaged paths', async () => {
    const { input, layout } = harness();
    await expect(readBackSource({ ...input.runtimeContext, projectRoot: path.join(root, 'other') })).rejects.toThrow('different project');
    const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
    state.thread.activeLeafId = 'missing';
    fs.writeFileSync(layout.statePath, JSON.stringify(state));
    await expect(readBackSource(input.runtimeContext)).rejects.toThrow();
    fs.writeFileSync(layout.statePath, ' '.repeat(8 * 1024 * 1024 + 1));
    await expect(readBackSource(input.runtimeContext)).rejects.toThrow('navigation limits');
  });

  it('keeps legitimate empty saved back sources separate from unreadable source refusals', async () => {
    const manager = new SessionManager(); const session = manager.createNew(root);
    const source = await readBackSource({ session, cwd: root, projectRoot: root });
    expect(source.turns).toEqual([]); expect(source.version).toBeTruthy();
    const rewind = vi.fn();
    const host = { commandContext: { cwd: root }, rewind, sessionTurns: () => source } as never;
    const empty = pickerFor('/back', host)!;
    expect(await empty.load()).toEqual([]);
    const unavailable = pickerFor('/back', { ...host, sessionTurns: () => { throw new Error('PRIVATE_STORAGE_BODY'); } } as never)!;
    await expect(unavailable.load()).rejects.toThrow('Questions are unavailable');
    expect(await unavailable.apply(['not-offered'])).toBeUndefined();
    expect(rewind).not.toHaveBeenCalled();
  });

  it('rejects back sources with broken ancestry even when the existing tree can describe the damage', async () => {
    const { input, layout } = harness();
    const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
    state.thread.entries.find(entry => entry.id === state.thread.activeLeafId).parentId = 'missing-parent';
    fs.writeFileSync(layout.statePath, JSON.stringify(state));
    expect(readSessionNavigation(input.runtimeContext.session.id, root).points.some(point => point.unavailable)).toBe(true);
    await expect(readBackSource(input.runtimeContext)).rejects.toThrow('path is unavailable');
  });

  it('rejects missing active-path messages without hiding missing unrelated branches', async () => {
    const { input, layout } = harness();
    const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
    const missing = { id: 'missing-message', parentId: state.thread.activeLeafId, kind: 'turn-message', role: 'user',
      order: state.thread.entries.length, timestamp: new Date().toISOString() };
    state.thread.entries.push(missing);
    fs.writeFileSync(layout.statePath, JSON.stringify(state));
    expect((await readBackSource(input.runtimeContext)).turns).toEqual(input.runtimeContext.session.turns);
    state.thread.activeLeafId = missing.id;
    fs.writeFileSync(layout.statePath, JSON.stringify(state));
    expect(readSessionNavigation(input.runtimeContext.session.id, root).points.find(point => point.entryId === missing.id)?.unavailable).toBe('message unavailable');
    await expect(readBackSource(input.runtimeContext)).rejects.toThrow('path is unavailable');
  });

  it('keeps every admitted deep entry in bounded tree and history terminal output without changing saved files', async () => {
    const { input, session, layout } = harness();
    const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
    const entries = Array.from({ length: 20_000 }, (_, index) => ({ id: `deep-${index}`, order: index,
      kind: index ? 'turn-message' : 'session-root', ...(index ? { parentId: `deep-${index - 1}`, role: 'user' } : {}) }));
    state.thread = { schemaVersion: 1, entries, activeLeafId: entries.at(-1)!.id, branches: [], compactions: [] };
    fs.writeFileSync(layout.statePath, JSON.stringify(state));
    fs.writeFileSync(layout.transcriptPath, [
      JSON.stringify({ type: 'session', version: 1, id: session.id, timestamp: session.createdAt, cwd: root }),
      ...entries.slice(1).map(entry => JSON.stringify({ type: 'message', id: entry.id, role: 'user', content: entry.id, timestamp: session.createdAt })),
    ].join('\n') + '\n');
    const before = [layout.metadataPath, layout.statePath, layout.transcriptPath].map(file => fs.readFileSync(file));
    const tree = await navigateSession(input);
    const command = sessionCommandFor({ ...input, sessionRuntime: { getCurrentRunController: () => null } })!;
    const history = await command('history', []);
    expect(history.kind).toBe('local');
    for (const output of [tree.output, history.kind === 'local' ? history.output : '']) {
      const rows = output.split('\n').filter(line => line.includes('- deep-') || line.includes('- * deep-'));
      expect(rows).toHaveLength(20_000);
      expect(Buffer.byteLength(output)).toBeLessThan(2 * 1024 * 1024);
      expect(rows.at(-1)).toBe(`${'  '.repeat(10)}… - * deep-19999 user: deep-19999`);
    }
    expect(tree).toMatchObject({ status: 'unchanged', changed: false });
    expect(input.runtimeContext.session.id).toBe(session.id);
    expect([layout.metadataPath, layout.statePath, layout.transcriptPath].map(file => fs.readFileSync(file))).toEqual(before);
  });

  it('refuses multiline saved identities in actual terminal callers without changing the saved tree', async () => {
    const { input, session, layout } = harness();
    const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
    const id = `root${'\n'.repeat(20_001)}`;
    state.thread = { schemaVersion: 1, entries: [{ id, kind: 'session-root', order: 0 }],
      activeLeafId: id, branches: [], compactions: [] };
    fs.writeFileSync(layout.statePath, JSON.stringify(state));
    fs.writeFileSync(layout.transcriptPath, JSON.stringify({ type: 'session', version: 1, id: session.id, timestamp: session.createdAt, cwd: root }) + '\n');
    const before = [layout.metadataPath, layout.statePath, layout.transcriptPath].map(file => fs.readFileSync(file));
    await expect(navigateSession(input)).rejects.toThrow('line boundary');
    const command = sessionCommandFor({ ...input, sessionRuntime: { getCurrentRunController: () => null } })!;
    expect(await command('history', [])).toMatchObject({ kind: 'local', output: expect.stringContaining('History is unavailable:') });
    expect([layout.metadataPath, layout.statePath, layout.transcriptPath].map(file => fs.readFileSync(file))).toEqual(before);
  });

  it.each(['tree', 'fork', 'history'] as const)('refuses the offered %s entry after a branch round trip', async mode => {
    const { input, session, turns, layout } = harness();
    const action = vi.fn(async point => {
      const result = await navigateSession(input, point.entryId, point.version);
      return { note: result.output, draft: result.draft };
    });
    const picker = treePicker({ sessionId: session.id, cwd: root }, action, mode);
    await picker.load();
    await input.sessionManager.revertTo(session.id, turns[0]!.id!);
    await input.sessionManager.revertTo(session.id, turns[3]!.id!);
    const before = [layout.statePath, layout.transcriptPath, layout.metadataPath].map(file => fs.readFileSync(file));
    const result = await picker.apply([turns[0]!.id!]);
    expect(result?.note).toContain('changed after this tree opened');
    expect(result?.draft).toBeUndefined();
    expect(action).not.toHaveBeenCalled();
    expect([layout.statePath, layout.transcriptPath, layout.metadataPath].map(file => fs.readFileSync(file))).toEqual(before);
  });

  it('refuses navigation when a transcript edit occurs during summary preparation', async () => {
    const { input, session, turns, summarize, layout } = harness();
    summarize.mockImplementationOnce(async () => {
      const text = fs.readFileSync(layout.transcriptPath, 'utf8');
      fs.writeFileSync(layout.transcriptPath, text.replace('First question', 'Edited question'));
      return 'Prepared from stale messages';
    });
    const beforeState = fs.readFileSync(layout.statePath);
    const result = await navigateSession(input, turns[0]!.id!);
    expect(result).toMatchObject({ status: 'unchanged', changed: false });
    expect(result.draft).toBeUndefined();
    expect(fs.readFileSync(layout.statePath)).toEqual(beforeState);
    expect(readSessionNavigation(session.id, root).thread.activeLeafId).toBe(turns[3]!.id);
    expect(fs.readFileSync(layout.transcriptPath, 'utf8')).not.toContain('Prepared from stale messages');
  });

  it('keeps legitimate summary accounting while committing the unchanged selected conversation', async () => {
    const { input, session, turns, summarize, layout } = harness();
    summarize.mockImplementationOnce(async () => {
      const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8'));
      fs.writeFileSync(layout.statePath, JSON.stringify({ ...state,
        requestLedger: { summaryReceipt: 'measured' } }));
      sessionUsageSink(session.id)({ provider: 'openai', model: 'summary', promptTokens: 4, completionTokens: 1 });
      return 'Prepared with recorded accounting';
    });
    const result = await navigateSession(input, turns[0]!.id!);
    expect(result).toMatchObject({ status: 'changed', changed: true, draft: turns[0]!.content });
    expect(readSessionNavigation(session.id, root).thread.activeLeafId).toBe(turns[0]!.id);
    expect(JSON.parse(fs.readFileSync(layout.statePath, 'utf8'))).toMatchObject({
      requestLedger: { summaryReceipt: 'measured' }, usage: { byModel: { 'openai/summary': { promptTokens: 4, completionTokens: 1 } } },
    });
  });

  it('refuses a source changed between picker validation and the navigation owner', async () => {
    const { input, session, turns, layout } = harness();
    const offered = readSessionNavigation(session.id, root);
    input.sessionManager.addTurn(session.id, { role: 'user', content: 'new user input' });
    const before = fs.readFileSync(layout.statePath);
    const result = await navigateSession(input, turns[0]!.id!, offered.version);
    expect(result).toMatchObject({ status: 'unchanged', changed: false });
    expect(result.output).toContain('changed after selection');
    expect(result.draft).toBeUndefined();
    expect(fs.readFileSync(layout.statePath)).toEqual(before);
  });
  it.each(["interactive", "piped", "print"])("routes a stable entry id in the %s host", async (mode) => {
    const { input, session, turns, summarize, lines, layout } = harness();
    const before = fs.readFileSync(layout.transcriptPath, "utf8");
    const prompt = `/tree ${turns[0]!.id}`;
    if (mode === "interactive") {
      const result = await routeInteractiveCommand({ ...input, prompt });
      expect(result.navigation).toMatchObject({ changed: true, draft: turns[0]!.content });
    } else {
      await runNonInteractivePrompt({ ...input, prompt, printMode: mode === "print" });
      expect(lines.join("\n")).toContain("Prompt available to edit:");
      expect(lines.join("\n")).toContain("First question");
    }
    expect(readSessionNavigation(session.id, root).thread.activeLeafId).toBe(turns[0]!.id);
    expect(input.sessionManager.getSession(session.id)!.turns.filter((turn) => turn.role === "user" && !isSessionContextMessage(turn))).toHaveLength(1);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(layout.transcriptPath, "utf8")).toContain(before);
    expect(fs.readFileSync(layout.transcriptPath, "utf8")).toContain('"type":"branch_summary"');
  });

  it("offers abandoned branches and restores one through the existing rewind host", async () => {
    const { input, session, turns } = harness();
    await navigateSession(input, turns[0]!.id!);
    input.sessionManager.addTurn(session.id, { role: "user", content: "Alternative branch" });
    const rewind = vi.fn(async (point) => {
      const result = await navigateSession(input, point.entryId);
      return { note: result.output, draft: result.draft };
    });
    const picker = treePicker({ sessionId: session.id, cwd: root }, rewind);
    const options = await picker.load();
    expect(options.some((option) => option.label.includes("Alternative branch"))).toBe(true);
    expect(options.some((option) => option.id === turns[2]!.id)).toBe(true);
    expect(await picker.apply([turns[2]!.id!])).toMatchObject({ draft: "Second question" });
    expect(rewind).toHaveBeenCalledTimes(1);
    expect(readSessionNavigation(session.id, root).thread.activeLeafId).toBe(turns[2]!.id);
  });

  it('browses persisted abandoned branches through history without changing the branch or files', async () => {
    const { input, session, turns, summarize, layout } = harness();
    await navigateSession(input, turns[0]!.id!);
    input.sessionManager.addTurn(session.id, { role: 'user', content: 'Alternative branch' });
    const workspaceFile = path.join(root, 'untouched.txt');
    fs.writeFileSync(workspaceFile, 'unchanged\r\n😀\n');
    const before = [layout.statePath, layout.transcriptPath, layout.metadataPath, workspaceFile].map(file => fs.readFileSync(file));
    const navigation = readSessionNavigation(session.id, root);
    const rewind = vi.fn();
    summarize.mockClear();
    const picker = treePicker({ sessionId: session.id, cwd: root }, rewind, 'history');
    const options = await picker.load();
    expect(options.map(option => option.id)).toEqual(navigation.points.map(point => point.entryId));
    expect(options.some(option => option.label.includes('Alternative branch'))).toBe(true);
    expect(options.some(option => option.id === turns[3]!.id)).toBe(true);
    expect(input.sessionManager.getSession(session.id)!.turns.some(turn => turn.id === turns[3]!.id)).toBe(false);
    expect(picker.initialSelection).toBe(navigation.thread.activeLeafId);
    expect(await picker.apply([turns[3]!.id!])).toEqual({ draft: `/tree -- ${turns[3]!.id}` });
    expect(rewind).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
    expect([layout.statePath, layout.transcriptPath, layout.metadataPath, workspaceFile].map(file => fs.readFileSync(file))).toEqual(before);
  });

  it("makes listing, /entries tree, and selecting the current leaf read-only", async () => {
    const { input, session, turns, summarize, layout } = harness();
    const state = fs.readFileSync(layout.statePath);
    const transcript = fs.readFileSync(layout.transcriptPath);
    expect((await navigateSession(input)).output).toContain(turns[2]!.id!);
    expect((await runEntriesCommand(["tree"], { sessionId: session.id, cwd: root })).output).toContain(turns[2]!.id!);
    expect(await navigateSession(input, turns[3]!.id!)).toMatchObject({ changed: false });
    expect(summarize).not.toHaveBeenCalled();
    expect(fs.readFileSync(layout.statePath)).toEqual(state);
    expect(fs.readFileSync(layout.transcriptPath)).toEqual(transcript);
  });

  it("refuses unknown or damaged entries without changing the stored leaf", async () => {
    const { input, turns, layout } = harness();
    await expect(navigateSession(input, "not-an-entry")).rejects.toThrow("No entry");
    const state = JSON.parse(fs.readFileSync(layout.statePath, "utf8"));
    const damaged = state.thread.entries.find((entry: { id: string }) => entry.id === turns[0]!.id);
    damaged.parentId = damaged.id;
    fs.writeFileSync(layout.statePath, JSON.stringify(state));
    const before = fs.readFileSync(layout.statePath);
    await expect(navigateSession(input, damaged.id)).rejects.toThrow("broken ancestry");
    expect(fs.readFileSync(layout.statePath)).toEqual(before);
  });

  it("refuses a readable descendant of a missing message without writing a new branch", async () => {
    const { input, session, turns, summarize, layout } = harness();
    const events = fs.readFileSync(layout.transcriptPath, "utf8").trim().split("\n")
      .filter((line) => JSON.parse(line).id !== turns[0]!.id);
    fs.writeFileSync(layout.transcriptPath, `${events.join("\n")}\n`);
    const beforeState = fs.readFileSync(layout.statePath);
    const beforeTranscript = fs.readFileSync(layout.transcriptPath);
    const rewind = vi.fn();
    const picker = treePicker({ sessionId: session.id, cwd: root }, rewind);
    expect((await picker.load()).find((option) => option.id === turns[2]!.id)?.disabled).toBe(true);
    await picker.apply([turns[2]!.id!]);
    expect(rewind).not.toHaveBeenCalled();
    await expect(navigateSession(input, turns[2]!.id!)).rejects.toThrow("broken ancestry");
    expect(summarize).not.toHaveBeenCalled();
    expect(fs.readFileSync(layout.statePath)).toEqual(beforeState);
    expect(fs.readFileSync(layout.transcriptPath)).toEqual(beforeTranscript);
  });

  it("refuses navigation during a running turn before invoking the writer", async () => {
    const { input, turns, summarize, layout } = harness();
    const before = fs.readFileSync(layout.statePath);
    await expect(navigateSession({ ...input, sessionRuntime: {
      getState: () => "running", summarizeAbandonedTurns: summarize,
    } }, turns[0]!.id!)).rejects.toThrow("current turn");
    expect(fs.readFileSync(layout.statePath)).toEqual(before);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('reloads the changed branch when its note cannot be appended', async () => {
    const { input, session, turns, layout } = harness();
    const transcript = fs.readFileSync(layout.transcriptPath);
    vi.mocked(appendBranchSummaryEvent).mockImplementationOnce(() => { throw new Error('private-error-fixture'); });
    const result = await navigateSession(input, turns[0]!.id!);
    expect(result).toMatchObject({ status: 'changed-with-warning', changed: true, draft: turns[0]!.content });
    expect(result.output).toContain('3 later messages');
    expect(result.output).toContain('branch note could not be saved');
    expect(result.output).not.toContain('private-error-fixture');
    expect(input.runtimeContext.session.turns.filter(turn => !isSessionContextMessage(turn))).toHaveLength(1);
    expect(readSessionNavigation(session.id, root).thread.activeLeafId).toBe(turns[0]!.id);
    expect(readSessionNavigation(session.id, root).points.some(point => point.entryId === turns[3]!.id)).toBe(true);
    expect(fs.readFileSync(layout.transcriptPath)).toEqual(transcript);
  });

  it('reports a summary failure after adopting the verified branch', async () => {
    const { input, turns, summarize, layout } = harness();
    summarize.mockRejectedValueOnce(new Error('private-provider-fixture'));
    const result = await navigateSession(input, turns[0]!.id!);
    expect(result).toMatchObject({ status: 'changed-with-warning', changed: true, draft: turns[0]!.content });
    expect(result.output).toContain('could not be summarized');
    expect(result.output).not.toContain('private-provider-fixture');
    expect(fs.readFileSync(layout.transcriptPath, 'utf8')).toContain('"type":"branch_summary"');
  });

  it.each(['direct', 'picker'])('refreshes a stale runtime view when the requested entry is already active through %s', async mode => {
    const { input, session, turns, summarize, layout } = harness();
    input.runtimeContext.session = input.sessionManager.getSession(session.id)!;
    await input.sessionManager.revertTo(session.id, turns[0]!.id!);
    const before = fs.readFileSync(layout.statePath);
    let result: Awaited<ReturnType<typeof navigateSession>> | undefined;
    if (mode === 'picker') {
      const picker = treePicker({ sessionId: session.id, cwd: root }, async point => {
        result = await navigateSession(input, point.entryId);
        return { note: result.output, draft: result.draft };
      });
      await picker.load();
      await picker.apply([turns[0]!.id!]);
    } else {
      result = await navigateSession(input, turns[0]!.id!);
    }
    expect(result).toMatchObject({ status: 'unchanged', changed: true, draft: turns[0]!.content });
    expect(result?.output).toContain('view was refreshed');
    expect(input.runtimeContext.session.turns).toEqual(input.sessionManager.getSession(session.id)!.turns);
    expect(fs.readFileSync(layout.statePath)).toEqual(before);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('preserves the live runtime view when a new turn starts during summary preparation', async () => {
    const { input, session, turns, summarize } = harness();
    let running = false;
    input.sessionRuntime = {
      getState: () => running ? 'running' : 'idle',
      summarizeAbandonedTurns: summarize,
    } as never;
    let live = input.runtimeContext.session;
    summarize.mockImplementationOnce(async () => {
      running = true;
      input.sessionManager.addTurn(session.id, { role: 'user', content: 'New live turn' });
      live = input.sessionManager.getSession(session.id)!;
      input.runtimeContext.session = live;
      return 'Prepared for the old branch';
    });
    const result = await navigateSession(input, turns[0]!.id!);
    expect(result).toMatchObject({ status: 'unknown', changed: false });
    expect(result.draft).toBeUndefined();
    expect(result.output).toContain('became busy');
    expect(input.runtimeContext.session).toBe(live);
    expect(readSessionNavigation(session.id, root).thread.activeLeafId).toBe(live.turns.at(-1)!.id);
  });

  it.each([false, true])('rereads a rejected write instead of assuming unchanged (committed=%s)', async committed => {
    const { input, turns, layout } = harness();
    const before = fs.readFileSync(layout.statePath);
    const revert = input.sessionManager.revertTo.bind(input.sessionManager);
    vi.spyOn(input.sessionManager, 'revertTo').mockImplementationOnce(async (...args) => {
      if (committed) await revert(...args);
      throw new Error('private-storage-fixture');
    });
    const result = await navigateSession(input, turns[0]!.id!);
    expect(result.status).toBe(committed ? 'changed-with-warning' : 'unchanged');
    expect(result.changed).toBe(committed);
    expect(result.draft).toBe(committed ? turns[0]!.content : undefined);
    expect(result.output).not.toContain('private-storage-fixture');
    if (!committed) expect(fs.readFileSync(layout.statePath)).toEqual(before);
  });

  it('keeps an unconfirmed reload unknown and does not apply the proposed draft', async () => {
    const { input, turns, layout } = harness();
    const original = input.runtimeContext.session;
    const revert = input.sessionManager.revertTo.bind(input.sessionManager);
    vi.spyOn(input.sessionManager, 'revertTo').mockImplementationOnce(async (...args) => {
      await revert(...args);
      fs.writeFileSync(layout.statePath, '{');
      throw new Error('unconfirmed-write-fixture');
    });
    const result = await navigateSession(input, turns[0]!.id!);
    expect(result).toMatchObject({ status: 'unknown', changed: false });
    expect(result.draft).toBeUndefined();
    expect(result.output).toContain('view may be out of date');
    expect(input.runtimeContext.session).toBe(original);
  });

  it('preserves a newer leaf chosen while the summary was being prepared', async () => {
    const { input, session, turns, summarize } = harness();
    summarize.mockImplementationOnce(async () => {
      await input.sessionManager.revertTo(session.id, turns[2]!.id!);
      return 'Prepared for the older branch';
    });
    const result = await navigateSession(input, turns[0]!.id!);
    expect(result).toMatchObject({ status: 'changed-with-warning', changed: true });
    expect(result.draft).toBeUndefined();
    expect(readSessionNavigation(session.id, root).thread.activeLeafId).toBe(turns[2]!.id);
    expect(input.runtimeContext.session.turns.some(turn => turn.content === 'Second question')).toBe(true);
  });

  it('does not navigate the old session after its runtime identity changes during preparation', async () => {
    const { input, session, turns, summarize, layout } = harness();
    const before = fs.readFileSync(layout.statePath);
    const replacement = input.sessionManager.createNew(root);
    summarize.mockImplementationOnce(async () => {
      input.runtimeContext.session = replacement;
      return 'Prepared for the old session';
    });
    const result = await navigateSession(input, turns[0]!.id!);
    expect(result).toMatchObject({ status: 'unknown', changed: false });
    expect(result.draft).toBeUndefined();
    expect(input.runtimeContext.session.id).toBe(replacement.id);
    expect(readSessionNavigation(session.id, root).thread.activeLeafId).toBe(turns[3]!.id);
    expect(fs.readFileSync(layout.statePath)).toEqual(before);
  });

  it.each(['state-aba', 'transcript'])('rejects a changing %s acquisition instead of mixing navigation projections', async kind => {
    const { input, session, turns, layout } = harness();
    await input.sessionManager.revertTo(session.id, turns[0]!.id!);
    const stateA = fs.readFileSync(layout.statePath, 'utf8');
    await input.sessionManager.revertTo(session.id, turns[3]!.id!);
    const stateB = fs.readFileSync(layout.statePath, 'utf8');
    fs.writeFileSync(layout.statePath, stateA);
    const read = fs.readSync;
    const target = kind === 'state-aba' ? layout.statePath : layout.transcriptPath;
    const identity = fs.statSync(target);
    const transcript = fs.readFileSync(layout.transcriptPath, 'utf8');
    let reads = 0;
    const spy = vi.spyOn(fs, 'readSync').mockImplementation(((fd, ...args) => {
      const result = read(fd, ...args);
      const opened = fs.fstatSync(fd);
      if (reads === 0 && result > 0 && opened.dev === identity.dev && opened.ino === identity.ino) {
        reads++;
        if (kind === 'state-aba') {
          fs.writeFileSync(layout.statePath, stateB);
          fs.writeFileSync(layout.statePath, stateA);
        } else {
          fs.writeFileSync(target, transcript.replace('First question', 'Revised question'));
        }
        // Two immediate writes can share a filesystem clock tick; make the source version distinct.
        const stat = fs.statSync(target);
        fs.utimesSync(target, stat.atime, new Date(stat.mtimeMs + 1000));
      }
      return result;
    }) as typeof fs.readSync);
    syncBuiltinESMExports();
    try {
      expect(() => readSessionNavigation(session.id, root)).toThrow(/changed during|changed while/);
      expect(reads).toBe(1);
    } finally {
      spy.mockRestore();
      syncBuiltinESMExports();
    }
  });

  it.each(['before', 'during'])('does not mix project scopes when a stored session is rebound %s navigation', async timing => {
    const { input, session, turns, summarize } = harness();
    const original = input.runtimeContext.session;
    const project = path.join(root, 'other-project');
    fs.mkdirSync(project);
    const rebind = (): string => { input.sessionManager.rebindSessionProjectRoot(session.id, project); return 'Prepared summary'; };
    if (timing === 'before') {
      rebind();
      await expect(navigateSession(input, turns[0]!.id!)).rejects.toThrow('different project');
      expect(summarize).not.toHaveBeenCalled();
    } else {
      summarize.mockImplementationOnce(async () => rebind());
      const result = await navigateSession(input, turns[0]!.id!);
      expect(result).toMatchObject({ status: 'unknown', changed: false });
      expect(result.draft).toBeUndefined();
      expect(result.output).toContain('different project');
    }
    expect(input.runtimeContext.projectRoot).toBe(root);
    expect(input.runtimeContext.session).toBe(original);
    expect(input.sessionManager.getSession(session.id)?.projectRoot).toBe(project);
    expect(readSessionNavigation(session.id, project).thread.activeLeafId).toBe(turns[3]!.id);
  });
});
