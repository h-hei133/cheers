import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import { GitWorktreeManager, type WorktreeAllocation, type WorktreeRelease } from "../workflow/gitWorktreeManager.js";
import { SubagentLoader } from "../subagents/subagentLoader.js";
import { AgentMemoryManager } from "../subagents/agentMemoryManager.js";
import { defaultHookDispatcher } from "../hooks/hookDispatcher.js";
import { projectTrust } from "../security/projectTrust.js";
import { bindRole } from '../subagents/admission.js';

/**
 * /task & /agent tool
 * Dispatches a subagent to perform an independent research, analysis, or modification task.
 * Integrates .agents/*.md frontmatter loader, worktree isolation, persistent agent-memory, and lifecycle hooks.
 */
export function createTaskToolDefinition(
  worktreeManager?: Pick<GitWorktreeManager, "allocateWorktree" | "releaseWorktree">,
): ToolDefinition {
  const tool: ToolDefinition = {
    name: "task",
    description:
      "Delegate a focused multi-step task and return its result. Optionally use a separate Git worktree.",
    argsSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Short 3-5 word summary of the subtask.",
        },
        prompt: {
          type: "string",
          description: "Detailed instructions and acceptance criteria for the subagent.",
        },
        context: {
          type: "string",
          description: "Relevant file paths or background context for the subagent.",
        },
        subagent_type: {
          type: "string",
          description: "Optional custom or built-in subagent name (e.g. Explore, Plan, code-reviewer, general-purpose).",
        },
        agentMode: {
          type: "string",
          enum: ["plan", "build"],
          description: "Mode for the subagent (plan for read-only, build for modifications).",
        },
        isolation: {
          type: "string",
          enum: ["worktree", "none"],
          description: "Filesystem isolation mode (worktree for separate git branch/directory, none for shared workspace).",
        },
      },
      required: ["description", "prompt"],
    },
    async execute(args, context) {
      const description = typeof args.description === "string" ? args.description.trim() : "";
      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      if (!description || !prompt) return deniedResult("Error: description and prompt are required for task tool.");
      if (args.agentMode !== undefined && args.agentMode !== "plan" && args.agentMode !== "build") {
        return deniedResult("Error: agentMode must be plan or build.");
      }
      if (args.isolation !== undefined && args.isolation !== "worktree" && args.isolation !== "none") {
        return deniedResult("Error: isolation must be worktree or none.");
      }
      const requestedType = (typeof args.subagent_type === "string" ? args.subagent_type.trim() : "") || "general-purpose";
      const loader = new SubagentLoader(context.workspaceRoot, context.assertSourceAccess);
      const trusted = () => !projectTrust.isProjectUntrusted(context.workspaceRoot);
      const discovery = loader.discover(trusted());
      const selected = discovery.effective.get(requestedType.toLowerCase());
      if (!selected && !trusted()) return deniedResult('Unknown custom agent dispatch is refused in an untrusted workspace.');
      if (selected && (!selected.definition || selected.definition.enabled === false)) return deniedResult('Agent is disabled or invalid; the task was not started.');
      if (discovery.diagnostics.some(note => /unreadable|limit reached|unsafe path/.test(note))) return deniedResult('Agent discovery is incomplete; the task was not started.');
      const subagentDef = selected?.definition;
      const role = bindRole(loader, requestedType, subagentDef, trusted, context.abortSignal);
      const subtaskId = `task_${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
      const agentType = subagentDef?.name || requestedType;
      const contextStr = typeof args.context === "string" ? args.context.trim() : "";
      const shouldIsolate = (args.isolation || subagentDef?.isolation) === "worktree";
      const manager = shouldIsolate ? worktreeManager ?? new GitWorktreeManager(context.workspaceRoot) : undefined;
      let allocated: WorktreeAllocation | undefined;
      let release: WorktreeRelease | undefined;
      let effectiveWorkspace = context.workspaceRoot;
      let mode = "not started";
      let subagentResponse = "";
      let subagentFailure = "";
      let allowedTools: readonly string[] = [];
      let stepsTaken = 0;
      let startAttempted = false;
      const fail = (message: string): void => {
        subagentFailure = [subagentFailure, message.trim() || "the subagent failed"].filter(Boolean).join("; ");
      };
      const reason = (error: unknown): string => error instanceof Error ? error.message : String(error);

      try {
        if (!context.runSubagent) {
          fail("no model is available to this session, so the subagent was not started");
        } else {
          startAttempted = true;
          await defaultHookDispatcher.dispatch({ eventName: "SubagentStart", sessionId: context.taskId || subtaskId,
            workspaceRoot: context.workspaceRoot, timestamp: new Date().toISOString(), agentId: subtaskId, agentType });
          const afterStart = role.admission(); if (afterStart) throw new Error(afterStart);
          let memoryContext = "";
          if (subagentDef?.memory) {
            const mem = new AgentMemoryManager(context.workspaceRoot).loadMemory(agentType, subagentDef.memory);
            if (mem.content) memoryContext = `[Agent Persistent Memory (${subagentDef.memory})]:\n${mem.content.slice(0, 1000)}`;
          }
          if (manager) {
            const candidate = await manager.allocateWorktree(subtaskId, role.signal);
            if (!candidate.isIsolated || candidate.worktreePath === context.workspaceRoot) {
              throw new Error("An isolated worktree was not established; the subagent was not started.");
            }
            allocated = candidate;
            effectiveWorkspace = candidate.workingDirectory;
            await defaultHookDispatcher.dispatch({ eventName: "WorktreeCreate", sessionId: context.taskId || subtaskId,
              workspaceRoot: context.workspaceRoot, timestamp: new Date().toISOString(), subtaskId,
              worktreePath: allocated.worktreePath, branch: allocated.branch });
          }
          const refused = role.admission();
          if (refused) throw new Error(refused);
          if (role.signal.aborted) throw new Error("The task was cancelled before the subagent started.");
          mode = "not reported by runner";
          const result = await context.runSubagent({
            definition: subagentDef ?? {
              name: agentType, description,
              systemPrompt: `You are ${agentType}, an autonomous subagent for: "${description}".`,
              source: "builtin",
            },
            prompt, ...(args.agentMode ? { agentMode: args.agentMode } : {}), workspace: effectiveWorkspace,
            ...(contextStr ? { context: contextStr } : {}), ...(memoryContext ? { memory: memoryContext } : {}),
            signal: role.signal, admission: role.admission,
          });
          subagentResponse = result.text;
          mode = result.agentMode === "plan" ? "PLAN (Read-Only)"
            : result.agentMode === "build" ? "BUILD (Standard)" : "not reported by runner";
          allowedTools = result.allowedTools;
          stepsTaken = result.steps;
          if (result.failed) fail(result.failure || "the subagent failed");
          else if (!result.text.trim()) fail("the subagent returned no answer");
          if (role.admission()) fail('Agent definition changed during the task; returned work is partial.');
        }
      } catch (error) {
        fail(reason(error));
      } finally {
        if (allocated && manager) {
          try {
            // Cleanup has its own bounded lifetime even after the child is cancelled.
            release = await manager.releaseWorktree(subtaskId);
          } catch (error) {
            release = { outcome: "unverified", worktreePath: allocated.worktreePath, branch: allocated.branch,
              worktreeStatus: "unknown", branchStatus: "unknown", reason: reason(error) };
          }
          if (release.outcome === "unverified") fail(`Worktree cleanup unverified: ${release.reason}`);
          if (release.outcome === "removed" || (release.outcome === "unverified" && release.worktreeStatus === "removed")) {
            try {
              await defaultHookDispatcher.dispatch({ eventName: "WorktreeRemove", sessionId: context.taskId || subtaskId,
                workspaceRoot: context.workspaceRoot, timestamp: new Date().toISOString(), subtaskId, worktreePath: allocated.worktreePath });
            } catch (error) { fail(`WorktreeRemove hook failed: ${reason(error)}`); }
          }
        }
        if (startAttempted) {
          try {
            await defaultHookDispatcher.dispatch({ eventName: "SubagentStop", sessionId: context.taskId || subtaskId,
              workspaceRoot: context.workspaceRoot, timestamp: new Date().toISOString(), agentId: subtaskId, agentType });
          } catch (error) { fail(`SubagentStop hook failed: ${reason(error)}`); }
        }
        role.close();
      }

      const lines: string[] = [
        `# 🤖 Subagent Task ${subagentFailure ? "Failed" : "Completed"} (\`${subtaskId}\`)`, "",
        `- **Agent Type**: \`${agentType}\` (${subagentDef?.source || "dynamic"})`,
        `- **Description**: ${description}`, `- **Mode**: \`${mode}\``,
        `- **Requested model**: ${subagentDef?.model ?? 'inherited from parent'}`,
        `- **Requested effort**: ${subagentDef?.effort === null ? 'provider default' : subagentDef?.effort ?? 'inherited from parent'} (selected-model capability is checked at dispatch; unknown capability remains unverified)`,
        `- **Filesystem Isolation**: \`${allocated ? `Git Worktree (${effectiveWorkspace})` : shouldIsolate ? "not established" : "Shared Workspace"}\``,
        ...(release ? [`- **Worktree cleanup**: ${release.outcome}`] : []),
        ...(contextStr ? [`- **Context Attached**: ${contextStr}`] : []),
        `- **Tools available**: ${allowedTools.length > 0 ? allowedTools.join(", ") : "none"}`,
        `- **Steps Used**: ${stepsTaken}`, "",
      ];
      if (release?.outcome === "kept") {
        lines.push("## Worktree Retained", release.reason,
          `Work remains at \`${release.worktreePath}\`; it was not merged into the parent workspace.`,
          `Checkout: ${release.currentBranch === "HEAD" ? "detached HEAD" : `branch \`${release.currentBranch}\``}. Allocated branch: \`${release.branch}\`.`,
          "Review the retained work before merging or removing it.", "");
      } else if (release?.outcome === "unverified") {
        lines.push("## Worktree Cleanup Unverified",
          `Inspect \`${allocated?.worktreePath}\` and branch \`${allocated?.branch}\`.`,
          `Worktree: ${release.worktreeStatus}; branch: ${release.branchStatus}.`, release.reason, "");
      }
      lines.push("## Subagent Execution Result:",
        ...(subagentFailure ? [`Task failed: ${subagentFailure}`, ""] : []),
        ...(subagentResponse.trim() ? [subagentFailure ? "Partial response:" : "Response:", subagentResponse] : []));
      return subagentFailure ? { success: false, error: lines.join("\n") } : approvedResult(lines.join("\n"));
    },
  };
  return { ...tool, prepare: (args, context) => {
    const name = (typeof args.subagent_type === 'string' ? args.subagent_type.trim() : '') || 'general-purpose';
    const loader = new SubagentLoader(context.workspaceRoot, context.assertSourceAccess);
    const trusted = !projectTrust.isProjectUntrusted(context.workspaceRoot);
    const initial = loader.discover(trusted).effective.get(name.toLowerCase());
    const identity = initial?.definition?.identity;
    if (initial && (!initial.definition || initial.definition.enabled === false)) throw new Error('Agent is disabled or invalid; the task was not started.');
    return { targets: [], permissionArgs: { ...args }, preview: `Delegate to ${name}; source=${initial?.source ?? 'dynamic'}; model=${initial?.definition?.model ?? 'inherit'}; effort=${initial?.definition?.effort === null ? 'auto' : initial?.definition?.effort ?? 'inherit'}. The selected definition identity is bound to this approval.`,
      execute: async approved => {
        const currentTrust = !projectTrust.isProjectUntrusted(context.workspaceRoot);
        const current = loader.discover(currentTrust).effective.get(name.toLowerCase());
        if (approved.workspaceRoot !== context.workspaceRoot || approved.sessionId !== context.sessionId || trusted !== currentTrust
          || current?.definition?.identity !== identity || current && (!current.definition || current.definition.enabled === false)) {
          return deniedResult('Agent definition or session changed after task approval; the task was not started.');
        }
        return tool.execute(args, approved);
      } };
  } };
}
