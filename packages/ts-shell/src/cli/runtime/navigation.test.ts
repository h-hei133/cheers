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
import { isSessionContextMessage } from "../../session/schema/sessionMessage.js";
import { runEntriesCommand } from "../../core/commands/entriesCommandRuntime.js";
import { routeInteractiveCommand } from "../interactive/interactiveCommandRouter.js";
import { runNonInteractivePrompt } from "../../entrypoints/cliRuntimeModule.js";
import { treePicker } from "../interactive/picker/tree.js";
import { navigateSession } from "./navigation.js";
import { appendBranchSummaryEvent } from '../../session/transcript/sessionTranscript.js';

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
    const read = fs.readFileSync;
    const target = kind === 'state-aba' ? layout.statePath : layout.transcriptPath;
    let reads = 0;
    const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(((file, ...args) => {
      const result = read(file, ...args);
      if (String(file) === target && ++reads === 1) {
        if (kind === 'state-aba') {
          fs.writeFileSync(layout.statePath, stateB);
          fs.writeFileSync(layout.statePath, stateA);
        } else {
          fs.writeFileSync(target, String(result).replace('First question', 'Revised question'));
        }
        // Two immediate writes can share a filesystem clock tick; make the source version distinct.
        const stat = fs.statSync(target);
        fs.utimesSync(target, stat.atime, new Date(stat.mtimeMs + 1000));
      }
      return result;
    }) as typeof fs.readFileSync);
    syncBuiltinESMExports();
    try {
      expect(() => readSessionNavigation(session.id, root)).toThrow('changed while');
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
