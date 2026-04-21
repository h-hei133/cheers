import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueryEvent } from "../core/query/events.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtimeState.js";
import { safeRemoveDir } from "../test-utils/cleanup.js";
import {
  runMvpIntegratedFlow,
  streamMvpIntegratedFlow,
} from "./runMvpIntegratedFlow.js";

describe("MVP integrated end-to-end flow (T10)", () => {
  const workspaceRoot = path.join(os.tmpdir(), "private-agents-t10-workspace");

  afterEach(async () => {
    await safeRemoveDir(workspaceRoot);
  });

  it("covers prompt -> handoff -> tool approval -> streamed result", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-workspace" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_happy",
      prompt: "Run node --version and continue with tool-assisted implementation",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.transcript.map((turn) => turn.role)).toEqual([
      "planner",
      "coder",
      "reviewer",
    ]);

    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("workflow: branch=");
    expect(mergedNotes).toContain("mcp: clients=");
    expect(mergedNotes).toContain("plan: intent=run-command");
    expect(mergedNotes).toContain("bash(node --version)");

    expect(result.transcript[0]?.content).toContain("PLANNER:");
    expect(result.transcript[1]?.content).toContain("CODER:");
    expect(result.transcript[2]?.content).toContain("REVIEWER:");
    expect(result.finalOutput).toContain("REVIEWER:");
  }, 15000);

  it("derives file-oriented intent from prompt and uses glob without default bash demo path", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-file-intent" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_file_intent",
      prompt: "List TypeScript files for this workspace",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=inspect-files");
    expect(mergedNotes).toContain("glob(.ts)");
    expect(mergedNotes).not.toContain("bash(");
  }, 15000);

  it("denies escalation and terminates with explicit stopped_error terminal", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-workspace" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_forbidden",
      prompt: "Run node --version in this workspace",
      workspaceRoot,
      escalationDecision: "deny",
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toContain("Approval denied by user for bash");

    expect(result.transcript.map((turn) => turn.role)).toEqual(["planner"]);

    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("workflow: branch=");
    expect(mergedNotes).toContain("mcp: clients=");
    expect(result.finalOutput).toContain("PLANNER:");
  }, 15000);

  it("uses explicit escalation callback instead of prompt-derived synthetic decisions", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-explicit"}\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const prompts: string[] = [];
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_explicit_callback",
      prompt: "Run node version check and continue implementation.",
      workspaceRoot,
      escalationDecision: "allow-once",
      escalationPromptHandler: async (prompt) => {
        prompts.push(prompt.id);
        return {
          promptId: prompt.id,
          decision: "deny",
          respondedAt: Date.now(),
          userComment: "explicit callback deny",
        };
      },
      maxTurns: 6,
    });

    expect(prompts.length).toBeGreaterThan(0);
    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toContain("Approval denied by user for bash");
  }, 15000);

  it("keeps synthetic escalation fallback injection-only: default path denies, explicit injection allows", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-escalation-boundary"}\n',
      "utf8",
    );

    const prompt = "Run node --version and continue implementation";

    const defaultPathResult = await runMvpIntegratedFlow({
      sessionId: "sess_t10_escalation_default_denied",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(defaultPathResult.status).toBe("stopped_error");
    expect(defaultPathResult.terminalClassification).toBe("error");
    expect(defaultPathResult.stopReason).toContain(
      "Approval denied by user for bash",
    );
    expect(defaultPathResult.transcript.map((turn) => turn.role)).toEqual([
      "planner",
    ]);

    const injectedPathResult = await runMvpIntegratedFlow({
      sessionId: "sess_t10_escalation_injected_allow",
      prompt,
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(injectedPathResult.status).toBe("completed");
    expect(injectedPathResult.terminalClassification).toBe("success");
    expect(injectedPathResult.transcript.map((turn) => turn.role)).toEqual([
      "planner",
      "coder",
      "reviewer",
    ]);

    const mergedNotes = injectedPathResult.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("tool: approved bash(node --version)");
  }, 15000);

  it("keeps stream fallback injection-only: default path denies, explicit injection allows", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-stream-escalation-boundary"}\n',
      "utf8",
    );

    const prompt = "Run node --version and continue implementation";

    const defaultPathEvents: QueryEvent[] = [];
    for await (const event of streamMvpIntegratedFlow({
      sessionId: "sess_t10_stream_default_denied",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    })) {
      defaultPathEvents.push(event);
    }

    const defaultApproval = defaultPathEvents.find(
      (event): event is Extract<QueryEvent, { type: "approval.resolved" }> =>
        event.type === "approval.resolved",
    );
    expect(defaultApproval?.outcome).toBe("denied");

    const defaultCompleted = defaultPathEvents.find(
      (event): event is Extract<QueryEvent, { type: "query.completed" }> =>
        event.type === "query.completed",
    );
    expect(defaultCompleted?.result.status).toBe("stopped_error");
    expect(defaultCompleted?.result.terminalClassification).toBe("error");
    expect(defaultCompleted?.result.status).not.toBe("completed");

    const injectedPathEvents: QueryEvent[] = [];
    for await (const event of streamMvpIntegratedFlow({
      sessionId: "sess_t10_stream_injected_allow",
      prompt,
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    })) {
      injectedPathEvents.push(event);
    }

    const injectedApproval = injectedPathEvents.find(
      (event): event is Extract<QueryEvent, { type: "approval.resolved" }> =>
        event.type === "approval.resolved",
    );
    expect(injectedApproval?.outcome).toBe("approved");

    const injectedCompleted = injectedPathEvents.find(
      (event): event is Extract<QueryEvent, { type: "query.completed" }> =>
        event.type === "query.completed",
    );
    expect(injectedCompleted?.result.status).toBe("completed");
    expect(injectedCompleted?.result.terminalClassification).toBe("success");
  }, 15000);

  it("uses default single-assistant task contract without visible role labels", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-default-assistant-contract" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_default_assistant_contract",
      prompt: "hello",
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.transcript.map((turn) => turn.role)).toEqual(["coder"]);
    expect(result.finalOutput).not.toContain("PLANNER:");
    expect(result.finalOutput).not.toContain("CODER:");
    expect(result.finalOutput).not.toContain("REVIEWER:");
  }, 15000);

  it("normalizes legacy resume runtime seed roles into single-assistant continuation contract", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-resume-single-assistant-contract" }, null, 2),
      "utf8",
    );

    const legacyRuntimeSeed: QueryRuntimeStateSeed = {
      config: {
        sessionId: "sess_t10_legacy_seed",
        initialPrompt: "continue previous work",
        maxTurns: 6,
        startingRole: "planner",
      },
      currentRole: "planner",
      turn: 2,
      pendingLifecycle: {
        pendingApprovals: {},
        pendingTools: {},
        taskStates: {},
      },
      recoveryBoundary: "completed-turn-reentry",
      truthBoundary: {
        source: "durable-replay",
        normalizedEventCount: 3,
        pairedTurnCount: 1,
        policyEvidence: new Set(["paired-turns"]),
        repairSummary: {
          insertedPromptMessage: false,
          insertedQueryStarted: false,
          strippedInterruptedTerminalEvents: 0,
          insertedRunInterrupted: false,
          ignoredDuplicateTurnStarts: 0,
          ignoredUnpairedTurnCompletions: 0,
          ignoredRoleMismatchedTurnCompletions: 0,
        },
        continuationSafety: "completed-turn-only",
      },
      derivedState: {
        transcript: [
          {
            role: "planner",
            content: "legacy planning trace",
            handoffTo: "coder",
            handoffReason: "legacy handoff",
            notes: ["legacy-note"],
          },
        ],
      },
    };

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_legacy_seed",
      prompt: "continue previous work",
      workspaceRoot,
      maxTurns: 6,
      runtimeSeed: legacyRuntimeSeed,
    });

    expect(result.status).toBe("completed");
    expect(result.transcript.every((turn) => turn.role === "coder")).toBe(true);
    expect(result.sharedContext.handoffs.length).toBe(0);
  }, 15000);

  it("writes a python file when prompt includes explicit create/write intent and path", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-write-file-intent" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_write_file_intent",
      prompt: "Create a python script at scripts/hello.py",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=write-file");
    expect(mergedNotes).toContain("tool: wrote file scripts/hello.py");

    const scriptPath = path.join(workspaceRoot, "scripts", "hello.py");
    const scriptContent = await fs.readFile(scriptPath, "utf8");
    expect(scriptContent.length).toBeGreaterThan(0);
  }, 15000);

  it("maps dir/list-directory intent to directory command instead of node --version fallback", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-dir-intent" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_dir_intent",
      prompt: "Please run dir in this workspace",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=run-command");
    expect(mergedNotes).toContain("tool: approved bash(");
    expect(mergedNotes).not.toContain("bash(node --version)");
  }, 15000);

  it("reads first N lines from a target file via read tool intent", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-read-file-intent" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "test.log"),
      ["line1", "line2", "line3", "line4", "line5", "line6"].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_read_file_intent",
      prompt: "Read test.log and return first 5 lines",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=read-file");
    expect(mergedNotes).toContain("tool: read file test.log first 5 lines");
  }, 15000);

  it("keeps multi-suffix targets stable for read tasks (.tsx is not truncated to .ts)", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-read-multi-suffix" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "widget.test.tsx"),
      ["export const marker = 'tsx-target';", "export default marker;"].join(
        "\n",
      ),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_read_multi_suffix",
      prompt: "Read src/widget.test.tsx first 1 lines",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=read-file");
    expect(mergedNotes).toContain("tool: read file src/widget.test.tsx");
    expect(result.finalOutput).toContain("src/widget.test.tsx");
  }, 15000);

  it("reuses target resolution contract for repo diagnosis hints on multi-suffix files", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-repo-diagnosis-target-resolution" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "panel.test.tsx"),
      [
        "export function panelLogic() {",
        "  return 'panel';",
        "}",
      ].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_repo_diagnosis_target_resolution",
      prompt:
        "In this repo, where is panelLogic implemented in src/panel.test.tsx?",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=repo-explain");
    expect(mergedNotes).toContain("src/panel.test.tsx");
  }, 15000);

  it("keeps multi-suffix targets stable for write tasks", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-write-multi-suffix" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_write_multi_suffix",
      prompt: "Write src/new-widget.test.tsx",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=write-file");
    expect(mergedNotes).toContain("tool: wrote file src/new-widget.test.tsx");
    const fileContent = await fs.readFile(
      path.join(workspaceRoot, "src", "new-widget.test.tsx"),
      "utf8",
    );
    expect(fileContent.length).toBeGreaterThan(0);
  }, 15000);

  it("infers python script target in current workspace without explicit path", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-write-python-infer" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_write_python_infer",
      prompt: "Write a python script helloworld in current directory",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=write-file");
    expect(mergedNotes).toContain("tool: wrote file helloworld.py");
    const scriptContent = await fs.readFile(
      path.join(workspaceRoot, "helloworld.py"),
      "utf8",
    );
    expect(scriptContent.toLowerCase()).toContain("hello");
  }, 15000);

  it("still infers python write intent under mojibake-like prompt bytes", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-write-python-mojibake" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_write_python_mojibake",
      prompt: "写一锟斤拷 python 锟脚憋拷 helloworld 锟斤拷锟节碉拷前目录锟斤拷",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "plan: intent=write-file",
    );
  }, 15000);

  it("returns explicit guidance when read intent omits file path", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-read-missing-path" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_read_missing_path",
      prompt: "Read file and return first 5 lines",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain(
      "I can read the file, but I still need an explicit file path.",
    );
    expect(result.sharedContext.notes.join("\n")).toContain(
      "plan: intent=read-file-missing-path",
    );
  }, 15000);

  it("inherits continuation target for pathless read follow-up from continuity context", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-read-followup-continuity-target" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "continuation-target.tsx"),
      ["line1", "line2", "line3", "line4"].join("\n"),
      "utf8",
    );

    const composedPrompt = [
      "Read this file first 3 lines",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/continuation-target.tsx",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_read_followup_continuity_target",
      prompt: composedPrompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=read-file");
    expect(mergedNotes).toContain("tool: read file src/continuation-target.tsx");
    expect(result.finalOutput).toContain("line1");
  }, 15000);

  it("relocates inherited continuation target after migration when moved file has a single high-confidence candidate", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src", "new"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-continuation-relocation-single-candidate" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "new", "continuation-target.tsx"),
      ["line1", "line2", "line3", "line4", "line5"].join("\n"),
      "utf8",
    );

    const composedPrompt = [
      "continue reading next 2 lines",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/old/continuation-target.tsx",
      "- last-grounded-deliverable-mode: read",
      "- last-read-delivered-lines: 2",
      "- last-read-window-start: 0",
      "- last-read-window-end: 2",
      "- last-read-window-size: 2",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_continuation_relocation_single_candidate",
      prompt: composedPrompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("line3");
    expect(result.finalOutput).toContain("line4");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "continuation target relocated: src/old/continuation-target.tsx -> src/new/continuation-target.tsx",
    );
  }, 15000);

  it("truthfully blocks continuation relocation when multiple candidates are ambiguous", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src", "a"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "src", "b"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-continuation-relocation-ambiguous" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "a", "continuation-target.tsx"),
      ["alpha", "beta", "gamma"].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "b", "continuation-target.tsx"),
      ["one", "two", "three"].join("\n"),
      "utf8",
    );

    const composedPrompt = [
      "继续读取后两行",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/old/continuation-target.tsx",
      "- last-grounded-deliverable-mode: read",
      "- last-read-delivered-lines: 2",
      "- last-read-window-start: 0",
      "- last-read-window-end: 2",
      "- last-read-window-size: 2",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_continuation_relocation_ambiguous",
      prompt: composedPrompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Task not completed");
    expect(result.finalOutput).toContain("relocation is ambiguous");
  }, 15000);

  it("truthfully blocks continuation relocation when no recovery path exists", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-continuation-relocation-missing" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "different-file.tsx"),
      ["a", "b", "c"].join("\n"),
      "utf8",
    );

    const composedPrompt = [
      "刚才读到哪里了？继续读取后两行",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/old/continuation-target.tsx",
      "- last-grounded-deliverable-mode: read",
      "- last-read-delivered-lines: 2",
      "- last-read-window-start: 0",
      "- last-read-window-end: 2",
      "- last-read-window-size: 2",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_continuation_relocation_missing",
      prompt: composedPrompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Task not completed");
    expect(result.finalOutput).toContain("no high-confidence relocation candidate was found");
  }, 15000);

  it("defaults to grounded read when prompt provides a file path but lacks explicit read verb", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-read-path-fallback" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "test.log"),
      ["alpha", "beta", "gamma", "delta", "epsilon"].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_read_path_fallback",
      prompt: "D:/tmp/test.log 5".replace(
        "D:/tmp",
        workspaceRoot.replaceAll("\\", "/"),
      ),
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "plan: intent=read-file",
    );
  }, 15000);

  it("collects repo evidence before answering repo-specific coding questions", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-repo-aware-explain" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "flow.ts"),
      [
        "export function runFlow() {",
        "  return 'ok';",
        "}",
      ].join("\n"),
      "utf8",
    );

    const events: QueryEvent[] = [];
    for await (const event of streamMvpIntegratedFlow({
      sessionId: "sess_t10_repo_aware_explain",
      prompt: "In this repository, explain how runFlow works in src/flow.ts",
      workspaceRoot,
      maxTurns: 6,
    })) {
      events.push(event);
    }

    const completed = events.find(
      (event): event is Extract<QueryEvent, { type: "query.completed" }> =>
        event.type === "query.completed",
    );
    expect(completed?.result.status).toBe("completed");
    expect(completed?.result.sharedContext.notes.join("\n")).toContain(
      "plan: intent=repo-explain",
    );
    expect(completed?.result.sharedContext.notes.join("\n")).toContain(
      "tool: approved glob(",
    );
    expect(completed?.result.sharedContext.notes.join("\n")).toContain(
      "tool: read diagnosis evidence",
    );
    expect(completed?.result.codingResult?.taskKind).toBe("repo-explain");
    expect(completed?.result.codingResult?.diagnosis?.disposition).toBe(
      "grounded-explanation",
    );
    expect(
      completed?.result.codingResult?.diagnosis?.evidenceFiles.length ?? 0,
    ).toBeGreaterThan(0);
  }, 15000);

  it("routes runtime why/how questions to repo diagnosis instead of generic chat", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-routing-runtime-diagnosis" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "sessionRuntime.ts"),
      [
        "export function resumeFromPendingPrompt() {",
        "  return 'resume';",
        "}",
      ].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_routing_runtime_diagnosis",
      prompt: "为什么 session resume 能从 pending prompt 继续？",
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "plan: intent=repo-explain",
    );
    expect(result.codingResult?.taskKind).toBe("repo-explain");
  }, 15000);

  it("keeps current-directory write requests on write-file intent instead of workspace-info", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-routing-current-dir-write" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_routing_current_dir_write",
      prompt: '在当前目录下创建 helloworld.py，内容是 print("hello world")',
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=write-file");
    expect(mergedNotes).not.toContain("workspace-info:");
    expect(result.codingResult?.taskKind).toBe("write-file");
    expect(result.codingResult?.changedFiles).toContain("helloworld.py");

    const created = await fs.readFile(path.join(workspaceRoot, "helloworld.py"), "utf8");
    expect(created.length).toBeGreaterThan(0);
  }, 15000);

  it("classifies symptom-oriented repo diagnosis as needs-verification with grounded evidence", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-repo-diagnosis-needs-verify" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "service.ts"),
      [
        "export function runService(flag: boolean) {",
        "  if (!flag) throw new Error('boom');",
        "  return 'ok';",
        "}",
      ].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_repo_diagnosis_needs_verify",
      prompt: "Why does this repository intermittently fail with boom errors?",
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("repo-explain");
    expect(result.codingResult?.diagnosis?.disposition).toBe(
      "needs-verification",
    );
    expect(result.codingResult?.taskSatisfaction.verdict).toBe(
      "completed-with-caveats",
    );
    expect(result.sharedContext.notes.join("\n")).toContain(
      "diagnosis: disposition=needs-verification",
    );
  }, 15000);

  it("verifies write intent with readback in the same coding contract", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-write-readback-verify" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_write_readback_verify",
      prompt: "Create a python script at scripts/verify.py",
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=write-file");
    expect(mergedNotes).toContain("tool: wrote file scripts/verify.py");
    expect(mergedNotes).toContain(
      "tool: verified write readback scripts/verify.py",
    );
    expect(mergedNotes).toContain("verify: skipped");
    expect(result.codingResult?.taskKind).toBe("write-file");
    expect(result.codingResult?.changedFiles).toContain("scripts/verify.py");
    expect(result.codingResult?.verification.status).toBe("not-requested");
  }, 15000);

  it("executes edit workflow with diff evidence and explicit verify command", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-edit-verify-contract" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "edit-target.ts"),
      "export const version = 'v1';\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_edit_verify_contract",
      prompt:
        "Edit src/edit-target.ts and replace v1 with v2, then run node --version to verify",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=edit-file");
    expect(mergedNotes).toContain("tool: edited file src/edit-target.ts");
    expect(mergedNotes).toContain(
      "tool: verified edit readback src/edit-target.ts",
    );
    expect(mergedNotes).toContain("verify: command node --version succeeded");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.changedFiles).toContain("src/edit-target.ts");
    expect(result.codingResult?.verification.status).toBe("passed");
    expect(result.codingResult?.verification.command).toBe("node --version");
    expect(result.codingResult?.taskSatisfaction.verdict).toBe("satisfied");
    expect(result.codingResult?.evidence.length).toBeGreaterThan(0);
    expect(
      result.codingResult?.evidence.some((entry) =>
        entry.startsWith("patch:src/edit-target.ts"),
      ),
    ).toBe(true);

    const edited = await fs.readFile(
      path.join(workspaceRoot, "src", "edit-target.ts"),
      "utf8",
    );
    expect(edited).toContain("v2");
    expect(edited).not.toContain("v1");
  }, 15000);

  it("fails edit workflow with explicit patch failure code when target fragment is missing", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-edit-failure-contract" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "failure-target.ts"),
      "export const value = 'stable';\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_edit_failure_contract",
      prompt: "Edit src/failure-target.ts and replace missing-token with fixed",
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toContain("patch failed (target-not-found)");
  }, 15000);

  it("recovers ambiguous replace target via bounded repair in the same coding contract", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-edit-ambiguous-target" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "ambiguous.ts"),
      [
        "export const markerA = 'v1';",
        "export const markerB = 'v1';",
      ].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_edit_ambiguous_target",
      prompt: "Edit src/ambiguous.ts and replace v1 with v2",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.repair.status).toBe("recovered");
    expect(result.codingResult?.repair.attempts).toBeGreaterThan(0);
    expect(result.codingResult?.continuation.status).toBe(
      "recovered-after-continuation",
    );
    expect(result.codingResult?.continuation.attempts).toBeGreaterThan(0);
    expect(
      result.codingResult?.continuation.evidence.some((entry) =>
        entry.includes("target-not-unique"),
      ),
    ).toBe(true);
    expect(result.codingResult?.repair.recoveredItems).toContain(
      "src/ambiguous.ts",
    );
    expect(result.codingResult?.changedFiles).toContain("src/ambiguous.ts");
    const updated = await fs.readFile(
      path.join(workspaceRoot, "src", "ambiguous.ts"),
      "utf8",
    );
    expect(updated).toContain("markerA = 'v2'");
    expect(updated).toContain("markerB = 'v1'");
  }, 15000);

  it("replans continuation repair from prior failure evidence instead of replaying the same patch", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-continuation-replan-from-evidence" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "repair.ts"),
      "export const value = 'legacy';\n",
      "utf8",
    );

    const composedPrompt = [
      "Continue fixing this and do not use the previous wrong direction.",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/repair.ts",
      "- recent-failed-files: src/repair.ts (patch failed (patch-generation-failed): generated patch produced no content changes)",
      "- unresolved-items: failed-files:src/repair.ts (patch failed (patch-generation-failed): generated patch produced no content changes)",
      "- last-continuation-evidence: transform:src/repair.ts:legacy=>modern",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_continuation_replan_from_evidence",
      prompt: composedPrompt,
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.continuation.status).toBe(
      "recovered-after-continuation",
    );
    expect(result.codingResult?.repair.status).toBe("recovered");
    expect(result.codingResult?.changedFiles).toContain("src/repair.ts");

    const updated = await fs.readFile(
      path.join(workspaceRoot, "src", "repair.ts"),
      "utf8",
    );
    expect(updated).toContain("'modern'");
    expect(updated).not.toContain("'legacy'");
  }, 15000);

  it("supports batch edit across multiple files with aggregated verify result", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-batch-edit-success" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "a.ts"),
      "export const version = 'v1';\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "b.ts"),
      "export const version = 'v1';\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_batch_edit_success",
      prompt:
        "Edit src/a.ts src/b.ts and replace v1 with v2, then run node --version to verify",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.changedFiles).toEqual(
      expect.arrayContaining(["src/a.ts", "src/b.ts"]),
    );
    expect(result.codingResult?.failedFiles).toEqual([]);
    expect(result.codingResult?.verification.status).toBe("passed");
    expect(result.codingResult?.verifiedFiles).toEqual(
      expect.arrayContaining(["src/a.ts", "src/b.ts"]),
    );
    expect(result.codingResult?.unverifiedFiles).toEqual([]);
    expect(result.codingResult?.patches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/a.ts",
          status: "applied",
          operation: "replace",
        }),
        expect.objectContaining({
          path: "src/b.ts",
          status: "applied",
          operation: "replace",
        }),
      ]),
    );

    const aContent = await fs.readFile(path.join(workspaceRoot, "src", "a.ts"), "utf8");
    const bContent = await fs.readFile(path.join(workspaceRoot, "src", "b.ts"), "utf8");
    expect(aContent).toContain("v2");
    expect(bContent).toContain("v2");
  }, 15000);

  it("builds git-aware change set attribution and separates pre-existing dirty files", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-git-aware-change-set" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "preexisting.ts"),
      "export const marker = 'legacy';\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "target.ts"),
      "export const marker = 'v1';\n",
      "utf8",
    );

    spawnSync("git", ["init"], { cwd: workspaceRoot, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "test@example.com"], {
      cwd: workspaceRoot,
      stdio: "ignore",
    });
    spawnSync("git", ["config", "user.name", "Test Runner"], {
      cwd: workspaceRoot,
      stdio: "ignore",
    });
    spawnSync("git", ["add", "."], { cwd: workspaceRoot, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], {
      cwd: workspaceRoot,
      stdio: "ignore",
    });

    await fs.writeFile(
      path.join(workspaceRoot, "src", "preexisting.ts"),
      "export const marker = 'dirty-before-run';\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_git_aware_change_set",
      prompt: "Edit src/target.ts and replace v1 with v2",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.changeSet.gitAware).toBe(true);
    expect(result.codingResult?.changeSet.preExistingDirtyFiles).toContain(
      "src/preexisting.ts",
    );
    expect(result.codingResult?.changeSet.attemptedFiles).toContain(
      "src/target.ts",
    );
    expect(result.codingResult?.changeSet.changedFiles).toContain(
      "src/target.ts",
    );
    expect(result.codingResult?.changeSet.changedFiles).not.toContain(
      "src/preexisting.ts",
    );
    expect(
      result.codingResult?.changeSet.unchangedAttemptedFiles.includes(
        "src/target.ts",
      ),
    ).toBe(false);
  }, 20000);

  it("auto-selects focused verify for test-only edits without explicit verify command", async () => {
    await fs.mkdir(path.join(workspaceRoot, "tests"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-targeted-verify-focused" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "tests", "sample.test.ts"),
      "export const marker = 'v1';\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_targeted_verify_focused",
      prompt: "Edit tests/sample.test.ts and replace v1 with v2",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.verification.status).toBe("passed");
    expect(result.codingResult?.verification.command).toBe("node --version");
    expect(result.codingResult?.verification.selectionScope).toBe("focused");
    expect(result.codingResult?.verification.selectionSource).toBe(
      "auto-from-changes",
    );
  }, 15000);

  it("auto-selects broader verify for source edits without explicit verify command", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-targeted-verify-broader" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "sample.ts"),
      "export const marker = 'v1';\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_targeted_verify_broader",
      prompt: "Edit src/sample.ts and replace v1 with v2",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.verification.status).toBe("passed");
    expect(result.codingResult?.verification.command).toBe("node --version");
    expect(result.codingResult?.verification.selectionScope).toBe("broader");
    expect(result.codingResult?.verification.selectionSource).toBe(
      "auto-from-changes",
    );
  }, 15000);

  it("fails verify only after bounded retry attempts and records repair failure boundary", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-verify-bounded-retry-failure" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "verify-target.ts"),
      "export const marker = 'v1';\n",
      "utf8",
    );

    const events: QueryEvent[] = [];
    for await (const event of streamMvpIntegratedFlow({
      sessionId: "sess_t10_verify_bounded_retry_failure",
      prompt:
        "Edit src/verify-target.ts and replace v1 with v2, then run npm run build -- --help to verify",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    })) {
      events.push(event);
    }

    const approvalResolves = events.filter(
      (event): event is Extract<QueryEvent, { type: "approval.resolved" }> =>
        event.type === "approval.resolved",
    );
    const failedToolResults = events.filter(
      (event): event is Extract<QueryEvent, { type: "tool.result" }> =>
        event.type === "tool.result" && event.success === false,
    );
    const completed = events.find(
      (event): event is Extract<QueryEvent, { type: "query.completed" }> =>
        event.type === "query.completed",
    );

    expect(approvalResolves.length).toBeGreaterThanOrEqual(2);
    expect(approvalResolves.every((event) => event.outcome === "approved")).toBe(
      true,
    );
    expect(failedToolResults.length).toBeGreaterThanOrEqual(2);
    expect(completed?.result.status).toBe("stopped_error");
    expect(completed?.result.terminalClassification).toBe("error");
    expect(completed?.result.stopReason).toContain(
      "Verification command failed after 2 attempts",
    );
    expect(completed?.result.stopReason).not.toContain("Approval denied by user");
  }, 15000);

  it("skips targeted verify with explicit reason when changed files do not map to allowlisted verify commands", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-targeted-verify-skip" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "README.md"),
      "version: v1\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_targeted_verify_skip",
      prompt: "Edit README.md and replace v1 with v2",
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.verification.status).toBe("skipped");
    expect(result.codingResult?.verification.selectionScope).toBe("none");
    expect(result.codingResult?.verification.selectionSource).toBe(
      "auto-from-changes",
    );
    expect(result.codingResult?.verification.reason).toContain(
      "targeted verification skipped",
    );
    expect(result.codingResult?.taskSatisfaction.verdict).toBe(
      "completed-with-caveats",
    );
    expect(result.codingResult?.unverifiedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "README.md" }),
      ]),
    );
  }, 15000);

  it("grounds write content and completes when write target already exists", async () => {
    await fs.mkdir(path.join(workspaceRoot, "scripts"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-task-satisfaction-insufficient" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "scripts", "hello.py"),
      "print('hello')\n",
      "utf8",
    );

    spawnSync("git", ["init"], { cwd: workspaceRoot, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "test@example.com"], {
      cwd: workspaceRoot,
      stdio: "ignore",
    });
    spawnSync("git", ["config", "user.name", "Test Runner"], {
      cwd: workspaceRoot,
      stdio: "ignore",
    });
    spawnSync("git", ["add", "."], { cwd: workspaceRoot, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], {
      cwd: workspaceRoot,
      stdio: "ignore",
    });

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_task_satisfaction_insufficient",
      prompt: "Create a python script at scripts/hello.py",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.finalOutput).toContain("Write completed: scripts/hello.py");
    expect(result.finalOutput).toContain("Content grounding:");
    expect(result.codingResult?.changeSet.changedFiles).toContain(
      "scripts/hello.py",
    );
  }, 20000);

  it("returns deterministic failure boundary for partial batch edit failure", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-batch-edit-partial-failure" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "ok.ts"),
      "export const version = 'v1';\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_batch_edit_partial_failure",
      prompt:
        "Edit src/ok.ts src/missing.ts and replace v1 with v2",
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toContain("Batch edit partially failed.");
    expect(result.stopReason).toContain("Edited: src/ok.ts");
    expect(result.stopReason).toContain("Failed: src/missing.ts");
  }, 15000);

  it("discovers candidate files for edit when prompt has no explicit file paths", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-discovery-edit-success" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "featureA.ts"),
      "export const marker = 'v1';\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "featureB.ts"),
      "export const marker = 'v1';\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "ignore.ts"),
      "export const marker = 'v3';\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_discovery_edit_success",
      prompt: "Edit this repository and replace v1 with v2, then run node --version to verify",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.changedFiles.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(result.codingResult?.verification.status).toBe("passed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "discovery: selected",
    );

    const featureA = await fs.readFile(
      path.join(workspaceRoot, "src", "featureA.ts"),
      "utf8",
    );
    const featureB = await fs.readFile(
      path.join(workspaceRoot, "src", "featureB.ts"),
      "utf8",
    );
    expect(featureA).toContain("v2");
    expect(featureB).toContain("v2");
  }, 15000);

  it("fails clearly when discovery finds no editable candidate files", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-discovery-edit-failure" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "featureA.ts"),
      "export const marker = 'v3';\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_discovery_edit_failure",
      prompt: "Edit this repository and replace missing-token with v2",
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toContain(
      "No candidate files discovered for edit workflow",
    );
  }, 15000);

  it("keeps simple conversational prompts in chat path without bash approval fatigue", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-chat-no-preflight" }, null, 2),
      "utf8",
    );

    const events: QueryEvent[] = [];
    for await (const event of streamMvpIntegratedFlow({
      sessionId: "sess_t10_chat_no_preflight",
      prompt: "hello",
      workspaceRoot,
      maxTurns: 6,
    })) {
      events.push(event);
    }

    const approvalRequested = events.find(
      (event): event is Extract<QueryEvent, { type: "approval.requested" }> =>
        event.type === "approval.requested",
    );
    const toolStarted = events.find(
      (event): event is Extract<QueryEvent, { type: "tool.started" }> =>
        event.type === "tool.started",
    );
    const completed = events.find(
      (event): event is Extract<QueryEvent, { type: "query.completed" }> =>
        event.type === "query.completed",
    );

    expect(approvalRequested).toBeUndefined();
    expect(toolStarted).toBeUndefined();
    expect(completed?.result.status).toBe("completed");
    expect(completed?.result.terminalClassification).toBe("success");
    expect(completed?.result.sharedContext.notes.join("\n")).toContain(
      "tool: skipped (chat intent)",
    );
  }, 15000);

  it("keeps approval semantics explicit when bash execution fails after approval", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-approved-exec-failure" }, null, 2),
      "utf8",
    );

    const events: QueryEvent[] = [];
    for await (const event of streamMvpIntegratedFlow({
      sessionId: "sess_t10_approved_exec_failure",
      prompt: "Run build command help for this workspace",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    })) {
      events.push(event);
    }

    const approvalResolved = events.find(
      (event): event is Extract<QueryEvent, { type: "approval.resolved" }> =>
        event.type === "approval.resolved",
    );
    const toolResult = events.find(
      (event): event is Extract<QueryEvent, { type: "tool.result" }> =>
        event.type === "tool.result",
    );
    const completed = events.find(
      (event): event is Extract<QueryEvent, { type: "query.completed" }> =>
        event.type === "query.completed",
    );

    expect(approvalResolved?.outcome).toBe("approved");
    expect(toolResult?.success).toBe(false);
    expect(completed?.result.status).toBe("stopped_error");
    expect(completed?.result.terminalClassification).toBe("error");
    expect(completed?.result.stopReason).toContain(
      "Bash execution failed after approval",
    );
    expect(completed?.result.stopReason).not.toContain(
      "Approval denied by user",
    );
  }, 15000);

  it("fails fast when real provider mode has no API key", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-real-provider"}\n',
      "utf8",
    );

    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const result = await runMvpIntegratedFlow({
        sessionId: "sess_t10_real_provider_missing_key",
        prompt: "Implement a real task path",
        workspaceRoot,
        escalationDecision: "allow-once",
        providerMode: "real",
        maxTurns: 6,
      });

      expect(result.status).toBe("stopped_error");
      expect(result.terminalClassification).toBe("error");
      expect(result.stopReason).toContain(
        "OPENAI_API_KEY is required for the real provider path",
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  }, 15000);

  it("keeps planner/coder/reviewer provider semantics aligned in real mode", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-real-provider-aligned"}\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-real-provider-key";

    const originalFetch = globalThis.fetch;
    const authHeaders: string[] = [];
    let callIndex = 0;

    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        callIndex += 1;
        const headers = init?.headers as Record<string, string> | undefined;
        authHeaders.push(headers?.authorization ?? "");

        const body =
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [
              { delta: { content: `REAL_PROVIDER_CALL_${callIndex}` } },
            ],
          })}\n\n` +
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: "" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })}\n\n` +
          "data: [DONE]\n\n";

        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    ) as typeof fetch;

    try {
      const result = await runMvpIntegratedFlow({
        sessionId: "sess_t10_real_provider_aligned",
        prompt: "List TypeScript files for this workspace",
        workspaceRoot,
        escalationDecision: "allow-once",
        providerMode: "real",
        maxTurns: 6,
      });

      expect(result.status).toBe("completed");
      expect(result.transcript.map((turn) => turn.role)).toEqual([
        "planner",
        "coder",
        "reviewer",
      ]);
      expect(result.transcript[0]?.content).toContain("REAL_PROVIDER_CALL_1");
      expect(result.transcript[1]?.content).toContain("REAL_PROVIDER_CALL_2");
      expect(result.transcript[2]?.content).toContain("REAL_PROVIDER_CALL_3");
      expect(result.finalOutput).toContain("REAL_PROVIDER_CALL_3");

      expect(callIndex).toBe(3);
      expect(authHeaders).toEqual([
        "Bearer test-real-provider-key",
        "Bearer test-real-provider-key",
        "Bearer test-real-provider-key",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  }, 15000);

  it("uses custom base URL and model for openai-compatible real providers", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-openai-compatible"}\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const originalFetch = globalThis.fetch;
    const requestUrls: string[] = [];
    const requestBodies: Array<Record<string, unknown>> = [];
    let callIndex = 0;

    globalThis.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrls.push(String(input));
        if (String(input).endsWith("/models")) {
          return new Response("ok", { status: 200 });
        }

        if (init?.body) {
          requestBodies.push(
            JSON.parse(String(init.body)) as Record<string, unknown>,
          );
        }

        callIndex += 1;

        const body =
          `data: ${JSON.stringify({
            model: "deepseek-ai/DeepSeek-V3",
            choices: [{ delta: { content: `COMPATIBLE_CALL_${callIndex}` } }],
          })}\n\n` +
          `data: ${JSON.stringify({
            model: "deepseek-ai/DeepSeek-V3",
            choices: [{ delta: { content: "" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })}\n\n` +
          "data: [DONE]\n\n";

        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    ) as typeof fetch;

    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-compatible-key";

    try {
      const result = await runMvpIntegratedFlow({
        sessionId: "sess_t10_openai_compatible",
        prompt: "List TypeScript files for this workspace",
        workspaceRoot,
        escalationDecision: "allow-once",
        providerMode: "real",
        maxTurns: 6,
        realProvider: {
          provider: "openai-compatible",
          apiKey: "test-compatible-key",
          baseUrl: "https://api.siliconflow.cn/v1/",
          model: "deepseek-ai/DeepSeek-V3",
        },
      });

      expect(result.status).toBe("completed");
      expect(result.transcript.map((turn) => turn.role)).toEqual([
        "planner",
        "coder",
        "reviewer",
      ]);
      expect(result.finalOutput).toContain("COMPATIBLE_CALL_3");
      expect(
        requestUrls.every(
          (url) => url === "https://api.siliconflow.cn/v1/chat/completions",
        ),
      ).toBe(true);
      expect(
        requestBodies.every((body) => body.model === "deepseek-ai/DeepSeek-V3"),
      ).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  }, 15000);

  it("retries a transient openai-compatible draft-stream network failure before terminalizing the run", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-openai-compatible-retry"}\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const originalFetch = globalThis.fetch;
    const requestUrls: string[] = [];
    const requestBodies: Array<Record<string, unknown>> = [];
    let modelsCallCount = 0;
    let chatCallCount = 0;
    let firstChatAttempt = true;

    globalThis.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrls.push(String(input));
        if (String(input).endsWith("/models")) {
          modelsCallCount += 1;
          return new Response("ok", { status: 200 });
        }

        if (init?.body) {
          requestBodies.push(
            JSON.parse(String(init.body)) as Record<string, unknown>,
          );
        }

        chatCallCount += 1;
        if (firstChatAttempt) {
          firstChatAttempt = false;
          throw new TypeError("fetch failed");
        }

        const body =
          `data: ${JSON.stringify({
            model: "deepseek-ai/DeepSeek-V3",
            choices: [{ delta: { content: `COMPATIBLE_CALL_${chatCallCount}` } }],
          })}\n\n` +
          `data: ${JSON.stringify({
            model: "deepseek-ai/DeepSeek-V3",
            choices: [{ delta: { content: "" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })}\n\n` +
          "data: [DONE]\n\n";

        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    ) as typeof fetch;

    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-compatible-key";

    try {
      const result = await runMvpIntegratedFlow({
        sessionId: "sess_t10_openai_compatible_retry",
        prompt: "List TypeScript files for this workspace",
        workspaceRoot,
        escalationDecision: "allow-once",
        providerMode: "real",
        maxTurns: 6,
        realProvider: {
          provider: "openai-compatible",
          apiKey: "test-compatible-key",
          baseUrl: "https://api.siliconflow.cn/v1/",
          model: "deepseek-ai/DeepSeek-V3",
        },
      });

      expect(result.status).toBe("completed");
      expect(result.transcript.map((turn) => turn.role)).toEqual([
        "planner",
        "coder",
        "reviewer",
      ]);
      expect(result.finalOutput).toContain("COMPATIBLE_CALL_4");
      expect(modelsCallCount).toBe(0);
      expect(chatCallCount).toBe(4);
      expect(
        requestUrls.every((url) =>
          url === "https://api.siliconflow.cn/v1/chat/completions" ||
          url === "https://api.siliconflow.cn/v1/models",
        ),
      ).toBe(true);
      expect(
        requestBodies.every((body) => body.model === "deepseek-ai/DeepSeek-V3"),
      ).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  }, 15000);

  it("promotes weak-evidence corrective continuation into executable repair instead of continuity summary", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-evidence-repair"}\n',
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "fix-target.md");
    await fs.writeFile(
      targetPath,
      "mode=legacy\n",
      "utf8",
    );

    const prompt = [
      "That is not the right fix. Continue and fix the real issue.",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/fix-target.md",
      "- recent-failed-files: src/fix-target.md (patch failed (patch-generation-failed): unable to infer deterministic edit transform from prompt)",
      "- last-continuation-evidence: transform:src/fix-target.md:mode=legacy=>mode=modern",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_evidence_repair",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=edit-file");
    expect(mergedNotes).toContain("repair: continuation re-plan applied");
    expect(result.finalOutput).not.toContain("Continuation context summary");
    expect(await fs.readFile(targetPath, "utf8")).toContain("mode=modern");
  }, 15000);

  it("avoids repeating the previous direction for same-file corrective continuation when alternate transforms exist", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-evidence-alternate-transform"}\n',
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "repair-target.md");
    await fs.writeFile(
      targetPath,
      "mode=legacy\n",
      "utf8",
    );

    const prompt = [
      "Same file, but not that change. Continue and fix the real issue.",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/repair-target.md",
      "- recent-failed-files: src/repair-target.md (patch failed (patch-generation-failed): unable to infer deterministic edit transform from prompt)",
      "- last-continuation-evidence: transform:src/repair-target.md:mode=legacy=>mode=wrong | transform:src/repair-target.md:mode=legacy=>mode=right",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_evidence_alternate_transform",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=edit-file");
    expect(mergedNotes).toContain("repair: continuation re-plan applied");
    const content = await fs.readFile(targetPath, "utf8");
    expect(content).toContain("mode=right");
    expect(content).not.toContain("mode=wrong");
  }, 15000);

  it("activates same-file edit lineage slot for weak/no-cue follow-up when slot confidence is high", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-slot-activation"}\n',
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "weak-slot.txt");
    await fs.writeFile(targetPath, "alpha\nbeta\n", "utf8");

    const prompt = [
      "keep going",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/weak-slot.txt",
      "- recent-failed-files: src/weak-slot.txt (patch failed (patch-generation-failed): retry pending)",
      "- last-continuation-evidence: continuation-lineage-active:src/weak-slot.txt::edit::alpha=>alpha1 | continuation-lineage-slot:src/weak-slot.txt::edit::alpha=>alpha1 | transform:src/weak-slot.txt:alpha=>alpha1",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_slot_activation",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.changedFiles).toContain("src/weak-slot.txt");
    expect(result.codingResult?.evidence).toContain(
      "continuation-lineage-activation:same-file-slot",
    );
    expect(result.codingResult?.evidence).toContain(
      "continuation-lineage-activation-mode:weak-shape",
    );
    expect(await fs.readFile(targetPath, "utf8")).toContain("alpha1");
  }, 15000);

  it("returns clarify for weak/no-cue follow-up when same-file slot confidence is low", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-slot-clarify"}\n',
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "weak-slot-ambiguous.txt");
    await fs.writeFile(targetPath, "value=one\n", "utf8");

    const prompt = [
      "do it",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/weak-slot-ambiguous.txt",
      "- last-continuation-evidence: continuation-lineage-active:src/weak-slot-ambiguous.txt::edit::value=one=>value=two | continuation-lineage-slot:src/weak-slot-ambiguous.txt::edit::value=one=>value=two | continuation-lineage-slot:src/weak-slot-ambiguous.txt::read::*",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_slot_clarify",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toContain("ambiguous across multiple subtask slots");
    expect(result.codingResult?.evidence).toContain(
      "continuation-lineage-activation-clarify:same-file-slot",
    );
    expect(result.codingResult?.evidence).toContain(
      "continuation-lineage-slot-confidence:low",
    );
  }, 15000);

  it("keeps plain chat at chat-boundary even with same-file active slot history", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-slot-chat-boundary"}\n',
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "weak-slot-chat.txt");
    await fs.writeFile(targetPath, "value=one\n", "utf8");

    const prompt = [
      "thanks for the help",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/weak-slot-chat.txt",
      "- last-continuation-evidence: continuation-lineage-active:src/weak-slot-chat.txt::edit::value=one=>value=two | continuation-lineage-slot:src/weak-slot-chat.txt::edit::value=one=>value=two",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_slot_chat_boundary",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=chat");
    expect(await fs.readFile(targetPath, "utf8")).toBe("value=one\n");
  }, 15000);

  it("activates cross-file continuation candidate for weak/no-cue follow-up when reopen candidate is unique", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-cross-file-activation"}\n',
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "cross-weak.txt");
    await fs.writeFile(targetPath, "alpha\n", "utf8");

    const prompt = [
      "keep going",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/cross-weak.txt",
      "- recent-failed-files: src/cross-weak.txt (patch failed (patch-generation-failed): retry pending)",
      "- last-continuation-evidence: repair-remaining-files:src/cross-weak.txt | reopen-candidates:src/cross-weak.txt | transform:src/cross-weak.txt:alpha=>alpha1",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_cross_file_activation",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.changedFiles).toContain("src/cross-weak.txt");
    expect(result.codingResult?.evidence).toContain(
      "continuation-lineage-activation:cross-file-candidate",
    );
    expect(result.codingResult?.evidence).toContain(
      "continuation-lineage-activation-mode:weak-shape",
    );
    expect(await fs.readFile(targetPath, "utf8")).toContain("alpha1");
  }, 15000);

  it("returns blocker disambiguation for weak/no-cue follow-up when cross-file reopen candidates are ambiguous", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-cross-file-blocker"}\n',
      "utf8",
    );
    await fs.writeFile(path.join(workspaceRoot, "src", "cross-a.txt"), "value=a\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "src", "cross-b.txt"), "value=b\n", "utf8");

    const prompt = [
      "do it",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/cross-a.txt,src/cross-b.txt",
      "- last-continuation-evidence: repair-remaining-files:src/cross-a.txt,src/cross-b.txt | reopen-candidates:src/cross-a.txt,src/cross-b.txt | repair-failed-files:src/cross-a.txt::patch-generation-failed::retry pending",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_cross_file_blocker",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toContain("multiple candidate targets");
    expect(result.codingResult?.evidence).toContain(
      "continuation-lineage-activation-clarify:cross-file-candidate",
    );
    expect(result.codingResult?.evidence).toContain(
      "continuation-lineage-slot-confidence:low",
    );
  }, 15000);

  it("keeps plain chat at chat-boundary with cross-file remaining history", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-cross-file-chat"}\n',
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "cross-chat.txt");
    await fs.writeFile(targetPath, "value=keep\n", "utf8");

    const prompt = [
      "thanks for checking",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/cross-chat.txt",
      "- last-continuation-evidence: repair-remaining-files:src/cross-chat.txt | reopen-candidates:src/cross-chat.txt | repair-failed-files:src/cross-chat.txt::patch-generation-failed::retry pending",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_cross_file_chat_boundary",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=chat");
    expect(await fs.readFile(targetPath, "utf8")).toBe("value=keep\n");
  }, 15000);

  it("blocks command intents outside MVP allowlist with actionable stopped_error", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-blocked-command"}\n',
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_blocked_command",
      prompt: "Run npm publish for this project now",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toContain(
      "Run-command intent is not allowed in the MVP allowlist",
    );
    expect(result.stopReason).toContain("Allowed commands:");

    // Blocked command should terminate before coder output is committed.
    expect(result.transcript.map((turn) => turn.role)).toEqual(["planner"]);
  }, 15000);
});
