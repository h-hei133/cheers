import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import { GitWorktreeManager } from "../workflow/gitWorktreeManager.js";
import { SubagentLoader } from "../subagents/subagentLoader.js";
import { AgentMemoryManager } from "../subagents/agentMemoryManager.js";
import { defaultHookDispatcher } from "../hooks/hookDispatcher.js";
import { projectTrust } from "../security/projectTrust.js";

const defaultWorktreeManager = new GitWorktreeManager();

/**
 * Steps a subagent gets when its definition declares none.
 *
 * A delegated run has no user watching it, so nothing else would end one that
 * loops. Bounded rather than generous: the point of delegating is to get an
 * answer back, and a subagent that runs long enough to exhaust the context has
 * usually misunderstood the task.
 */
const DEFAULT_SUBAGENT_STEPS = 20;

/**
 * /task & /agent tool
 * Dispatches an isolated subagent to perform an independent research, analysis, or modification task.
 * Integrates .agents/*.md frontmatter loader, worktree isolation, persistent agent-memory, and lifecycle hooks.
 */
export function createTaskToolDefinition(
  worktreeManager: GitWorktreeManager = defaultWorktreeManager,
): ToolDefinition {
  return {
    name: "task",
    description:
      "Dispatch an isolated background or foreground subagent to perform focused multi-step tasks without cluttering the main conversation history.",
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
      if (!description || !prompt) {
        return deniedResult("Error: description and prompt are required for task tool.");
      }
      if (args.agentMode !== undefined && args.agentMode !== "plan" && args.agentMode !== "build") {
        return deniedResult("Error: agentMode must be plan or build.");
      }

      const requestedType = (typeof args.subagent_type === "string" ? args.subagent_type.trim() : "") || "general-purpose";
      const loader = new SubagentLoader(context.workspaceRoot);
      const subagentDef = loader.getSubagent(
        requestedType,
        !projectTrust.isProjectUntrusted(context.workspaceRoot),
      );

      const randomSuffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
      const subtaskId = `task_${randomSuffix}`;
      const agentType = subagentDef?.name || requestedType;
      let mode = "not started";
      const contextStr = typeof args.context === "string" ? args.context.trim() : "";
      const shouldIsolate = (args.isolation || subagentDef?.isolation) === "worktree";

      // 1. Dispatch SubagentStart lifecycle hook
      await defaultHookDispatcher.dispatch({
        eventName: "SubagentStart",
        sessionId: context.taskId || subtaskId,
        workspaceRoot: context.workspaceRoot,
        timestamp: new Date().toISOString(),
        agentId: subtaskId,
        agentType,
      });

      // 2. Resolve Agent Memory if defined
      let memoryContext = "";
      if (subagentDef?.memory) {
        const memoryMgr = new AgentMemoryManager(context.workspaceRoot);
        const mem = memoryMgr.loadMemory(agentType, subagentDef.memory);
        if (mem.content) {
          memoryContext = `\n\n[Agent Persistent Memory (${subagentDef.memory})]:\n${mem.content.slice(0, 1000)}`;
        }
      }

      // 3. Allocate Git Worktree if isolation requested
      let allocatedWorktree = null;
      let effectiveWorkspace = context.workspaceRoot;

      if (shouldIsolate) {
        try {
          allocatedWorktree = await worktreeManager.allocateWorktree(subtaskId);
          effectiveWorkspace = allocatedWorktree.worktreePath;
        } catch {
          // Fallback to shared workspace
        }
        // Announced outside the allocation guard: a hook that throws is a hook
        // problem, not a reason to silently drop the worktree we just made.
        if (allocatedWorktree) {
          await defaultHookDispatcher.dispatch({
            eventName: "WorktreeCreate",
            sessionId: context.taskId || subtaskId,
            workspaceRoot: context.workspaceRoot,
            timestamp: new Date().toISOString(),
            subtaskId,
            worktreePath: allocatedWorktree.worktreePath,
            branch: allocatedWorktree.branch,
          });
        }
      }

      let subagentResponse = "";
      // Why no answer arrived, when none did. Without it the report below claimed
      // the work was completed on the strength of an empty string.
      let subagentFailure = "";
      // Where a subagent's changes were left, when it made any. Reported because
      // a kept worktree is the only way to find them.
      let keptWorktree: { readonly worktreePath: string; readonly branch: string } | undefined;
      let allowedTools: readonly string[] = [];
      let stepsTaken = 0;

      try {
        // The runner is supplied by the turn, which owns the model side. Without
        // it there is nothing to run a subagent on, and saying so is the only
        // honest answer — the previous implementation reached for environment
        // variables instead and asked a provider the session had not chosen.
        if (!context.runSubagent) {
          subagentFailure = "no model is available to this session, so the subagent was not started";
        } else {
          mode = "not reported by runner";
          const result = await context.runSubagent({
            definition: {
              name: agentType,
              description,
              systemPrompt: subagentDef?.systemPrompt
                ?? `You are ${agentType}, an autonomous subagent for: "${description}".`,
              ...(subagentDef?.tools ? { tools: subagentDef.tools } : {}),
              ...(subagentDef?.disallowedTools ? { disallowedTools: subagentDef.disallowedTools } : {}),
              ...(subagentDef?.maxTurns !== undefined ? { maxTurns: subagentDef.maxTurns } : {}),
              ...(subagentDef?.permissionMode ? { permissionMode: subagentDef.permissionMode } : {}),
              source: subagentDef?.source ?? "builtin",
            },
            prompt,
            ...(args.agentMode ? { agentMode: args.agentMode } : {}),
            workspace: effectiveWorkspace,
            ...(contextStr ? { context: contextStr } : {}),
            ...(memoryContext ? { memory: memoryContext } : {}),
            ...(context.abortSignal ? { signal: context.abortSignal } : {}),
          });
          subagentResponse = result.text;
          mode = result.agentMode === "plan" ? "PLAN (Read-Only)"
            : result.agentMode === "build" ? "BUILD (Standard)" : "not reported by runner";
          allowedTools = result.allowedTools;
          stepsTaken = result.steps;
          if (result.failed) subagentFailure = result.failure ?? "the subagent failed";
        }
      } catch (error) {
        subagentFailure = error instanceof Error ? error.message : String(error);
      } finally {
        if (allocatedWorktree) {
          // Released, not merged. Changes are kept and reported below; the
          // caller decides whether they belong in the working tree. A release
          // that removed the worktree dispatches the removal hook, because the
          // path in that payload is one that no longer exists.
          const release = await worktreeManager.releaseWorktree(subtaskId);
          keptWorktree = release.outcome === "kept" ? release : undefined;
          if (release.outcome === "removed") {
            await defaultHookDispatcher.dispatch({
              eventName: "WorktreeRemove",
              sessionId: context.taskId || subtaskId,
              workspaceRoot: context.workspaceRoot,
              timestamp: new Date().toISOString(),
              subtaskId,
              worktreePath: allocatedWorktree.worktreePath,
            });
          }
        }

        // 4. Dispatch SubagentStop lifecycle hook
        await defaultHookDispatcher.dispatch({
          eventName: "SubagentStop",
          sessionId: context.taskId || subtaskId,
          workspaceRoot: context.workspaceRoot,
          timestamp: new Date().toISOString(),
          agentId: subtaskId,
          agentType,
        });
      }

      const lines: string[] = [
        `# 🤖 Subagent Task Executed (\`${subtaskId}\`)`,
        "",
        `- **Agent Type**: \`${agentType}\` (${subagentDef?.source || "dynamic"})`,
        `- **Description**: ${description}`,
        `- **Mode**: \`${mode}\``,
        `- **Filesystem Isolation**: \`${shouldIsolate ? `Git Worktree (${effectiveWorkspace})` : "Shared Workspace"}\``,
        ...(contextStr ? [`- **Context Attached**: ${contextStr}`] : []),
        `- **Tools available**: ${allowedTools.length > 0 ? `\`${allowedTools.join("\`, \`")}\`` : "none"}`,
        `- **Steps Used**: ${stepsTaken}`,
        "",
        ...(keptWorktree
          ? [
              "",
              "## Changes Left In A Worktree",
              `The subagent changed files. They were **not** merged into the working tree; they are at \`${keptWorktree.worktreePath}\` on branch \`${keptWorktree.branch}\`.`,
              "Review them and merge, or remove the worktree when they are not wanted.",
            ]
          : []),
        "",
        "## Subagent Execution Result:",
        subagentResponse ||
          (subagentFailure
            ? `The subagent could not be run: ${subagentFailure}`
            : // No provider configured. Saying the work was completed would be a
              // claim nothing supports — the delegation was prepared and then
              // never sent.
              `The subagent was not dispatched: no provider credential is configured, so nothing was sent.`),
      ];
      // A subagent that was never reached is a failure, and returning it as a
      // success is how a caller ends up believing work happened that did not. The
      // report goes in `error` because that is where a failed result carries its
      // text; a caller reading `output` sees nothing rather than a success story.
      return subagentResponse
        ? approvedResult(lines.join("\n"))
        : { success: false, error: lines.join("\n") };
    },
  };
}
