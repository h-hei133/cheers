import type { PermissionScope } from "../cli/approval/permissionScope.js";
import { getActiveSessionGoal } from "../core/commands/goalCommandRuntime.js";
import type { SessionMessage } from "../session/schema/sessionMessage.js";

/**
 * What the model is told before the conversation, and how the stored
 * conversation is shaped into a request.
 *
 * The system prompt is a stable prefix so a host that caches prompts can reuse
 * it; everything that changes per turn travels in the user message instead.
 */

export interface ChatToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: { readonly name: string; readonly arguments: string };
}

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content?: string | null;
  readonly tool_calls?: readonly ChatToolCall[];
  readonly tool_call_id?: string;
}

export interface SystemPromptContext {
  /**
   * Project instruction files, already rendered and wrapped.
   *
   * Passed in rather than read here because reading is a filesystem concern and
   * this function is pure: it takes what applies and assembles it.
   */
  readonly instructions?: string
  /**
   * The skill list the model reads, already rendered.
   *
   * Only skills the model may see are included; hiding one is a discovery-time
   * decision, not something this assembler re-decides.
   */
  readonly skills?: string
  /**
   * Standing instructions the project asked to have appended, already rendered.
   *
   * Separate from `instructions` because they are a different kind of statement:
   * the rule files say how this repository works, and these say what the harness
   * should also do. Kept as their own section so a reader can tell which is which.
   */
  readonly appendedInstructions?: string
  /**
   * The tools this run actually offers, in the order they should be named.
   *
   * Passed in rather than listed here because a hand-written list drifts: it
   * named thirteen tools while the registry offered fourteen, so the model was
   * told about a tool set it did not have. The registry is the only place that
   * knows, and `restrictToolPool` may have narrowed it further for this run.
   */
  readonly toolNames?: readonly string[]
}

export function buildSystemPrompt(
  agentMode: "plan" | "build" | undefined,
  context?: SystemPromptContext,
): string {
  const sections = [
    `You are an expert autonomous coding agent equipped with real tools (${context?.toolNames?.join(", ") ?? "none available"}).`,
    agentMode === "plan"
      ? "PLAN MODE ACTIVE: You have full access to inspect files, search symbols via LSP, run safe read-only commands (like git status, git diff) via bash, and explore websites via browser and web tools, but cannot modify files. Produce a structured execution plan based on real file contents."
      : "BUILD MODE ACTIVE: You have full access to inspect, search, execute, browse, and edit files to accomplish the user's task.",
    "CRITICAL EXECUTION & ANSWER RULES:",
    "1. When you run tools and gather facts, you MUST provide a final, comprehensive, structured markdown answer to the user.",
    "2. NEVER stop after running tools without giving your findings, explanation, and answer in text.",
    "3. For web searching: use `web_search` to retrieve online technical references.",
    "4. For workspace files: use `glob` (to find paths), `grep` (to search contents), `read` (to inspect files), `edit`/`write` (to update code), and `bash` (to run commands/tests/git).",
    "5. User Permission & Denial Feedback: When a tool execution is denied by the user, immediately respect the decision. If the user provided feedback or alternative instructions (e.g. changing filenames, using different arguments, or avoiding certain actions), you MUST strictly follow their feedback and not retry the rejected action.",
  ]

  // Instructions come after the rules that describe how to work and before the
  // skill list, so a project's own conventions read as the most specific thing
  // said about this repository.
  if (context?.instructions) sections.push(context.instructions)
  if (context?.appendedInstructions) sections.push(context.appendedInstructions)
  if (context?.skills) sections.push(context.skills)

  return sections.join("\n")
}

/**
 * The line that tells the model where it is and what it is working towards.
 *
 * The objective is only carried while it is active: a paused one is deliberately
 * out of the way, and repeating a completed one would keep steering towards work
 * that is already done.
 */
export function environmentLine(workspaceRoot: string, permissionScope?: PermissionScope): string {
  const goal = getActiveSessionGoal(workspaceRoot);
  const objective = goal?.phase === "active" ? ` | active_goal=${goal.objective}` : "";
  const perm = permissionScope ? ` | permission_scope=${permissionScope}` : "";
  return `[Environment Context: cwd=${workspaceRoot}${perm}${objective}]`;
}

/**
 * The stored conversation in the shape a chat completion takes.
 *
 * A provider rejects a request whose assistant tool calls have no results, so a
 * call left open by an interruption gets a synthesized cancellation, and a tool
 * result that answers no call is dropped. System messages never travel: the
 * request carries its own.
 */
export function toChatMessages(history: readonly SessionMessage[] = []): ChatMessage[] {
  const result: ChatMessage[] = [];
  let pendingCalls: Array<{ id: string; name: string }> | undefined;

  const closePending = (): void => {
    for (const call of pendingCalls ?? []) {
      result.push({ role: "tool", tool_call_id: call.id, content: "(Operation cancelled or interrupted)" });
    }
    pendingCalls = undefined;
  };

  for (const message of history) {
    if (message.role === "system") continue;
    if (message.role !== "tool" && pendingCalls && pendingCalls.length > 0) closePending();

    if (message.role === "user") {
      if (message.content?.trim()) result.push({ role: "user", content: message.content.trim() });
    } else if (message.role === "assistant") {
      const calls =
        message.tool_calls && message.tool_calls.length > 0
          ? message.tool_calls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: { name: call.function.name, arguments: call.function.arguments },
            }))
          : undefined;
      result.push({
        role: "assistant",
        content: message.content ?? (calls ? null : ""),
        ...(calls ? { tool_calls: calls } : {}),
      });
      if (calls && calls.length > 0) pendingCalls = calls.map((call) => ({ id: call.id, name: call.function.name }));
    } else if (message.role === "tool" && message.tool_call_id && pendingCalls) {
      const index = pendingCalls.findIndex((call) => call.id === message.tool_call_id);
      if (index === -1) continue;
      pendingCalls.splice(index, 1);
      if (pendingCalls.length === 0) pendingCalls = undefined;
      result.push({ role: "tool", tool_call_id: message.tool_call_id, content: message.content || "" });
    }
  }
  if (pendingCalls && pendingCalls.length > 0) closePending();
  return result;
}
