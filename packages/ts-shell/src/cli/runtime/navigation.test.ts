import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import { ConfigState } from "../../config/state.js";
import { configurationBinding } from "../../core/shell/configuration.js";
import fs from "node:fs";
import path from "node:path";
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

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-navigation-"));
  vi.stubEnv("HOME", root);
  vi.stubEnv("USERPROFILE", root);
  vi.stubEnv("CHEERS_PROVIDER_MODE", "synthetic");
  vi.stubEnv("CHEERS_TEST_ROOT", root);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function harness() {
  const manager = new SessionManager();
  const session = manager.createNew(root);
  for (const message of [
    { role: "user" as const, content: "First question\nwith detail" },
    { role: "assistant" as const, content: "First answer" },
    { role: "user" as const, content: "Second question" },
    { role: "assistant" as const, content: "Second answer" },
  ]) manager.addTurn(session.id, message);
  const turns = manager.getSession(session.id)!.turns;
  const summarize = vi.fn(async () => "The previous branch explored another approach.");
  const lines: string[] = [];
  const input = {
    sessionManager: manager,
    runtimeContext: { session, cwd: root, projectRoot: root, runtimeConfig: getRuntimeConfig(root),
      configuration: new ConfigState(getRuntimeConfig(root), configurationBinding({ session, projectRoot: root })) } as never,
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
    const rewind = vi.fn(async (point) => (await navigateSession(input, point.entryId)).output);
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
});
