import type { PermissionScope } from "../cli/approval/permissionScope.js";
import type { AgentTool, AgentToolResult, ToolHooks } from "../core/agent/tools.js";
import type { HookDispatcher } from "../core/hooks/hookDispatcher.js";
import { DoomLoopDetector } from "../core/query/doomLoopDetector.js";
import { buildToolEscalationPrompt, evaluateToolPermissionScope, READ_ONLY_BROWSER_ACTIONS } from "../core/query/toolPolicy.js";
import { isReadOnlyBashCommand } from "../core/shell/approval/evaluator.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { AskQuestion } from "../core/tools/ask.js";
import type { EscalationPrompt, EscalationResponse } from "../sandbox/index.js";
import type { ToolDefinition } from "../tools/types.js";

/** A tool definition in the shape a chat completion request takes. */
export interface ToolSchema {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description?: string;
    readonly parameters: Record<string, unknown>;
  };
}

/**
 * The registry's tools as the kernel runs them.
 *
 * The kernel knows how to run a tool and pair its result; it does not know
 * what the user allowed, what mode the session is in, or which hooks want a
 * say. Those decisions live here, in front of every call, and the answer to
 * each is written into the tool result so the model learns why a call did not
 * run rather than seeing it silently skipped.
 */

export interface ToolGateOptions {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly agentMode?: "plan" | "build";
  readonly permissionScope?: PermissionScope;
  readonly hooks: HookDispatcher;
  readonly escalationPromptHandler?: (prompt: EscalationPrompt) => Promise<EscalationResponse>;
  readonly interactiveAsk?: (questions: AskQuestion[]) => Promise<Record<string, string>>;
  /** Approval events, so a card can say it is waiting and how it was answered. */
  readonly emit: (event: QueryEvent) => void;
}

/** Tools a planning session may call: the ones that only look. */
const PLAN_MODE_TOOLS: Record<string, true> = {
  read: true, glob: true, grep: true, lsp: true, web_fetch: true, web_search: true, ask: true, todo: true,
};

/** Key the step runner uses to carry an argument parse failure into the call. */
export const PARSE_ERROR_KEY = "__parseError";

/** The registry's schemas in the shape a chat completion request takes. */
export function toolSchemas(tools: ReadonlyMap<string, ToolDefinition>): readonly ToolSchema[] {
  const result: ToolSchema[] = [];
  for (const tool of tools.values()) {
    result.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: (tool.argsSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
      },
    });
  }
  return result;
}

/** Wrap every registry tool so the kernel can execute it. */
export function adaptTools(
  tools: ReadonlyMap<string, ToolDefinition>,
  options: ToolGateOptions,
): readonly AgentTool[] {
  return [...tools.values()].map((tool) => ({
    name: tool.name,
    prepareArguments: (args) => prepareArguments(tool.name, args),
    execute: (toolCallId, args, signal, onUpdate) =>
      executeTool(tool, toolCallId, args, signal, options, onUpdate),
  }));
}

function prepareArguments(toolName: string, args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error(`Error: Malformed JSON arguments for tool '${toolName}': arguments must be a JSON object.`);
  }
  const record = args as Record<string, unknown>;
  const parseError = record[PARSE_ERROR_KEY];
  if (typeof parseError === "string") {
    throw new Error(`Error: Malformed JSON arguments for tool '${toolName}': ${parseError}`);
  }
  return record;
}

async function executeTool(
  tool: ToolDefinition,
  toolCallId: string,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  options: ToolGateOptions,
  onUpdate?: (partialResult: unknown) => void,
): Promise<AgentToolResult> {
  try {
    const result = await tool.execute(args, {
      workspaceRoot: options.workspaceRoot,
      taskId: toolCallId,
      abortSignal: signal,
      interactiveAsk: options.interactiveAsk,
      sessionId: options.sessionId,
      // A tool that reports progress passes it on; one that does not is
      // unaffected, since the callback only fires if the tool calls it.
      ...(onUpdate ? { onOutput: (chunk: string) => onUpdate(chunk) } : {}),
    });
    return { output: result.output || result.content || "Success", isError: !result.success };
  } catch (error) {
    return { output: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`, isError: true };
  }
}

/**
 * The gate in front of each call and the hook behind it.
 *
 * Before: plan mode, repeated identical calls, the permission scope with the
 * user's answer, then the pre-use hook. After: the post-use hook, whose
 * feedback (a compile error after an edit, say) is attached to the result so
 * the model reads it with the output it belongs to.
 */
export function createToolHooks(options: ToolGateOptions): ToolHooks {
  const doomLoop = new DoomLoopDetector(3);
  const approvals = new Map<string, { operation: string; decision: string }>();
  return {
    beforeToolCall: async ({ call, args }, signal) => {
      const planBlock = planModeBlock(options.agentMode, call.name, args);
      if (planBlock) return { block: true, reason: planBlock };
      const permission = await askPermission(call.id, call.name, args, options, signal);
      if (permission.blocked) return { block: true, reason: permission.blocked };
      if (permission.approved) approvals.set(call.id, permission.approved);
      const decision = await options.hooks.dispatch({
        eventName: "PreToolUse",
        sessionId: options.sessionId,
        workspaceRoot: options.workspaceRoot,
        timestamp: new Date().toISOString(),
        toolName: call.name,
        toolCallId: call.id,
        args,
      });
      if (decision.decision === "block") {
        approvals.delete(call.id);
        return { block: true, reason: `Blocked by Hook: ${decision.reason || "Action rejected by security/verification hook policy."}` };
      }
      const repeat = doomLoop.recordAndCheck(call.name, args);
      if (repeat.isDoomLoop) {
        approvals.delete(call.id);
        return {
          block: true,
          reason: `Warning: Doom Loop detected! Tool '${call.name}' has been repeatedly executed ${repeat.repeatCount} times with identical arguments without state progression. Please try a different approach, refine your parameters, or formulate a final response based on existing observations.`,
        };
      }
      return undefined;
    },
    afterToolCall: async ({ call, args, result, isError }) => {
      const approval = approvals.get(call.id);
      approvals.delete(call.id);
      let output = result.output;
      if (approval && !isError) {
        output = `[User approved ${approval.operation} operation (${approval.decision})]\n${output}`;
      }
      const decision = await options.hooks.dispatch({
        eventName: "PostToolUse",
        sessionId: options.sessionId,
        workspaceRoot: options.workspaceRoot,
        timestamp: new Date().toISOString(),
        toolName: call.name,
        toolCallId: call.id,
        args,
        output,
        success: !isError,
      });
      if (decision.feedback) output = `${output}\n\n[Verification feedback]\n${decision.feedback}`;
      return output === result.output ? undefined : { output };
    },
  };
}

function planModeBlock(agentMode: "plan" | "build" | undefined, toolName: string, args: Record<string, unknown>): string | undefined {
  if (agentMode !== "plan" || PLAN_MODE_TOOLS[toolName]) return undefined;
  if (toolName === "bash" && typeof args.command === "string" && isReadOnlyBashCommand(args.command)) return undefined;
  if (toolName === "browser" && typeof args.action === "string" && READ_ONLY_BROWSER_ACTIONS[args.action.toLowerCase().trim()]) return undefined;
  return `Blocked: Plan mode is active. Tool '${toolName}' ${toolName === "bash" ? "with non-read-only command " : ""}is not permitted in plan mode. Switch to build mode via /build to execute modifications or commands.`;
}

/**
 * Whether the user allows this call under the session's scope.
 *
 * A denial with a comment is the user's instruction for what to do instead, and
 * travels to the model verbatim; a bare denial only says no.
 */
async function askPermission(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  options: ToolGateOptions,
  signal: AbortSignal | undefined,
): Promise<{ readonly blocked?: string; readonly approved?: { operation: string; decision: string } }> {
  const evaluation = evaluateToolPermissionScope(toolName, args, options.permissionScope ?? "ask", options.workspaceRoot);
  if (!evaluation.requiresEscalation) return {};
  if (!options.escalationPromptHandler) {
    return { blocked: `Blocked: Tool '${toolName}' requires permission (${evaluation.reason}), but no interactive handler is available.` };
  }
  options.emit({ type: "approval.requested", toolName, taskId: toolCallId });
  await options.hooks.dispatch({
    eventName: "PermissionRequest",
    sessionId: options.sessionId,
    workspaceRoot: options.workspaceRoot,
    timestamp: new Date().toISOString(),
    toolName,
    toolCallId,
    args,
  });
  const response = await options.escalationPromptHandler(
    buildToolEscalationPrompt(toolName, evaluation.operation, evaluation.target, evaluation.reason),
  );
  if (signal?.aborted) return { blocked: "Operation aborted" };
  if (response.decision === "deny") {
    options.emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "denied" });
    const feedback =
      response.userComment && !response.userComment.startsWith("CLI explicit approval")
        ? response.userComment.replace(/^User denied with reason:\s*/i, "").trim()
        : "";
    await options.hooks.dispatch({
      eventName: "PermissionDenied",
      sessionId: options.sessionId,
      workspaceRoot: options.workspaceRoot,
      timestamp: new Date().toISOString(),
      toolName,
      toolCallId,
      args,
      reason: feedback || evaluation.reason,
    });
    return {
      blocked: feedback
        ? `[User Denied Permission]: The user explicitly rejected this tool call.\nUser feedback / instructions: "${feedback}"\nYou MUST follow the user's instructions above instead of repeating the rejected action.`
        : `Blocked: User denied permission for tool '${toolName}' (${evaluation.operation}) on '${evaluation.target}'.`,
    };
  }
  options.emit({ type: "approval.resolved", toolName, taskId: toolCallId, outcome: "approved" });
  return { approved: { operation: evaluation.operation, decision: response.decision } };
}
