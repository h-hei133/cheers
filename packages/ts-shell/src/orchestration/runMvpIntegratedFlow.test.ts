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
    expect(result.codingResult?.evidence).toContain("current-permission-request-tool:write");
    expect(result.codingResult?.evidence).toContain("current-permission-request-operation:write");
    expect(
      result.codingResult?.evidence.some((entry) =>
        entry.startsWith("current-permission-request-scope-label:write/write/target("),
      ),
    ).toBe(true);
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
    expect(result.codingResult?.evidence).toContain("current-permission-request-tool:edit");
    expect(result.codingResult?.evidence).toContain("current-permission-request-operation:write");
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

  it("runs low-risk content verification after a file edit", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_low_risk_content_verify",
      prompt:
        "Create file verify_note.txt with exactly:\n```text\nalpha\nbeta\n```\nVerify the file contains beta.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.taskKind).toBe("write-file");
    expect(result.codingResult?.changedFiles).toContain("verify_note.txt");
    expect(result.codingResult?.verification.status).toBe("passed");
    expect(result.codingResult?.verification.reason).toContain(
      "content verification passed",
    );
    expect(result.codingResult?.verifiedFiles).toContain("verify_note.txt");
    await expect(
      fs.readFile(path.join(workspaceRoot, "verify_note.txt"), "utf8"),
    ).resolves.toContain("beta");
  }, 15000);

  it("runs low-risk multi-file consistency verification after a file edit", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "todo.txt"),
      "ship minimal CLI smoke\ndocument one follow-up\nverify multi-file follow-up\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "plan.txt"),
      "Plan\n1. ship minimal CLI smoke\n2. document one follow-up\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_low_risk_multifile_verify",
      prompt:
        "Update plan.txt with exactly:\n```text\nPlan\n1. ship minimal CLI smoke\n2. document one follow-up\n3. verify multi-file follow-up\n```\nVerify todo.txt and plan.txt stay consistent.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.codingResult?.changedFiles).toContain("plan.txt");
    expect(result.codingResult?.verification.status).toBe("passed");
    expect(result.codingResult?.verification.reason).toContain(
      "multi-file consistency verification passed",
    );
    expect(result.codingResult?.verifiedFiles).toEqual(
      expect.arrayContaining(["todo.txt", "plan.txt"]),
    );
  }, 15000);

  it("keeps multi-file consistency source separate from append target", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "todo.txt"),
      "ship minimal CLI smoke\ndocument one follow-up\nverify multi-file follow-up\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "plan.txt"),
      "Plan\n1. ship minimal CLI smoke\n2. document one follow-up\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_low_risk_multifile_append_target",
      prompt:
        "Append to plan.txt with content: verify multi-file follow-up. Verify todo.txt and plan.txt stay consistent.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toContain("plan.txt");
    expect(result.codingResult?.changedFiles).not.toContain("todo.txt");
    expect(result.codingResult?.verification.status).toBe("passed");
    expect(result.codingResult?.verifiedFiles).toEqual(
      expect.arrayContaining(["todo.txt", "plan.txt"]),
    );
    await expect(
      fs.readFile(path.join(workspaceRoot, "plan.txt"), "utf8"),
    ).resolves.toContain("verify multi-file follow-up");
  }, 15000);

  it("verifies constrained multi-file code edits preserve protected files", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    const initialUtils = [
      'export function greet(name = "world") {',
      '  return "Hello, " + name;',
      '}',
      '',
    ].join("\n");
    const initialReadme = "Use greet() to say hello.\n";
    await fs.writeFile(path.join(workspaceRoot, "utils.js"), initialUtils, "utf8");
    await fs.writeFile(path.join(workspaceRoot, "README.md"), initialReadme, "utf8");

    const readmeTurn = await runMvpIntegratedFlow({
      sessionId: "sess_t10_constrained_code_readme",
      prompt:
        'Only modify README.md. Do NOT change utils.js. Add a Usage section showing: greet() and greet("Ada"). Then verify README.md contains greet() and README.md contains greet("Ada") and utils.js is unchanged.',
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(readmeTurn.status).toBe("completed");
    expect(readmeTurn.codingResult?.changedFiles).toContain("README.md");
    expect(readmeTurn.codingResult?.changedFiles).not.toContain("utils.js");
    expect(readmeTurn.codingResult?.verification.status).toBe("passed");
    expect(readmeTurn.codingResult?.verification.reason).toContain(
      "utils.js unchanged",
    );
    await expect(
      fs.readFile(path.join(workspaceRoot, "utils.js"), "utf8"),
    ).resolves.toBe(initialUtils);
    await expect(
      fs.readFile(path.join(workspaceRoot, "README.md"), "utf8"),
    ).resolves.toEqual(expect.stringContaining('greet("Ada")'));

    const readmeAfterTurn = await fs.readFile(
      path.join(workspaceRoot, "README.md"),
      "utf8",
    );
    const utilsTurn = await runMvpIntegratedFlow({
      sessionId: "sess_t10_constrained_code_utils",
      prompt:
        "Now only modify utils.js. Do NOT change README.md. Add a new exported function: shout(message) returns message.toUpperCase(). Then verify utils.js contains shout and README.md is unchanged.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(utilsTurn.status).toBe("completed");
    expect(utilsTurn.codingResult?.changedFiles).toContain("utils.js");
    expect(utilsTurn.codingResult?.changedFiles).not.toContain("README.md");
    expect(utilsTurn.codingResult?.verification.status).toBe("passed");
    expect(utilsTurn.codingResult?.verification.reason).toContain(
      "README.md unchanged",
    );
    await expect(
      fs.readFile(path.join(workspaceRoot, "README.md"), "utf8"),
    ).resolves.toBe(readmeAfterTurn);
    const utilsAfterTurn = await fs.readFile(
      path.join(workspaceRoot, "utils.js"),
      "utf8",
    );
    expect(utilsAfterTurn).toContain("export function shout(message)");
    expect(utilsAfterTurn).toContain("message.toUpperCase()");
  }, 15000);

  it("runs a constrained small refactor and keeps usage/protected files in sync", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    const initialLocked = "Do not modify this file.\n";
    await fs.writeFile(
      path.join(workspaceRoot, "utils.js"),
      [
        'export function greet(name = "world") {',
        '  return "Hello, " + name;',
        '}',
        '',
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "app.js"),
      'import { greet } from "./utils.js";\n\nexport const message = greet("Ada");\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "README.md"),
      'Use greet("Ada") to say hello.\n',
      "utf8",
    );
    await fs.writeFile(path.join(workspaceRoot, "LOCKED.md"), initialLocked, "utf8");

    const refactorTurn = await runMvpIntegratedFlow({
      sessionId: "sess_t10_constrained_refactor_turn1",
      prompt:
        'Rename exported function greet to welcome. Update utils.js, app.js, and README.md so they consistently use welcome. Do NOT modify LOCKED.md. Verify utils.js contains export function welcome and app.js contains welcome and README.md contains welcome("Ada") and LOCKED.md is unchanged.',
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(refactorTurn.status).toBe("completed");
    expect(refactorTurn.codingResult?.changedFiles).toEqual(
      expect.arrayContaining(["utils.js", "app.js", "README.md"]),
    );
    expect(refactorTurn.codingResult?.changedFiles).not.toContain("LOCKED.md");
    expect(refactorTurn.codingResult?.verification.status).toBe("passed");
    expect(refactorTurn.codingResult?.verification.reason).toContain(
      "LOCKED.md unchanged",
    );
    await expect(
      fs.readFile(path.join(workspaceRoot, "LOCKED.md"), "utf8"),
    ).resolves.toBe(initialLocked);
    const utilsAfterRefactor = await fs.readFile(
      path.join(workspaceRoot, "utils.js"),
      "utf8",
    );
    const appAfterRefactor = await fs.readFile(
      path.join(workspaceRoot, "app.js"),
      "utf8",
    );
    expect(utilsAfterRefactor).toContain("export function welcome");
    expect(utilsAfterRefactor).not.toContain("greet");
    expect(appAfterRefactor).toContain("import { welcome }");
    expect(appAfterRefactor).toContain('welcome("Ada")');

    const utilsSnapshot = utilsAfterRefactor;
    const appSnapshot = appAfterRefactor;
    const correctionTurn = await runMvpIntegratedFlow({
      sessionId: "sess_t10_constrained_refactor_turn2",
      prompt:
        'Correction: README.md should show welcome() as the primary example, but keep welcome("Ada") as a second example. Only modify README.md. Verify README.md contains welcome() and README.md contains welcome("Ada") and utils.js is unchanged and app.js is unchanged and LOCKED.md is unchanged.',
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(correctionTurn.status).toBe("completed");
    expect(correctionTurn.codingResult?.changedFiles).toContain("README.md");
    expect(correctionTurn.codingResult?.changedFiles).not.toContain("utils.js");
    expect(correctionTurn.codingResult?.changedFiles).not.toContain("app.js");
    expect(correctionTurn.codingResult?.changedFiles).not.toContain("LOCKED.md");
    expect(correctionTurn.codingResult?.verification.status).toBe("passed");
    expect(correctionTurn.codingResult?.verification.reason).toContain(
      "utils.js unchanged",
    );
    await expect(
      fs.readFile(path.join(workspaceRoot, "utils.js"), "utf8"),
    ).resolves.toBe(utilsSnapshot);
    await expect(
      fs.readFile(path.join(workspaceRoot, "app.js"), "utf8"),
    ).resolves.toBe(appSnapshot);
    const readmeAfterCorrection = await fs.readFile(
      path.join(workspaceRoot, "README.md"),
      "utf8",
    );
    expect(readmeAfterCorrection).toContain("welcome()");
    expect(readmeAfterCorrection).toContain('welcome("Ada")');
  }, 15000);

  it("verifies README-only correction while nested code paths stay unchanged", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const utilsSnapshot = [
      'export function welcome(name = "world") {',
      '  return "Hello, " + name;',
      '}',
      '',
    ].join("\n");
    const appSnapshot =
      'import { welcome } from "./utils.js";\n\nexport const message = welcome("Ada");\n';
    const projectSnapshot = JSON.stringify(
      { name: "contract-smoke", private: true },
      null,
      2,
    );
    const lockedSnapshot = "Do not modify this file.\n";
    await fs.writeFile(path.join(workspaceRoot, "src", "utils.js"), utilsSnapshot, "utf8");
    await fs.writeFile(path.join(workspaceRoot, "src", "app.js"), appSnapshot, "utf8");
    await fs.writeFile(
      path.join(workspaceRoot, "README.md"),
      'Use welcome("Ada") to say hello.\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "project.json"),
      projectSnapshot,
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "LOCKED.md"),
      lockedSnapshot,
      "utf8",
    );

    const correctionTurn = await runMvpIntegratedFlow({
      sessionId: "sess_t10_readme_only_nested_unchanged",
      prompt:
        'Correction: README.md should show welcome() as the primary example, but keep welcome("Ada") as a second example. Only modify README.md. Verify README.md contains welcome() and README.md contains welcome("Ada") and src/utils.js is unchanged and src/app.js is unchanged and project.json is unchanged and LOCKED.md is unchanged.',
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(correctionTurn.status).toBe("completed");
    expect(correctionTurn.codingResult?.changedFiles).toEqual(["README.md"]);
    expect(correctionTurn.codingResult?.verification.status).toBe("passed");
    expect(correctionTurn.codingResult?.verification.reason).toContain(
      "src/utils.js unchanged",
    );
    expect(correctionTurn.codingResult?.verification.reason).toContain(
      "src/app.js unchanged",
    );
    await expect(
      fs.readFile(path.join(workspaceRoot, "src", "utils.js"), "utf8"),
    ).resolves.toBe(utilsSnapshot);
    await expect(
      fs.readFile(path.join(workspaceRoot, "src", "app.js"), "utf8"),
    ).resolves.toBe(appSnapshot);
    await expect(
      fs.readFile(path.join(workspaceRoot, "project.json"), "utf8"),
    ).resolves.toBe(projectSnapshot);
    await expect(
      fs.readFile(path.join(workspaceRoot, "LOCKED.md"), "utf8"),
    ).resolves.toBe(lockedSnapshot);
    const readmeAfterCorrection = await fs.readFile(
      path.join(workspaceRoot, "README.md"),
      "utf8",
    );
    expect(readmeAfterCorrection).toContain("welcome()");
    expect(readmeAfterCorrection).toContain('welcome("Ada")');
  }, 15000);

  it("runs a constrained small bugfix and comment correction with protected files", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    const readme = "double(3) should return 6.\n";
    const locked = "Do not modify this file.\n";
    await fs.writeFile(
      path.join(workspaceRoot, "math.js"),
      "export function double(n) {\n  return n + 2;\n}\n",
      "utf8",
    );
    await fs.writeFile(path.join(workspaceRoot, "README.md"), readme, "utf8");
    await fs.writeFile(path.join(workspaceRoot, "LOCKED.md"), locked, "utf8");

    const fixTurn = await runMvpIntegratedFlow({
      sessionId: "sess_t10_small_bugfix_turn1",
      prompt:
        "There is a bug in math.js: double(3) should return 6, but the implementation is wrong. Fix the bug in math.js. Do NOT modify README.md. Do NOT modify LOCKED.md. Verify math.js contains n * 2 and README.md is unchanged and LOCKED.md is unchanged.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(fixTurn.status).toBe("completed");
    expect(fixTurn.codingResult?.changedFiles).toContain("math.js");
    expect(fixTurn.codingResult?.changedFiles).not.toContain("README.md");
    expect(fixTurn.codingResult?.changedFiles).not.toContain("LOCKED.md");
    expect(fixTurn.codingResult?.verification.status).toBe("passed");
    expect(fixTurn.codingResult?.verification.reason).toContain(
      "README.md unchanged",
    );
    await expect(
      fs.readFile(path.join(workspaceRoot, "README.md"), "utf8"),
    ).resolves.toBe(readme);
    await expect(
      fs.readFile(path.join(workspaceRoot, "LOCKED.md"), "utf8"),
    ).resolves.toBe(locked);
    const mathAfterFix = await fs.readFile(
      path.join(workspaceRoot, "math.js"),
      "utf8",
    );
    expect(mathAfterFix).toContain("return n * 2;");

    const commentTurn = await runMvpIntegratedFlow({
      sessionId: "sess_t10_small_bugfix_turn2",
      prompt:
        "Correction: add a short comment above double explaining that it doubles a number. Only modify math.js. Verify math.js contains doubles a number and math.js contains n * 2 and README.md is unchanged and LOCKED.md is unchanged.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(commentTurn.status).toBe("completed");
    expect(commentTurn.codingResult?.changedFiles).toContain("math.js");
    expect(commentTurn.codingResult?.changedFiles).not.toContain("README.md");
    expect(commentTurn.codingResult?.changedFiles).not.toContain("LOCKED.md");
    expect(commentTurn.codingResult?.verification.status).toBe("passed");
    await expect(
      fs.readFile(path.join(workspaceRoot, "README.md"), "utf8"),
    ).resolves.toBe(readme);
    await expect(
      fs.readFile(path.join(workspaceRoot, "LOCKED.md"), "utf8"),
    ).resolves.toBe(locked);
    const mathAfterComment = await fs.readFile(
      path.join(workspaceRoot, "math.js"),
      "utf8",
    );
    expect(mathAfterComment).toContain("// doubles a number");
    expect(mathAfterComment).toContain("return n * 2;");
  }, 15000);

  it("creates and corrects a usage example file while preserving source files", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    const math = [
      "export function double(n) {",
      "  return n * 2;",
      "}",
      "",
      "export function square(n) {",
      "  return n * n;",
      "}",
      "",
    ].join("\n");
    const locked = "Do not modify this file.\n";
    await fs.writeFile(path.join(workspaceRoot, "math.js"), math, "utf8");
    await fs.writeFile(path.join(workspaceRoot, "LOCKED.md"), locked, "utf8");

    const createTurn = await runMvpIntegratedFlow({
      sessionId: "sess_t10_example_generation_turn1",
      prompt:
        "Read math.js and create examples.md with simple usage examples for double and square. Do NOT modify math.js. Do NOT modify LOCKED.md. Verify examples.md contains double(3) and examples.md contains square(4) and math.js is unchanged and LOCKED.md is unchanged.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(createTurn.status).toBe("completed");
    expect(createTurn.codingResult?.changedFiles).toContain("examples.md");
    expect(createTurn.codingResult?.changedFiles).not.toContain("math.js");
    expect(createTurn.codingResult?.changedFiles).not.toContain("LOCKED.md");
    expect(createTurn.codingResult?.verification.status).toBe("passed");
    await expect(
      fs.readFile(path.join(workspaceRoot, "math.js"), "utf8"),
    ).resolves.toBe(math);
    await expect(
      fs.readFile(path.join(workspaceRoot, "LOCKED.md"), "utf8"),
    ).resolves.toBe(locked);

    const correctionTurn = await runMvpIntegratedFlow({
      sessionId: "sess_t10_example_generation_turn2",
      prompt:
        "Correction: examples.md should include expected outputs for both examples. Only modify examples.md. Verify examples.md contains double(3) and examples.md contains 6 and examples.md contains square(4) and examples.md contains 16 and math.js is unchanged and LOCKED.md is unchanged.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(correctionTurn.status).toBe("completed");
    expect(correctionTurn.codingResult?.changedFiles).toContain("examples.md");
    expect(correctionTurn.codingResult?.changedFiles).not.toContain("math.js");
    expect(correctionTurn.codingResult?.changedFiles).not.toContain("LOCKED.md");
    expect(correctionTurn.codingResult?.verification.status).toBe("passed");
    const examples = await fs.readFile(
      path.join(workspaceRoot, "examples.md"),
      "utf8",
    );
    expect(examples).toContain("double(3)");
    expect(examples).toContain("6");
    expect(examples).toContain("square(4)");
    expect(examples).toContain("16");
    await expect(
      fs.readFile(path.join(workspaceRoot, "math.js"), "utf8"),
    ).resolves.toBe(math);
    await expect(
      fs.readFile(path.join(workspaceRoot, "LOCKED.md"), "utf8"),
    ).resolves.toBe(locked);
  }, 15000);

  it("fails low-risk multi-file consistency verification when target misses source item", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "todo.txt"),
      "ship minimal CLI smoke\ndocument one follow-up\nverify multi-file follow-up\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "plan.txt"),
      "Plan\n1. ship minimal CLI smoke\n2. document one follow-up\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_low_risk_multifile_verify_failed",
      prompt:
        "Append to plan.txt with content: unrelated follow-up. Verify todo.txt and plan.txt stay consistent.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.codingResult?.changedFiles).toContain("plan.txt");
    expect(result.codingResult?.verification.status).toBe("failed");
    expect(result.codingResult?.verification.reason).toContain(
      "missing source item",
    );
    expect(result.codingResult?.unverifiedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "plan.txt" }),
      ]),
    );
  }, 15000);

  it("applies a user correction to the derived file and re-verifies consistency", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    const todoContent =
      "ship minimal CLI smoke\ndocument one follow-up\nverify multi-file follow-up\n";
    await fs.writeFile(path.join(workspaceRoot, "todo.txt"), todoContent, "utf8");
    await fs.writeFile(
      path.join(workspaceRoot, "plan.txt"),
      "Plan ship minimal CLI smoke document one follow-up verify multi-file follow-up\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_low_risk_correction_multifile_verify",
      prompt:
        "Not right: every item in plan.txt must start with '- [ ] '. Replace plan.txt with content: - [ ] ship minimal CLI smoke - [ ] document one follow-up - [ ] verify multi-file follow-up. Only modify plan.txt, do not change todo.txt, then verify todo.txt and plan.txt stay consistent.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toContain("plan.txt");
    expect(result.codingResult?.changedFiles).not.toContain("todo.txt");
    expect(result.codingResult?.verification.status).toBe("passed");
    await expect(
      fs.readFile(path.join(workspaceRoot, "todo.txt"), "utf8"),
    ).resolves.toBe(todoContent);
    await expect(
      fs.readFile(path.join(workspaceRoot, "plan.txt"), "utf8"),
    ).resolves.toContain("- [ ] verify multi-file follow-up");
  }, 15000);

  it("runs a small code edit plus README correction with low-risk file verification", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "utils.js"),
      'export function greet(name) {\n  return "Hello, " + name;\n}\n',
      "utf8",
    );

    const turn1 = await runMvpIntegratedFlow({
      sessionId: "sess_t10_low_risk_code_readme_turn1",
      prompt:
        "Update utils.js with content: export function greet(name = 'world') { return 'Hello, ' + name; }. Create README.md with content: Usage: greet('world') returns Hello, world. Do not run npm or tests; verify utils.js contains name = 'world' and README.md contains greet('world').",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(turn1.status).toBe("completed");
    expect(turn1.terminalClassification).toBe("success");
    expect(turn1.codingResult?.changedFiles).toEqual(
      expect.arrayContaining(["utils.js", "README.md"]),
    );
    expect(turn1.codingResult?.verification.status).toBe("passed");
    await expect(
      fs.readFile(path.join(workspaceRoot, "utils.js"), "utf8"),
    ).resolves.toBe("export function greet(name = 'world') { return 'Hello, ' + name; }");

    const turn2 = await runMvpIntegratedFlow({
      sessionId: "sess_t10_low_risk_code_readme_turn2",
      prompt:
        "Not right: README example must use greet() instead of greet('world'). Only modify README.md, do not change utils.js. Replace README.md with content: Usage: greet() returns Hello, world. Verify utils.js contains name = 'world' and README.md contains greet().",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(turn2.status).toBe("completed");
    expect(turn2.terminalClassification).toBe("success");
    expect(turn2.codingResult?.changedFiles).toContain("README.md");
    expect(turn2.codingResult?.changedFiles).not.toContain("utils.js");
    expect(turn2.codingResult?.verification.status).toBe("passed");
    await expect(
      fs.readFile(path.join(workspaceRoot, "utils.js"), "utf8"),
    ).resolves.toBe("export function greet(name = 'world') { return 'Hello, ' + name; }");
    await expect(
      fs.readFile(path.join(workspaceRoot, "README.md"), "utf8"),
    ).resolves.toContain("greet()");
  }, 15000);

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

  it("normalizes ambiguous ultra-weak variant to cross-file blocker surface instead of read-type blocker", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-cross-file-variant-normalization"}\n',
      "utf8",
    );
    await fs.writeFile(path.join(workspaceRoot, "src", "variant-a.txt"), "value=a\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "src", "variant-b.txt"), "value=b\n", "utf8");

    const prompt = [
      "and then?",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/variant-a.txt,src/variant-b.txt",
      "- last-continuation-evidence: repair-remaining-files:src/variant-a.txt,src/variant-b.txt | reopen-candidates:src/variant-a.txt,src/variant-b.txt | repair-failed-files:src/variant-a.txt::patch-generation-failed::retry pending",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_cross_file_variant_normalization",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.stopReason ?? "").toContain("missing transform evidence");
    expect(result.stopReason ?? "").not.toContain("no active file could be inherited");
    expect(result.codingResult?.taskKind).toBe("edit-file");
  }, 15000);

  it("normalizes temporal successor cue 'next' to cross-file blocker surface in polluted history", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-cross-file-temporal-next"}\n',
      "utf8",
    );
    await fs.writeFile(path.join(workspaceRoot, "src", "temporal-a.txt"), "value=a\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "src", "temporal-b.txt"), "value=b\n", "utf8");

    const prompt = [
      "next",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/temporal-a.txt,src/temporal-b.txt",
      "- recent-failed-files: src/temporal-a.txt (patch failed (patch-generation-failed): retry pending)",
      "- last-continuation-evidence: repair-remaining-files:src/temporal-a.txt,src/temporal-b.txt | reopen-candidates:src/temporal-a.txt,src/temporal-b.txt | continuation-lineage-active:src/legacy-read.txt::read::* | continuation-lineage-slot:src/legacy-read.txt::read::*",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_cross_file_temporal_next",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.stopReason ?? "").toContain("missing transform evidence");
    expect(result.stopReason ?? "").not.toContain("no active file could be inherited");
    expect(result.codingResult?.taskKind).toBe("edit-file");
  }, 15000);

  it("normalizes temporal successor cue 'what next' to cross-file blocker surface in polluted history", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-cross-file-temporal-what-next"}\n',
      "utf8",
    );
    await fs.writeFile(path.join(workspaceRoot, "src", "temporal-c.txt"), "value=c\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "src", "temporal-d.txt"), "value=d\n", "utf8");

    const prompt = [
      "what next",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/temporal-c.txt,src/temporal-d.txt",
      "- recent-failed-files: src/temporal-c.txt (patch failed (patch-generation-failed): retry pending)",
      "- last-continuation-evidence: repair-remaining-files:src/temporal-c.txt,src/temporal-d.txt | reopen-candidates:src/temporal-c.txt,src/temporal-d.txt | continuation-lineage-active:src/legacy-read.txt::read::* | continuation-lineage-slot:src/legacy-read.txt::read::*",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_cross_file_temporal_what_next",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.stopReason ?? "").toContain("missing transform evidence");
    expect(result.stopReason ?? "").not.toContain("no active file could be inherited");
    expect(result.codingResult?.taskKind).toBe("edit-file");
  }, 15000);

  it("auto-continues temporal successor cue 'next' when cross-file evidence is single-target and executable", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-cross-file-temporal-next-auto"}\n',
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "temporal-next-auto.txt");
    await fs.writeFile(targetPath, "status=pending\n", "utf8");

    const prompt = [
      "next",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/temporal-next-auto.txt",
      "- recent-failed-files: src/temporal-next-auto.txt (patch failed (patch-generation-failed): retry pending)",
      "- last-continuation-evidence: repair-remaining-files:src/temporal-next-auto.txt | reopen-candidates:src/temporal-next-auto.txt | replan-transform:src/temporal-next-auto.txt:status=pending=>status=done",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_cross_file_temporal_next_auto",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.stopReason).toBeUndefined();
    expect(result.sharedContext.notes.join("\n")).toContain(
      "cross-file ultra-weak follow-up auto-activated from single recoverable continuation target",
    );
    expect(result.stopReason ?? "").not.toContain(
      "Continuation follow-up is ambiguous for direct execution",
    );
  }, 15000);

  it("auto-continues temporal successor cue 'what next' when latest rebind transform evidence is executable", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-weak-cross-file-temporal-what-next-auto"}\n',
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "temporal-what-next-auto.txt");
    await fs.writeFile(targetPath, "mode=legacy\n", "utf8");

    const prompt = [
      "what next",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/temporal-what-next-auto.txt",
      "- recent-failed-files: src/temporal-what-next-auto.txt (patch failed (patch-generation-failed): retry pending)",
      "- last-continuation-evidence: repair-remaining-files:src/temporal-what-next-auto.txt | reopen-candidates:src/temporal-what-next-auto.txt | transform:src/temporal-what-next-auto.txt:mode=legacy=>mode=wrong | rebind-transform:src/temporal-what-next-auto.txt:mode=legacy=>mode=wrong->mode=legacy=>mode=modern",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_weak_cross_file_temporal_what_next_auto",
      prompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("edit-file");
    expect(result.stopReason).toBeUndefined();
    expect(result.sharedContext.notes.join("\n")).toContain(
      "cross-file ultra-weak follow-up auto-activated from single recoverable continuation target",
    );
    expect(result.stopReason ?? "").not.toContain(
      "Continuation follow-up is ambiguous for direct execution",
    );
  }, 15000);

  it("rolls temporal continuation evidence across multi-hop successor cues", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "temporal-multihop-rollover.txt");
    await fs.writeFile(targetPath, "status=pending\n", "utf8");

    const firstPrompt = [
      "next",
      "",
      "[FOLLOW-UP CONTINUITY CONTEXT]",
      "- recent-target-files: src/temporal-multihop-rollover.txt",
      "- recent-failed-files: src/temporal-multihop-rollover.txt (patch failed (patch-generation-failed): retry pending)",
      "- last-continuation-evidence: repair-remaining-files:src/temporal-multihop-rollover.txt | reopen-candidates:src/temporal-multihop-rollover.txt | replan-transform:src/temporal-multihop-rollover.txt:status=pending=>status=done",
      "[END CONTINUITY CONTEXT]",
    ].join("\n");

    const first = await runMvpIntegratedFlow({
      sessionId: "sess_t10_temporal_multihop_rollover_1",
      prompt: firstPrompt,
      workspaceRoot,
      maxTurns: 6,
    });

    expect(first.status).toBe("completed");
    expect(first.codingResult?.taskKind).toBe("edit-file");

    const firstCodingResult = first.codingResult;
    if (!firstCodingResult) {
      throw new Error("Expected first hop coding result");
    }

    const second = await runMvpIntegratedFlow({
      sessionId: "sess_t10_temporal_multihop_rollover_2",
      prompt: "what next",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: firstCodingResult.taskKind,
        lastTerminalClassification: first.terminalClassification,
        lastTerminalReason: first.terminalReason,
        recentChangedFiles: firstCodingResult.changedFiles ?? [],
        recentTargetFiles: firstCodingResult.changeSet?.attemptedFiles ?? [],
        recentFailedFiles: (firstCodingResult.failedFiles ?? []).map((entry) => ({
          path: entry.path,
          reason: entry.reason,
        })),
        recentVerifiedFiles: firstCodingResult.verifiedFiles ?? [],
        lastRepairStatus: firstCodingResult.repair.status,
        lastRepairNotes: firstCodingResult.repair.notes ?? [],
        lastContinuationStatus: firstCodingResult.continuation.status,
        lastContinuationEvidence: firstCodingResult.continuation.evidence ?? [],
        lastTaskSatisfactionVerdict: firstCodingResult.taskSatisfaction.verdict,
        lastTaskSatisfactionReasons: firstCodingResult.taskSatisfaction.reasons ?? [],
        unresolvedItems: [],
      },
      maxTurns: 6,
    });

    expect(["completed", "stopped_error"]).toContain(second.status);
    expect(second.codingResult?.taskKind).toBe("edit-file");
    if (second.status === "stopped_error") {
      expect(second.codingResult?.failedFiles?.[0]?.path).toBe(
        "src/temporal-multihop-rollover.txt",
      );
      expect(second.stopReason ?? "").not.toContain("no active file could be inherited");
    }
    expect(second.finalOutput.toLowerCase()).not.toContain("i'm here to chat");
  }, 15000);

  it("prevents inverse stale-transform rebound across temporal successor hops after rollover", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "temporal-multihop-exhaustion.txt");
    await fs.writeFile(targetPath, "status=modern\n", "utf8");

    const first = await runMvpIntegratedFlow({
      sessionId: "sess_t10_temporal_multihop_exhaustion_1",
      prompt: "next",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: "edit-file",
        lastTerminalClassification: "success",
        lastTerminalReason: "completed",
        recentChangedFiles: ["src/temporal-multihop-exhaustion.txt"],
        recentTargetFiles: ["src/temporal-multihop-exhaustion.txt"],
        recentFailedFiles: [],
        unresolvedItems: [],
        lastContinuationEvidence: [
          "repair-remaining-files:src/temporal-multihop-exhaustion.txt",
          "reopen-candidates:src/temporal-multihop-exhaustion.txt",
          "rebind-transform:src/temporal-multihop-exhaustion.txt:status=future=>status=modern->status=modern=>status=right",
        ],
      },
      maxTurns: 6,
    });

    expect(first.status).toBe("completed");
    expect(await fs.readFile(targetPath, "utf8")).toBe("status=right\n");

    const firstCodingResult = first.codingResult;
    if (!firstCodingResult) {
      throw new Error("Expected first hop coding result");
    }

    const second = await runMvpIntegratedFlow({
      sessionId: "sess_t10_temporal_multihop_exhaustion_2",
      prompt: "after that",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: firstCodingResult.taskKind,
        lastTerminalClassification: first.terminalClassification,
        lastTerminalReason: first.terminalReason,
        recentChangedFiles: firstCodingResult.changedFiles ?? [],
        recentTargetFiles: firstCodingResult.changeSet?.attemptedFiles ?? [],
        recentFailedFiles: (firstCodingResult.failedFiles ?? []).map((entry) => ({
          path: entry.path,
          reason: entry.reason,
        })),
        recentVerifiedFiles: firstCodingResult.verifiedFiles ?? [],
        lastRepairStatus: firstCodingResult.repair.status,
        lastRepairNotes: firstCodingResult.repair.notes ?? [],
        lastContinuationStatus: firstCodingResult.continuation.status,
        lastContinuationEvidence: firstCodingResult.continuation.evidence ?? [],
        lastTaskSatisfactionVerdict: firstCodingResult.taskSatisfaction.verdict,
        lastTaskSatisfactionReasons: firstCodingResult.taskSatisfaction.reasons ?? [],
        unresolvedItems: [],
      },
      maxTurns: 6,
    });

    expect(second.status).toBe("stopped_error");
    expect(second.stopReason ?? "").toContain("stale against current file content");
    expect(second.finalOutput.toLowerCase()).not.toContain("i'm here to chat");
    expect(await fs.readFile(targetPath, "utf8")).toBe("status=right\n");
  }, 15000);

  it("retires stale blocker evidence for generic temporal re-entry while allowing explicit transform override", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "temporal-post-exhaustion.txt");
    await fs.writeFile(targetPath, "status=modern\n", "utf8");

    const first = await runMvpIntegratedFlow({
      sessionId: "sess_t10_temporal_post_exhaustion_1",
      prompt: "next",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: "edit-file",
        lastTerminalClassification: "success",
        lastTerminalReason: "completed",
        recentChangedFiles: ["src/temporal-post-exhaustion.txt"],
        recentTargetFiles: ["src/temporal-post-exhaustion.txt"],
        recentFailedFiles: [],
        unresolvedItems: [],
        lastContinuationEvidence: [
          "repair-remaining-files:src/temporal-post-exhaustion.txt",
          "reopen-candidates:src/temporal-post-exhaustion.txt",
          "rebind-transform:src/temporal-post-exhaustion.txt:status=future=>status=modern->status=modern=>status=right",
        ],
      },
      maxTurns: 6,
    });

    expect(first.status).toBe("completed");
    const firstCodingResult = first.codingResult;
    if (!firstCodingResult) {
      throw new Error("Expected first hop coding result");
    }
    expect(await fs.readFile(targetPath, "utf8")).toBe("status=right\n");

    const second = await runMvpIntegratedFlow({
      sessionId: "sess_t10_temporal_post_exhaustion_2",
      prompt: "after that",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: firstCodingResult.taskKind,
        lastTerminalClassification: first.terminalClassification,
        lastTerminalReason: first.terminalReason,
        recentChangedFiles: firstCodingResult.changedFiles ?? [],
        recentTargetFiles: firstCodingResult.changeSet?.attemptedFiles ?? [],
        recentFailedFiles: (firstCodingResult.failedFiles ?? []).map((entry) => ({
          path: entry.path,
          reason: entry.reason,
        })),
        recentVerifiedFiles: firstCodingResult.verifiedFiles ?? [],
        lastRepairStatus: firstCodingResult.repair.status,
        lastRepairNotes: firstCodingResult.repair.notes ?? [],
        lastContinuationStatus: firstCodingResult.continuation.status,
        lastContinuationEvidence: firstCodingResult.continuation.evidence ?? [],
        lastTaskSatisfactionVerdict: firstCodingResult.taskSatisfaction.verdict,
        lastTaskSatisfactionReasons: firstCodingResult.taskSatisfaction.reasons ?? [],
        unresolvedItems: [],
      },
      maxTurns: 6,
    });

    expect(second.status).toBe("stopped_error");
    expect(second.stopReason ?? "").toContain("stale against current file content");
    const secondCodingResult = second.codingResult;
    if (!secondCodingResult) {
      throw new Error("Expected second hop coding result");
    }

    const third = await runMvpIntegratedFlow({
      sessionId: "sess_t10_temporal_post_exhaustion_3",
      prompt: "next",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: secondCodingResult.taskKind,
        lastTerminalClassification: second.terminalClassification,
        lastTerminalReason: second.terminalReason,
        recentChangedFiles: secondCodingResult.changedFiles ?? [],
        recentTargetFiles: secondCodingResult.changeSet?.attemptedFiles ?? [],
        recentFailedFiles: (secondCodingResult.failedFiles ?? []).map((entry) => ({
          path: entry.path,
          reason: entry.reason,
        })),
        recentVerifiedFiles: secondCodingResult.verifiedFiles ?? [],
        lastRepairStatus: secondCodingResult.repair.status,
        lastRepairNotes: secondCodingResult.repair.notes ?? [],
        lastContinuationStatus: secondCodingResult.continuation.status,
        lastContinuationEvidence: secondCodingResult.continuation.evidence ?? [],
        lastTaskSatisfactionVerdict: secondCodingResult.taskSatisfaction.verdict,
        lastTaskSatisfactionReasons: secondCodingResult.taskSatisfaction.reasons ?? [],
        unresolvedItems: [],
      },
      maxTurns: 6,
    });

    expect(third.status).toBe("stopped_error");
    expect(third.stopReason ?? "").not.toContain("stale against current file content");
    expect(third.stopReason ?? "").toContain("missing transform evidence");
    expect(await fs.readFile(targetPath, "utf8")).toBe("status=right\n");

    const thirdCodingResult = third.codingResult;
    if (!thirdCodingResult) {
      throw new Error("Expected third hop coding result");
    }

    const fourth = await runMvpIntegratedFlow({
      sessionId: "sess_t10_temporal_post_exhaustion_4",
      prompt: "replace status=right with status=final in src/temporal-post-exhaustion.txt",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: thirdCodingResult.taskKind,
        lastTerminalClassification: third.terminalClassification,
        lastTerminalReason: third.terminalReason,
        recentChangedFiles: thirdCodingResult.changedFiles ?? [],
        recentTargetFiles: thirdCodingResult.changeSet?.attemptedFiles ?? [],
        recentFailedFiles: (thirdCodingResult.failedFiles ?? []).map((entry) => ({
          path: entry.path,
          reason: entry.reason,
        })),
        recentVerifiedFiles: thirdCodingResult.verifiedFiles ?? [],
        lastRepairStatus: thirdCodingResult.repair.status,
        lastRepairNotes: thirdCodingResult.repair.notes ?? [],
        lastContinuationStatus: thirdCodingResult.continuation.status,
        lastContinuationEvidence: thirdCodingResult.continuation.evidence ?? [],
        lastTaskSatisfactionVerdict: thirdCodingResult.taskSatisfaction.verdict,
        lastTaskSatisfactionReasons: thirdCodingResult.taskSatisfaction.reasons ?? [],
        unresolvedItems: [],
      },
      maxTurns: 6,
    });

    expect(fourth.status).toBe("completed");
    expect(await fs.readFile(targetPath, "utf8")).toContain("status=final");
  }, 15000);

  it("unifies post-exhaustion cross-file ultra-weak cues to a single missing-transform blocker surface", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "temporal-surface-unify.txt");
    await fs.writeFile(targetPath, "status=right\n", "utf8");

    const cues = [
      "next",
      "what next",
      "after that",
      "go on",
      "keep going",
      "do it",
      "and then?",
    ];

    for (const cue of cues) {
      const result = await runMvpIntegratedFlow({
        sessionId: `sess_t10_temporal_surface_unify_${cue.replace(/[^a-z0-9]+/gi, "_")}`,
        prompt: cue,
        workspaceRoot,
        continuityState: {
          projectRoot: workspaceRoot,
          lastTaskKind: "edit-file",
          lastTerminalClassification: "stopped",
          lastTerminalReason: "stopped_error",
          lastFailure:
            "Reopened target recovered, but previous transform is stale against current file content (replacement already present). Provide an explicit next transform to continue.",
          recentChangedFiles: [],
          recentTargetFiles: ["src/temporal-surface-unify.txt"],
          recentFailedFiles: [],
          unresolvedItems: [],
          lastContinuationEvidence: [
            "repair-remaining-files:src/temporal-surface-unify.txt",
            "reopen-candidates:src/temporal-surface-unify.txt",
            "rebind-blocker:src/temporal-surface-unify.txt:stale-transform-already-applied:status=modern=>status=right",
          ],
        },
        maxTurns: 6,
      });

      expect(result.status).toBe("stopped_error");
      expect(result.stopReason ?? "").toContain("missing transform evidence");
      expect(result.stopReason ?? "").not.toContain("stale against current file content");
      expect(result.finalOutput.toLowerCase()).not.toContain("i'm here to chat");
    }
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

  it("routes reflective stop-reason query to rebased continuity state instead of repo-explain", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "reflective-stop.ts"),
      "export const v = 1;\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_stop_rebased",
      prompt: "why did it stop",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTerminalClassification: "stopped",
        lastTerminalReason: "stopped_error",
        lastFailure: "verify failed: npm test -- --help",
        recentTargetFiles: ["D:/legacy-root/src/reflective-stop.ts"],
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=chat");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: stop-reason",
    );
    expect(result.sharedContext.notes.join("\n")).not.toContain("plan: intent=repo-explain");
    expect(result.finalOutput).toContain("Last run status:");
    expect(result.finalOutput).toContain("verify failed");
    expect(result.finalOutput).toContain("src/reflective-stop.ts");
  }, 15000);

  it("answers reflective explain scope from rebased explain object after migration-like root change", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src", "nested"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "nested", "reflective-explain.ts"),
      ["gamma", "delta", "epsilon"].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_explain_rebased",
      prompt: "what part did you just explain",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastGroundedDeliverableMode: "explain",
        recentTargetFiles: ["D:/legacy-root/src/nested/reflective-explain.ts"],
        lastReadFragmentRanges: ["0-1"],
        lastReadFragmentLineIndexes: [0, 1],
        lastTaskKind: "read-file",
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: explain-scope",
    );
    expect(result.finalOutput).toContain("Last explain scope: slice 0-1.");
    expect(result.finalOutput).toContain("src/nested/reflective-explain.ts");
  }, 15000);

  it("answers reflective read-position query from rebased session state after migration-like root change", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src", "nested"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "nested", "reflective-read.ts"),
      ["l1", "l2", "l3", "l4", "l5"].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_read_rebased",
      prompt: "刚才读到哪里了",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "read-file",
        recentTargetFiles: ["D:/legacy-root/src/nested/reflective-read.ts"],
        lastReadWindowStart: 2,
        lastReadWindowEnd: 4,
        lastReadWindowSize: 2,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: read-position",
    );
    expect(result.finalOutput).toContain("Last read position: lines 3-4.");
    expect(result.finalOutput).toContain("src/nested/reflective-read.ts");
  }, 15000);

  it("keeps post-compact permission explanation prompts on approval-memory reflective routing (English)", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "reflective-approval-en.txt"),
      "approval-memory\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_compact_en",
      prompt: "why didn't that approval apply directly this time",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: "chat",
        lastApprovalDecision: "allow-once",
        lastApprovalDecisionSource: "tty-keypress",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: workspaceRoot,
        lastApprovalCacheKey: `${workspaceRoot.replace(/\\/g, "/").toLowerCase()}|bash:spawn:process:npm`,
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalLineage: "verify:node --version",
        lastApprovalRecordedAt: "2026-04-23T12:00:00.000Z",
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 17,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=chat");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.sharedContext.notes.join("\n")).not.toContain("plan: intent=repo-explain");
    expect(result.finalOutput).toContain("Last approval decision: allow-once.");
    expect(result.finalOutput).toContain("Why asking again:");
  }, 15000);

  it("keeps post-compact permission explanation prompts on approval-memory reflective routing (Chinese)", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "reflective-approval-zh.txt"),
      "approval-memory\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_compact_zh",
      prompt: "\u521A\u624D\u90A3\u4E2A\u6388\u6743\u4E3A\u4EC0\u4E48\u8FD9\u6B21\u53C8\u6CA1\u76F4\u63A5\u751F\u6548",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: "chat",
        lastApprovalDecision: "allow-once",
        lastApprovalDecisionSource: "cli-policy",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: workspaceRoot,
        lastApprovalCacheKey: `${workspaceRoot.replace(/\\/g, "/").toLowerCase()}|bash:spawn:process:npm`,
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalLineage: "verify:npm test -- --help",
        lastApprovalRecordedAt: "2026-04-23T12:05:00.000Z",
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 19,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=chat");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.sharedContext.notes.join("\n")).not.toContain("plan: intent=repo-explain");
    expect(result.finalOutput).toContain("Last approval decision: allow-once.");
    expect(result.finalOutput).toContain("Why asking again:");
  }, 15000);

  it("resolves authoritative approval from rebased root when latest history is from another root", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "reflective-approval-authority-root.txt"),
      "approval-memory\n",
      "utf8",
    );

    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_authority_root",
      prompt: "why is it asking again for approval",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        lastApprovalDecision: "allow-always",
        lastApprovalDecisionSource: "tty-keypress",
        lastApprovalPersistent: true,
        lastApprovalCacheEffect: "persisted",
        lastApprovalProjectRoot: "D:/legacy-root",
        lastApprovalCacheKey: "d:/legacy-root|bash:spawn:process:npm",
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalLineage: "verify:npm test",
        lastApprovalRecordedAt: "2026-04-23T12:05:00.000Z",
        lastApprovalHistory: [
          {
            decision: "allow-once",
            decisionSource: "tty-keypress",
            persistent: false,
            cacheEffect: "none",
            projectRoot: rebasedRoot,
            cacheKey: `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`,
            scopeLabel: "bash/spawn/process(npm)",
            lineage: "verify:npm test",
            recordedAt: "2026-04-23T12:00:00.000Z",
          },
          {
            decision: "allow-always",
            decisionSource: "tty-keypress",
            persistent: true,
            cacheEffect: "persisted",
            projectRoot: "D:/legacy-root",
            cacheKey: "d:/legacy-root|bash:spawn:process:npm",
            scopeLabel: "bash/spawn/process(npm)",
            lineage: "verify:npm test",
            recordedAt: "2026-04-23T12:05:00.000Z",
          },
        ],
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 21,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.finalOutput).toContain("Authoritative approval now: allow-once");
    expect(result.finalOutput).toContain("rebased authority root");
  }, 15000);

  it("explains same-root authority override after compact using approval history", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "reflective-approval-authority-override.txt"),
      "approval-memory\n",
      "utf8",
    );

    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_authority_override",
      prompt: "\u4E3A\u4EC0\u4E48\u8FD9\u6B21\u53C8\u8981\u95EE\u5BA1\u6279",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        lastApprovalDecision: "deny",
        lastApprovalDecisionSource: "tty-keypress",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: rebasedRoot,
        lastApprovalCacheKey: `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`,
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalLineage: "verify:npm test",
        lastApprovalStopReason: "user denied escalation",
        lastApprovalRecordedAt: "2026-04-23T12:03:00.000Z",
        lastApprovalHistory: [
          {
            decision: "allow-always",
            decisionSource: "tty-keypress",
            persistent: true,
            cacheEffect: "persisted",
            projectRoot: rebasedRoot,
            cacheKey: `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`,
            scopeLabel: "bash/spawn/process(npm)",
            lineage: "verify:npm test",
            recordedAt: "2026-04-23T12:00:00.000Z",
          },
          {
            decision: "deny",
            decisionSource: "tty-keypress",
            persistent: false,
            cacheEffect: "none",
            projectRoot: rebasedRoot,
            cacheKey: `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`,
            scopeLabel: "bash/spawn/process(npm)",
            lineage: "verify:npm test",
            stopReason: "user denied escalation",
            recordedAt: "2026-04-23T12:03:00.000Z",
          },
        ],
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 22,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.finalOutput).toContain("Authoritative approval now: deny");
    expect(result.finalOutput).toContain(
      "newer deny decision overrides earlier allow-always decision",
    );
  }, 15000);

  it("keeps scoped allow-always authority when newer decision is for another cacheKey in same root", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const nodeCacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:node`;
    const npmCacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`;

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_scope_precedence",
      prompt: "why is it asking again",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        lastVerificationStatus: "blocked",
        lastVerificationCommand: "node --version",
        lastApprovalDecision: "deny",
        lastApprovalDecisionSource: "tty-keypress",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: rebasedRoot,
        lastApprovalCacheKey: npmCacheKey,
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalLineage: "verify:npm test",
        lastApprovalStopReason: "user denied escalation",
        lastApprovalRecordedAt: "2026-04-23T12:08:00.000Z",
        lastApprovalHistory: [
          {
            decision: "allow-always",
            decisionSource: "cli-policy",
            persistent: true,
            cacheEffect: "allow-always-persisted",
            projectRoot: rebasedRoot,
            cacheKey: nodeCacheKey,
            scopeLabel: "bash/spawn/process(node)",
            lineage: "verify:node --version",
            recordedAt: "2026-04-23T12:02:00.000Z",
          },
          {
            decision: "deny",
            decisionSource: "tty-keypress",
            persistent: false,
            cacheEffect: "none",
            projectRoot: rebasedRoot,
            cacheKey: npmCacheKey,
            scopeLabel: "bash/spawn/process(npm)",
            lineage: "verify:npm test",
            stopReason: "user denied escalation",
            recordedAt: "2026-04-23T12:08:00.000Z",
          },
        ],
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 24,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.finalOutput).toContain("Authoritative approval now: allow-always");
    expect(result.finalOutput).toContain(
      "different scope/cacheKey",
    );
  }, 15000);

  it("prioritizes explicit current request scope over command-derived scope inference", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const nodeCacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:node`;
    const npmCacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`;

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_scope_explicit_request_scope",
      prompt: "why is it asking again",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        // Intentionally conflicts with explicit current request scope below.
        lastVerificationCommand: "node --version",
        lastRequestScopeCacheKey: npmCacheKey,
        lastRequestScopeLabel: "bash/spawn/process(npm)",
        lastRequestScopeProjectRoot: rebasedRoot,
        lastRequestScopeSource: "approval-request",
        lastApprovalDecision: "deny",
        lastApprovalDecisionSource: "tty-keypress",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: rebasedRoot,
        lastApprovalCacheKey: npmCacheKey,
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalLineage: "verify:npm test",
        lastApprovalStopReason: "user denied escalation",
        lastApprovalRecordedAt: "2026-04-23T12:08:00.000Z",
        lastApprovalHistory: [
          {
            decision: "allow-always",
            decisionSource: "cli-policy",
            persistent: true,
            cacheEffect: "allow-always-persisted",
            projectRoot: rebasedRoot,
            cacheKey: nodeCacheKey,
            scopeLabel: "bash/spawn/process(node)",
            lineage: "verify:node --version",
            recordedAt: "2026-04-23T12:02:00.000Z",
          },
          {
            decision: "deny",
            decisionSource: "tty-keypress",
            persistent: false,
            cacheEffect: "none",
            projectRoot: rebasedRoot,
            cacheKey: npmCacheKey,
            scopeLabel: "bash/spawn/process(npm)",
            lineage: "verify:npm test",
            stopReason: "user denied escalation",
            recordedAt: "2026-04-23T12:08:00.000Z",
          },
        ],
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 25,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.finalOutput).toContain("Authoritative approval now: deny");
    expect(result.finalOutput).toContain(
      "Current request context scope: bash/spawn/process(npm).",
    );
  }, 15000);

  it("keeps non-run-command scoped authority explanation on approval-memory reflective routing", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const writeTarget = `${rebasedRoot}/src/permission-target.txt`;
    const writeCacheKey = `${rebasedRoot.toLowerCase()}|write:write:target:${writeTarget.toLowerCase()}`;
    const bashCacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`;

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_non_run_scope",
      prompt: "why is it asking again for approval",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        // Intentionally noisy command-derived hint that should not override explicit permission request.
        lastVerificationCommand: "npm test -- --help",
        lastRequestScopeCacheKey: bashCacheKey,
        lastRequestScopeLabel: "bash/spawn/process(npm)",
        lastRequestScopeProjectRoot: rebasedRoot,
        lastRequestScopeSource: "approval-request",
        lastPermissionRequestToolName: "write",
        lastPermissionRequestOperation: "write",
        lastPermissionRequestTarget: writeTarget,
        lastPermissionRequestScopeKey: `write:write:target:${writeTarget.toLowerCase()}`,
        lastPermissionRequestScopeLabel: `write/write/target(${writeTarget})`,
        lastPermissionRequestCacheKey: writeCacheKey,
        lastPermissionRequestProjectRoot: rebasedRoot,
        lastPermissionRequestSource: "approval-request",
        lastApprovalDecision: "deny",
        lastApprovalDecisionSource: "tty-keypress",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: rebasedRoot,
        lastApprovalCacheKey: bashCacheKey,
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalLineage: "verify:npm test",
        lastApprovalStopReason: "user denied escalation",
        lastApprovalRecordedAt: "2026-04-23T12:28:00.000Z",
        lastApprovalHistory: [
          {
            decision: "allow-always",
            decisionSource: "cli-policy",
            persistent: true,
            cacheEffect: "allow-always-persisted",
            projectRoot: rebasedRoot,
            cacheKey: writeCacheKey,
            scopeLabel: `write/write/target(${writeTarget})`,
            lineage: "write:src/permission-target.txt",
            recordedAt: "2026-04-23T12:21:00.000Z",
          },
          {
            decision: "deny",
            decisionSource: "tty-keypress",
            persistent: false,
            cacheEffect: "none",
            projectRoot: rebasedRoot,
            cacheKey: bashCacheKey,
            scopeLabel: "bash/spawn/process(npm)",
            lineage: "verify:npm test",
            stopReason: "user denied escalation",
            recordedAt: "2026-04-23T12:28:00.000Z",
          },
        ],
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 26,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.finalOutput).toContain("Authoritative approval now: allow-always");
    expect(result.finalOutput).toContain("Subject permission request: write/write.");
    expect(result.finalOutput).toContain(
      "Current request context scope: bash/spawn/process(npm).",
    );
    expect(result.finalOutput).toContain(
      "Subject/current disambiguation: the subject approval request differs from the current request context scope.",
    );
    expect(result.finalOutput).toContain("different scope/cacheKey");
  }, 15000);

  it("avoids collapsing subject scope into approval scope when post-compact subject fields are partial", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const writeTarget = `${rebasedRoot}/src/partial-subject.txt`;
    const bashCacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`;

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_subject_partial_after_compact",
      prompt: "what did I just approve and why is it asking again",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        lastPermissionRequestToolName: "write",
        lastPermissionRequestOperation: "write",
        lastPermissionRequestTarget: writeTarget,
        // Intentionally missing subject scope/cacheKey/root in compacted memory.
        lastRequestScopeCacheKey: bashCacheKey,
        lastRequestScopeLabel: "bash/spawn/process(npm)",
        lastRequestScopeProjectRoot: rebasedRoot,
        lastRequestScopeSource: "approval-request",
        lastApprovalDecision: "allow-once",
        lastApprovalDecisionSource: "cli-policy",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: rebasedRoot,
        lastApprovalCacheKey: bashCacheKey,
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalRecordedAt: "2026-04-23T12:41:00.000Z",
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 30,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.finalOutput).toContain("Subject permission request: write/write.");
    expect(result.finalOutput).not.toContain("Subject permission scope: bash/spawn/process(npm).");
    expect(result.finalOutput).toContain(
      "Subject permission scope details are incomplete in compacted/recovered memory; using current context for why-asking-again reasoning.",
    );
    expect(result.finalOutput).toContain(
      "Current request context scope: bash/spawn/process(npm).",
    );
  }, 15000);

  it("reconstructs partial subject request from scoped approval history when lastPermissionRequest fields are missing", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const writeTarget = `${rebasedRoot}/src/history-reconstruct.txt`;
    const writeCacheKey = `${rebasedRoot.toLowerCase()}|write:write:target:${writeTarget.toLowerCase()}`;
    const bashCacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`;

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_subject_history_reconstruct",
      prompt: "what did I just approve and why is it asking again",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        // Subject object is intentionally absent to emulate legacy compacted sessions.
        lastRequestScopeCacheKey: bashCacheKey,
        lastRequestScopeLabel: "bash/spawn/process(npm)",
        lastRequestScopeProjectRoot: rebasedRoot,
        lastRequestScopeSource: "approval-request",
        lastApprovalDecision: "allow-once",
        lastApprovalDecisionSource: "cli-policy",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: rebasedRoot,
        lastApprovalCacheKey: bashCacheKey,
        lastApprovalScope: "bash/spawn/process(npm)",
        lastApprovalRecordedAt: "2026-04-23T12:51:00.000Z",
        lastApprovalHistory: [
          {
            decision: "allow-always",
            decisionSource: "cli-policy",
            persistent: true,
            cacheEffect: "allow-always-persisted",
            projectRoot: rebasedRoot,
            cacheKey: writeCacheKey,
            scopeLabel: `write/write/target(${writeTarget})`,
            lineage: "write:src/history-reconstruct.txt",
            recordedAt: "2026-04-23T12:49:00.000Z",
          },
          {
            decision: "allow-once",
            decisionSource: "cli-policy",
            persistent: false,
            cacheEffect: "none",
            projectRoot: rebasedRoot,
            cacheKey: bashCacheKey,
            scopeLabel: "bash/spawn/process(npm)",
            lineage: "verify:npm test",
            recordedAt: "2026-04-23T12:51:00.000Z",
          },
        ],
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 31,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.finalOutput).toContain("Subject permission request: bash/spawn/process(npm).");
    expect(result.finalOutput).toContain(
      "Subject reconstruction source: approval-history.",
    );
    expect(result.finalOutput).toContain(
      "Current request context scope: bash/spawn/process(npm).",
    );
  }, 15000);

  it("keeps subject-current separation after compact for non-run-command history when current context is bash", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const writeTarget = `${rebasedRoot}/src/cross-tool-subject.txt`;
    const writeCacheKey = `${rebasedRoot.toLowerCase()}|write:write:target:${writeTarget.toLowerCase()}`;
    const bashCacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:npm`;

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_cross_tool_subject_current_compact",
      prompt: "what did I just approve and why is it asking again",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        // Current context is now bash, but latest approved subject request was write/write.
        lastRequestScopeCacheKey: bashCacheKey,
        lastRequestScopeLabel: "bash/spawn/process(npm)",
        lastRequestScopeProjectRoot: rebasedRoot,
        lastRequestScopeSource: "approval-request",
        lastApprovalDecision: "allow-always",
        lastApprovalDecisionSource: "cli-policy",
        lastApprovalPersistent: true,
        lastApprovalCacheEffect: "allow-always-persisted",
        lastApprovalProjectRoot: rebasedRoot,
        lastApprovalCacheKey: writeCacheKey,
        lastApprovalScope: `write/write/target(${writeTarget})`,
        lastApprovalLineage: "write:src/cross-tool-subject.txt",
        lastApprovalRecordedAt: "2026-04-23T12:58:00.000Z",
        lastApprovalHistory: [
          {
            decision: "allow-once",
            decisionSource: "cli-policy",
            persistent: false,
            cacheEffect: "none",
            projectRoot: rebasedRoot,
            cacheKey: bashCacheKey,
            scopeLabel: "bash/spawn/process(npm)",
            lineage: "verify:npm test",
            recordedAt: "2026-04-23T12:55:00.000Z",
          },
          {
            decision: "allow-always",
            decisionSource: "cli-policy",
            persistent: true,
            cacheEffect: "allow-always-persisted",
            projectRoot: rebasedRoot,
            cacheKey: writeCacheKey,
            scopeLabel: `write/write/target(${writeTarget})`,
            lineage: "write:src/cross-tool-subject.txt",
            recordedAt: "2026-04-23T12:58:00.000Z",
          },
        ],
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 34,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.finalOutput).toContain("Subject permission request: write/write.");
    expect(result.finalOutput).toContain(
      `Subject permission target: ${writeTarget}.`,
    );
    expect(result.finalOutput).toContain(
      "Current request context scope: bash/spawn/process(npm).",
    );
    expect(result.finalOutput).toContain(
      "Subject/current disambiguation: the subject approval request differs from the current request context scope.",
    );
    expect(result.finalOutput).toContain(
      "Subject reconstruction source: approval-history.",
    );
  }, 15000);

  it("falls back to last-approval scoped reconstruction with explicit partial marker when history is unavailable", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const bashCacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:node`;

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_subject_last_approval_reconstruct",
      prompt: "what did I just approve and why is it asking again",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        lastApprovalDecision: "allow-once",
        lastApprovalDecisionSource: "cli-policy",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: rebasedRoot,
        lastApprovalCacheKey: bashCacheKey,
        lastApprovalScope: "bash/spawn/process(node)",
        lastApprovalRecordedAt: "2026-04-23T12:53:00.000Z",
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 33,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "reflective-state-query: approval-memory",
    );
    expect(result.finalOutput).toContain("Subject permission request: bash/spawn/process(node).");
    expect(result.finalOutput).toContain(
      "Subject permission scope details are incomplete in compacted/recovered memory; using current context for why-asking-again reasoning.",
    );
    expect(result.finalOutput).toContain(
      "Subject reconstruction source: last-approval.",
    );
  }, 15000);

  it("prefers subject tool/operation/target coherence over stale scope fragments after compact recovery", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const rebasedRoot = workspaceRoot.replace(/\\/g, "/");
    const target = `${rebasedRoot}/src/coherent-subject.txt`;

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_subject_coherence_compact",
      prompt: "what did I just approve and why is it asking again",
      workspaceRoot,
      continuityState: {
        projectRoot: rebasedRoot,
        lastTaskKind: "chat",
        lastPermissionRequestToolName: "edit",
        lastPermissionRequestOperation: "write",
        lastPermissionRequestTarget: target,
        // Legacy/stale scope fragments from earlier run-command-like request.
        lastPermissionRequestProcess: "node",
        lastPermissionRequestScopeLabel: "bash/spawn/process(node)",
        lastPermissionRequestCacheKey: `${rebasedRoot.toLowerCase()}|bash:spawn:process:node`,
        lastPermissionRequestProjectRoot: rebasedRoot,
        lastApprovalDecision: "allow-once",
        lastApprovalDecisionSource: "cli-policy",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: rebasedRoot,
        lastApprovalCacheKey: `${rebasedRoot.toLowerCase()}|bash:spawn:process:node`,
        lastApprovalScope: "bash/spawn/process(node)",
        lastApprovalRecordedAt: "2026-04-23T13:02:00.000Z",
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 35,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Subject permission request: edit/write.");
    expect(result.finalOutput).toContain("Subject permission scope: edit/write/target(");
    expect(result.finalOutput).toContain("coherent-subject.txt");
    expect(result.finalOutput).toContain("Subject permission cacheKey:");
    expect(result.finalOutput).toContain("edit:write:target:");
    expect(result.finalOutput).not.toContain("Subject permission request: edit/write/process(node).");
  }, 15000);

  it("rebases migrated subject target text to the current root when legacy target residue is detected", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const normalizedRoot = workspaceRoot.replace(/\\/g, "/");
    const legacyRoot = "D:/legacy-root";
    const legacyTarget = `${legacyRoot}/src/permission-cross-tool.txt`;
    await fs.writeFile(
      path.join(workspaceRoot, "src", "permission-cross-tool.txt"),
      "ok\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_permission_migration_target_cleanup",
      prompt: "what did I just approve and why is it asking again",
      workspaceRoot,
      continuityState: {
        projectRoot: normalizedRoot,
        lastTaskKind: "chat",
        lastPermissionRequestToolName: "edit",
        lastPermissionRequestOperation: "write",
        lastPermissionRequestTarget: legacyTarget,
        lastPermissionRequestScopeLabel: `edit/write/target(${legacyTarget})`,
        lastPermissionRequestCacheKey: `${normalizedRoot.toLowerCase()}|edit:write:target:${legacyTarget.toLowerCase()}`,
        lastPermissionRequestProjectRoot: normalizedRoot,
        lastApprovalDecision: "allow-once",
        lastApprovalDecisionSource: "cli-policy",
        lastApprovalPersistent: false,
        lastApprovalCacheEffect: "none",
        lastApprovalProjectRoot: normalizedRoot,
        lastApprovalCacheKey: `${normalizedRoot.toLowerCase()}|bash:spawn:process:node`,
        lastApprovalScope: "bash/spawn/process(node)",
        lastApprovalRecordedAt: "2026-04-24T01:00:00.000Z",
        compacted: true,
        compactReason: "auto-threshold",
        sourceTurnCount: 18,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Subject permission request: edit/write.");
    expect(result.finalOutput).toContain("Subject permission target:");
    expect(result.finalOutput).toContain("permission-cross-tool.txt");
    expect(result.finalOutput).toContain("Subject permission scope: edit/write/target(");
    expect(result.finalOutput).not.toContain(legacyRoot);
  }, 15000);

  it("materializes migration-rebased next-step reflective handoff into continuation execution", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src", "nested"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "nested", "reflective-next-step.txt"),
      ["a1", "a2", "a3", "a4"].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_next_step_handoff_rebased",
      prompt: "what should we do next? do that",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "read-file",
        lastGroundedDeliverableMode: "read",
        recentTargetFiles: ["D:/legacy-root/src/nested/reflective-next-step.txt"],
        lastReadWindowStart: 0,
        lastReadWindowEnd: 2,
        lastReadWindowSize: 2,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=read-file");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "continuation: restored-session-state-consumed",
    );
    expect(result.finalOutput).toContain("reflective-next-step.txt");
  }, 15000);

  it("keeps reflective read-position plus action handoff on rebased read continuity", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src", "nested"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "nested", "reflective-read-handoff.txt"),
      ["r1", "r2", "r3", "r4", "r5"].join("\n"),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_read_handoff_rebased",
      prompt: "where did we stop reading? continue reading next 2 lines",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "read-file",
        lastGroundedDeliverableMode: "read",
        recentTargetFiles: ["D:/legacy-root/src/nested/reflective-read-handoff.txt"],
        lastReadWindowStart: 1,
        lastReadWindowEnd: 3,
        lastReadWindowSize: 2,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=read-file");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "continuation: restored-session-state-consumed",
    );
    expect(result.finalOutput).toContain("reflective-read-handoff.txt");
  }, 15000);

  it("consumes restored task anchors for resume-check prompts without forcing edit/read continuation branches", async () => {
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_resume_task_anchor_chat",
      prompt:
        "After resume, report in 3 lines only: TASK=..., DONE=..., NEXT=... . Keep the exact task we have been doing.",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: "chat",
        lastTerminalClassification: "success",
        lastTerminalReason: "completed",
        lastUserIntent:
          "TASK=ContinuityTruth5 keep this task label and continue stepwise",
        lastAssistantOutput:
          "TASK=ContinuityTruth5\nDONE=step12 complete\nNEXT=step13",
        lastContinuationStatus: "continued",
        lastTaskSatisfactionVerdict: "satisfied",
        freshnessHistoryCount: 14,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=chat");
    expect(result.sharedContext.notes.join("\n")).not.toContain(
      "freshness-reset:new-task",
    );
    expect(result.stopReason ?? "").not.toContain(
      "no active file could be inherited",
    );
    expect(result.stopReason ?? "").not.toContain(
      "no recoverable target candidate",
    );
  }, 15000);

  it("keeps task identity on explicit session-id resume-check prompts", async () => {
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_resume_task_anchor_explicit_session_id",
      prompt:
        "Explicit session-id resume check: report in 3 lines only with TASK=..., DONE=..., NEXT=... and keep the exact task.",
      workspaceRoot,
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: "chat",
        lastTerminalClassification: "success",
        lastTerminalReason: "completed",
        lastUserIntent:
          "TASK=ContinuityTruth5 keep this task label and continue stepwise",
        lastAssistantOutput:
          "TASK=ContinuityTruth5\nDONE=step12 complete\nNEXT=step13",
        lastContinuationStatus: "continued",
        lastTaskSatisfactionVerdict: "satisfied",
        freshnessHistoryCount: 14,
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=chat");
    expect(result.sharedContext.notes.join("\n")).not.toContain(
      "freshness-reset:new-task",
    );
    expect(result.finalOutput).toContain("TASK=ContinuityTruth5");
    expect(result.finalOutput).toContain("DONE=step12");
    expect(result.finalOutput).toContain("NEXT=step13");
    expect(result.finalOutput).not.toMatch(/Explicit\s+resume/i);
  }, 15000);

  it("continues blocker->fix on rebased target after migration-like root change (English)", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "reflective-fix-rebased-en.txt");
    await fs.writeFile(targetPath, ["alpha", "gamma", "omega"].join("\n"), "utf8");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_fix_rebased_en",
      prompt: "why did it stop, then continue",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "edit-file",
        lastTerminalClassification: "stopped",
        lastTerminalReason: "stopped_error",
        lastFailure: "verify failed after previous replacement",
        recentTargetFiles: ["D:/legacy-root/src/reflective-fix-rebased-en.txt"],
        recentFailedFiles: [
          {
            path: "D:/legacy-root/src/reflective-fix-rebased-en.txt",
            reason: "patch-generation-failed",
          },
        ],
        lastContinuationEvidence: [
          "transform:D:/legacy-root/src/reflective-fix-rebased-en.txt:gamma=>delta",
        ],
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=edit-file");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "continuation: restored-session-state-consumed",
    );
    expect(await fs.readFile(targetPath, "utf8")).toContain("delta");
  }, 15000);

  it("continues blocker->fix on rebased target after migration-like root change (Chinese)", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "reflective-fix-rebased-zh.txt");
    await fs.writeFile(targetPath, ["left", "gamma", "right"].join("\n"), "utf8");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_reflective_fix_rebased_zh",
      prompt: "刚才为什么停了？那继续修",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "edit-file",
        lastTerminalClassification: "stopped",
        lastTerminalReason: "stopped_error",
        lastFailure: "verify failed after previous replacement",
        recentTargetFiles: ["D:/legacy-root/src/reflective-fix-rebased-zh.txt"],
        recentFailedFiles: [
          {
            path: "D:/legacy-root/src/reflective-fix-rebased-zh.txt",
            reason: "patch-generation-failed",
          },
        ],
        lastContinuationEvidence: [
          "transform:D:/legacy-root/src/reflective-fix-rebased-zh.txt:gamma=>delta",
        ],
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=edit-file");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "continuation: restored-session-state-consumed",
    );
    expect(await fs.readFile(targetPath, "utf8")).toContain("delta");
  }, 15000);

  it("materializes migration-rebased verify continuation via structured verify object", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({
        name: "t10-verify-object-rebased",
        private: true,
      }),
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "verify-rebased.txt");
    await fs.writeFile(targetPath, "value=delta\n", "utf8");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_verify_object_rebased",
      prompt: "verify it again",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "edit-file",
        lastVerificationStatus: "failed",
        lastVerificationCommand: "node --version",
        lastVerificationReason: "tests failed in previous run",
        recentTargetFiles: ["D:/legacy-root/src/verify-rebased.txt"],
      },
      maxTurns: 6,
    });

    expect(["completed", "stopped_error"]).toContain(result.status);
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=run-command");
    expect(result.sharedContext.notes.join("\n")).toContain(
      "continuation: restored-session-state-consumed",
    );
    if (result.status === "completed") {
      expect(result.codingResult?.verification.command).toBe("node --version");
    } else {
      expect(result.stopReason).toMatch(
        /(?:Run-command intent is not allowed in the MVP allowlist|Escalation denied by user|Re-run and approve escalation for verify command execution\.)/,
      );
    }
  }, 15000);

  it("persists verify command hint after blocker->fix continuation for verify closure", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "repair-verify-hint.txt");
    await fs.writeFile(targetPath, ["alpha", "gamma", "omega"].join("\n"), "utf8");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_repair_verify_hint",
      prompt: "why did it stop, then continue",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "edit-file",
        lastTerminalClassification: "stopped",
        lastTerminalReason: "stopped_error",
        lastFailure: "verify failed after previous replacement",
        lastVerificationStatus: "failed",
        lastVerificationCommand: "npm test -- --help",
        recentTargetFiles: ["D:/legacy-root/src/repair-verify-hint.txt"],
        recentFailedFiles: [
          {
            path: "D:/legacy-root/src/repair-verify-hint.txt",
            reason: "patch-generation-failed",
          },
        ],
        lastContinuationEvidence: [
          "transform:D:/legacy-root/src/repair-verify-hint.txt:gamma=>delta",
        ],
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.sharedContext.notes.join("\n")).toContain("plan: intent=edit-file");
    expect(result.codingResult?.evidence).toContain(
      "verify-command-hint:npm test -- --help",
    );
    expect(result.codingResult?.evidence).toContain(
      `verify-target-hint:${targetPath.replace(/\\/g, "/")}`,
    );
  }, 15000);

  it("truthfully blocks verify continuation when structured verify object misses command evidence", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "verify-missing-command.txt");
    await fs.writeFile(targetPath, "value=delta\n", "utf8");

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_verify_object_missing_command",
      prompt: "verify it again",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "edit-file",
        lastVerificationStatus: "failed",
        recentTargetFiles: ["D:/legacy-root/src/verify-missing-command.txt"],
      },
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toContain("Verify continuation is unavailable: missing command.");
  }, 15000);

  it("persists blocked verify lineage when approval is denied for verify continuation", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({
        name: "t10-verify-approval-lineage",
        private: true,
      }),
      "utf8",
    );
    const targetPath = path.join(workspaceRoot, "src", "verify-approval-lineage.txt");
    await fs.writeFile(targetPath, "value=delta\n", "utf8");

    const events: QueryEvent[] = [];
    for await (const event of streamMvpIntegratedFlow({
      sessionId: "sess_t10_verify_approval_lineage",
      prompt: "continue with that verification",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "run-command",
        lastVerificationStatus: "blocked",
        lastVerificationCommand: "node --version",
        lastVerificationReason: "Approval denied by user for bash",
        recentTargetFiles: ["D:/legacy-root/src/verify-approval-lineage.txt"],
        lastContinuationEvidence: [
          "verify-command-hint:node --version",
          "verify-target-hint:D:/legacy-root/src/verify-approval-lineage.txt",
          "verify-blocker-kind:approval-denied",
        ],
      },
      maxTurns: 6,
    })) {
      events.push(event);
    }

    const completed = events.find(
      (event): event is Extract<QueryEvent, { type: "query.completed" }> =>
        event.type === "query.completed",
    );
    expect(completed?.result.status).toBe("stopped_error");
    expect(completed?.result.codingResult?.verification.status).toBe("blocked");
    expect(completed?.result.codingResult?.verification.blockerKind).toBe(
      "approval-denied",
    );
    expect(completed?.result.codingResult?.verification.command).toBe("node --version");
    expect(completed?.result.codingResult?.evidence).toContain(
      "verify-blocker-kind:approval-denied",
    );
    expect(
      completed?.result.codingResult?.evidence.some((entry) =>
        entry.startsWith("verify-next-action:"),
      ),
    ).toBe(true);
  }, 15000);

  it("keeps blocked verify next-step recommendation resumable via structured verify object", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "verify-next-step-blocked.txt");
    await fs.writeFile(targetPath, "value=delta\n", "utf8");

    const recommendation = await runMvpIntegratedFlow({
      sessionId: "sess_t10_verify_next_step_blocked",
      prompt: "what should we do next?",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "run-command",
        lastVerificationStatus: "blocked",
        lastVerificationCommand: "node --version",
        lastVerificationReason: "Approval denied by user for bash",
        recentTargetFiles: ["D:/legacy-root/src/verify-next-step-blocked.txt"],
        lastContinuationEvidence: [
          "verify-command-hint:node --version",
          "verify-target-hint:D:/legacy-root/src/verify-next-step-blocked.txt",
          "verify-blocker-kind:approval-denied",
        ],
      },
      maxTurns: 6,
    });

    expect(recommendation.status).toBe("completed");
    expect(recommendation.finalOutput).toContain(
      "rerun verification command (node --version) after resolving blocker (approval-denied)",
    );

    const resumed = await runMvpIntegratedFlow({
      sessionId: "sess_t10_verify_next_step_blocked_resume",
      prompt: "continue with that verification",
      workspaceRoot,
      continuityState: {
        projectRoot: "D:/legacy-root",
        lastTaskKind: "run-command",
        lastVerificationStatus: "blocked",
        lastVerificationCommand: "node --version",
        lastVerificationReason: "Approval denied by user for bash",
        recentTargetFiles: ["D:/legacy-root/src/verify-next-step-blocked.txt"],
        lastContinuationEvidence: [
          "verify-command-hint:node --version",
          "verify-target-hint:D:/legacy-root/src/verify-next-step-blocked.txt",
          "verify-blocker-kind:approval-denied",
        ],
      },
      maxTurns: 6,
    });

    expect(["completed", "stopped_error"]).toContain(resumed.status);
    expect(resumed.sharedContext.notes.join("\n")).toContain("plan: intent=run-command");
    if (resumed.codingResult) {
      expect(resumed.codingResult.verification.command).toBe("node --version");
    }
  }, 15000);

  it("resumes blocked verify via the same verify object after approval is granted", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "verify-resume-granted.txt");
    await fs.writeFile(targetPath, "value=delta\n", "utf8");

    const resumed = await runMvpIntegratedFlow({
      sessionId: "sess_t10_verify_resume_granted",
      prompt: "what should we do next? do that",
      workspaceRoot,
      escalationDecision: "allow-once",
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: "run-command",
        lastVerificationStatus: "blocked",
        lastVerificationCommand: "node --version",
        lastVerificationReason: "Approval denied by user for bash",
        lastVerificationBlockerKind: "approval-denied",
        lastVerificationResumeEligible: true,
        recentTargetFiles: [targetPath],
        lastContinuationEvidence: [
          "verify-command-hint:node --version",
          `verify-target-hint:${targetPath.replace(/\\/g, "/")}`,
          `verify-cwd-hint:${workspaceRoot.replace(/\\/g, "/")}`,
          "verify-blocker-kind:approval-denied",
          "verify-next-action:Re-run and approve escalation for verify command execution.",
          "verify-resume-eligible:true",
        ],
      },
      maxTurns: 6,
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.sharedContext.notes.join("\n")).toContain("plan: intent=run-command");
    expect(resumed.codingResult?.verification.status).toBe("passed");
    expect(resumed.codingResult?.verification.command).toBe("node --version");
  }, 15000);

  it("truthfully blocks verify resume when verify object cwd authority mismatches workspace root", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    const targetPath = path.join(workspaceRoot, "src", "verify-resume-mismatch.txt");
    await fs.writeFile(targetPath, "value=delta\n", "utf8");

    const resumed = await runMvpIntegratedFlow({
      sessionId: "sess_t10_verify_resume_mismatch",
      prompt: "continue with that verification",
      workspaceRoot,
      escalationDecision: "allow-once",
      continuityState: {
        projectRoot: workspaceRoot,
        lastTaskKind: "run-command",
        lastVerificationStatus: "blocked",
        lastVerificationCommand: "node --version",
        lastVerificationReason: "Approval denied by user for bash",
        lastVerificationBlockerKind: "approval-denied",
        lastVerificationResumeEligible: true,
        recentTargetFiles: [targetPath],
        lastContinuationEvidence: [
          "verify-command-hint:node --version",
          `verify-target-hint:${targetPath.replace(/\\/g, "/")}`,
          "verify-cwd-hint:D:/legacy-root",
          "verify-blocker-kind:approval-denied",
          "verify-resume-eligible:true",
        ],
      },
      maxTurns: 6,
    });

    expect(resumed.status).toBe("stopped_error");
    expect(resumed.stopReason).toContain(
      "Verify continuation is unavailable: rebased workspace authority mismatch for verify command cwd.",
    );
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
