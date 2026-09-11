import { parseJsonWithRepair } from "../../model-adapters/jsonRepair.js";
import { createComponentLogger } from "../../observability/structuredLogger.js";

const logger = createComponentLogger("AgentLoop");
import type { QueryEvent } from "./runtime/events.js";
import { recordSessionUsage } from "../../observability/usageTelemetry.js";
import { samplingTemperature } from "../commands/fastCommandRuntime.js";
import { getThinkingEffort } from "../commands/thinkingCommandRuntime.js";
import { DoomLoopDetector } from "./doomLoopDetector.js";
import { createCoreToolRegistry } from "../tools/registry.js";
import type { ToolDefinition } from "../../tools/types.js";
import { microcompactMessages } from "./microCompact.js";
import { requestCompactionSummary } from "./compaction/summarize.js";
import { HookDispatcher, defaultHookDispatcher } from "../hooks/hookDispatcher.js";
import { setupBuiltinVerificationHooks } from "../hooks/builtin/index.js";
import { getActiveSessionGoal } from "../commands/goalCommandRuntime.js";
import { isReadOnlyBashCommand } from "../shell/approval/evaluator.js";
import { isEventStream, readCompletionStream } from "./streamCompletion.js";
import type { PermissionScope } from "../../cli/approval/permissionScope.js";
import type { EscalationPrompt, EscalationResponse } from "../../sandbox/index.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import type { AskQuestion } from "../tools/ask.js";
import { evaluateToolPermissionScope, buildToolEscalationPrompt } from "./toolPolicy.js";
/** How much of a tool's output travels to its card in the transcript. */
const CARD_OUTPUT_LIMIT = 8_000;

export interface ReActAgentLoopOptions {
  readonly sessionId: string;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly agentMode?: "plan" | "build";
  readonly realProvider?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
    readonly model?: string;
  };
  readonly maxTurns?: number;
  readonly contextWindow?: number;
  readonly autoCompactPercent?: number;
  readonly reserveTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly hookDispatcher?: HookDispatcher;
  readonly abortSignal?: AbortSignal;
  readonly permissionScope?: PermissionScope;
  readonly escalationPromptHandler?: (
    prompt: EscalationPrompt,
  ) => Promise<EscalationResponse>;
  readonly interactiveAsk?: (
    questions: AskQuestion[],
  ) => Promise<Record<string, string>>;
  readonly historyMessages?: readonly SessionMessage[];
  readonly onTurnMessage?: (message: SessionMessage) => void;
}
interface OpenAIToolDefinition {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description?: string;
    readonly parameters: Record<string, unknown>;
  };
}

export function buildOpenAITools(
  tools: ReadonlyMap<string, ToolDefinition>,
): readonly OpenAIToolDefinition[] {
  const result: OpenAIToolDefinition[] = [];
  for (const tool of tools.values()) {
    result.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: (tool.argsSchema as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
      },
    });
  }
  return result;
}

export function convertSessionMessagesToChat(
  history: readonly SessionMessage[] = [],
): Array<{
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}> {
  const result: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }> = [];

  let pendingToolCalls: Array<{ id: string; name: string }> | undefined;

  for (const msg of history) {
    if (msg.role === "system") continue;

    // If previous assistant message had tool calls that were not fully answered
    // before a new non-tool message arrives, synthesize cancelled tool responses
    // so the OpenAI chat completion schema invariant is never violated.
    if (msg.role !== "tool" && pendingToolCalls && pendingToolCalls.length > 0) {
      for (const call of pendingToolCalls) {
        result.push({
          role: "tool",
          tool_call_id: call.id,
          content: "(Operation cancelled or interrupted)",
        });
      }
      pendingToolCalls = undefined;
    }

    if (msg.role === "user") {
      if (msg.content?.trim()) {
        result.push({ role: "user", content: msg.content.trim() });
      }
    } else if (msg.role === "assistant") {
      const calls =
        msg.tool_calls && msg.tool_calls.length > 0
          ? msg.tool_calls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.function.name, arguments: c.function.arguments },
            }))
          : undefined;
      const content = msg.content ?? (calls ? null : "");
      result.push({
        role: "assistant",
        content,
        ...(calls ? { tool_calls: calls } : {}),
      });
      if (calls && calls.length > 0) {
        pendingToolCalls = calls.map((c) => ({ id: c.id, name: c.function.name }));
      }
    } else if (msg.role === "tool") {
      if (msg.tool_call_id && pendingToolCalls) {
        const idx = pendingToolCalls.findIndex((c) => c.id === msg.tool_call_id);
        if (idx !== -1) {
          pendingToolCalls.splice(idx, 1);
          if (pendingToolCalls.length === 0) {
            pendingToolCalls = undefined;
          }
          result.push({
            role: "tool",
            tool_call_id: msg.tool_call_id,
            content: msg.content || "",
          });
        }
      }
    }
  }

  if (pendingToolCalls && pendingToolCalls.length > 0) {
    for (const call of pendingToolCalls) {
      result.push({
        role: "tool",
        tool_call_id: call.id,
        content: "(Operation cancelled or interrupted)",
      });
    }
  }

  return result;
}

export async function* runAutonomousReActLoop(
  options: ReActAgentLoopOptions,
): AsyncIterable<QueryEvent> {
  yield {
    type: "query.started",
    sessionId: options.sessionId,
    prompt: options.prompt,
  };

  const hookDispatcher = options.hookDispatcher ?? defaultHookDispatcher;
  setupBuiltinVerificationHooks(hookDispatcher);

  await hookDispatcher.dispatch({
    eventName: "UserPromptSubmit",
    sessionId: options.sessionId,
    workspaceRoot: options.workspaceRoot,
    timestamp: new Date().toISOString(),
    prompt: options.prompt,
  });

  const toolRegistry = createCoreToolRegistry();
  const openAiTools = buildOpenAITools(toolRegistry);
  const doomLoopDetector = new DoomLoopDetector(3);
  const messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }> = [
    // Layer 1: Static Core Identity & Execution Rules (100% stable prefix for Prompt Caching)
    {
      role: "system",
      content: [
        "You are an expert autonomous coding agent equipped with real tools (read, write, edit, glob, grep, lsp, bash, web_fetch, web_search, browser, ask, todo, task).",
        options.agentMode === "plan"
          ? "PLAN MODE ACTIVE: You have full access to inspect files, search symbols via LSP, run safe read-only commands (like git status, git diff) via bash, and explore websites via browser and web tools, but cannot modify files. Produce a structured execution plan based on real file contents."
          : "BUILD MODE ACTIVE: You have full access to inspect, search, execute, browse, and edit files to accomplish the user's task.",
        "CRITICAL EXECUTION & ANSWER RULES:",
        "1. When you run tools and gather facts, you MUST provide a final, comprehensive, structured markdown answer to the user.",
        "2. NEVER stop after running tools without giving your findings, explanation, and answer in text.",
        "3. For web searching: use `web_search` to retrieve online technical references.",
        "4. For workspace files: use `glob` (to find paths), `grep` (to search contents), `read` (to inspect files), `edit`/`write` (to update code), and `bash` (to run commands/tests/git).",
        "5. User Permission & Denial Feedback: When a tool execution is denied by the user, immediately respect the decision. If the user provided feedback or alternative instructions (e.g. changing filenames, using different arguments, or avoiding certain actions), you MUST strictly follow their feedback and not retry the rejected action.",
      ].join("\n"),
    },
    ...convertSessionMessagesToChat(options.historyMessages),
    // Layer 3 & 4: Invariant Environment Context + User Prompt
    {
      role: "user",
      content: [
        environmentLine(options.workspaceRoot, options.permissionScope),
        "",
        options.prompt,
      ].join("\n"),
    },
  ];
  const maxTurns = options.maxTurns ?? 15;
  const contextWindow =
    options.contextWindow ??
    (parseInt(process.env.AUTO_COMPACT_WINDOW || "", 10) || 64_000);
  const autoCompactPercent = options.autoCompactPercent ?? 80;
  const reserveTokens = options.reserveTokens ?? 8_000;
  const compactThresholdTokens = Math.floor(contextWindow * (autoCompactPercent / 100)) - reserveTokens;

  let turn = 0;
  const apiKey =
    options.realProvider?.apiKey ??
    process.env.SILICONFLOW_API_KEY ??
    process.env.OPENAI_API_KEY ??
    "";
  const baseUrl =
    options.realProvider?.baseUrl ?? "https://api.siliconflow.cn/v1";
  const modelName =
    options.realProvider?.model ?? "deepseek-ai/DeepSeek-V4-Flash";

  let lastAssistantText = "";
  /**
   * Cleared when a host rejects `reasoning_effort`.
   *
   * The field is a request, and a host that refuses it should cost one retry
   * rather than the turn. Once dropped it stays dropped for this run: asking again
   * would fail again.
   */
  let effortAccepted = true;
  // Kept so an empty answer can be explained rather than papered over.
  let lastFinishReason: string | undefined;
  let lastReasoningLength = 0;
  function estimateTokens(msgs: ReadonlyArray<{ readonly content?: string | null }>): number {
    let totalChars = 0;
    for (const m of msgs) {
      if (m.content) totalChars += m.content.length;
    }
    return Math.ceil(totalChars / 3.5);
  }

  async function executeFullCompaction(): Promise<boolean> {
    if (messages.length <= 3) return false;

    try {
      const checkpointMsg = await requestCompactionSummary({
        provider: { baseUrl, apiKey, model: modelName },
        messages,
        signal: options.abortSignal,
      });
      if (!checkpointMsg) return false;
      const systemMsg = messages[0];
      let lastUserIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserIndex = i;
          break;
        }
      }
      const preservedTail = lastUserIndex > 0 ? messages.slice(lastUserIndex) : [];
      messages.length = 0;
      messages.push(systemMsg);
      messages.push({
        role: "user",
        content: checkpointMsg,
      });
      for (const m of preservedTail) {
        messages.push(m);
      }
      return true;
    } catch {
      return false;
    }
  }

  while (turn < maxTurns) {
    turn++;
    logger.info(`Starting agent loop turn ${turn}/${maxTurns}`, {
      turn,
      maxTurns,
      sessionId: options.sessionId,
    });
    if (options.abortSignal?.aborted) {
      logger.warn(`Agent loop aborted on turn ${turn}`);
      break;
    }

    // Check Token-Aware Dynamic Budget Threshold before message prep
    const estimatedTokens = estimateTokens(messages);
    if (estimatedTokens >= compactThresholdTokens && messages.length > 4) {
      logger.info(`Compacting context: estimated tokens ${estimatedTokens} exceeds threshold ${compactThresholdTokens}`);
      await executeFullCompaction();
    }

    // Layer 1: Apply Microcompact (0ms in-memory pruning of older tool outputs)
    const { messages: preparedMessages } = microcompactMessages(messages, {
      keepRecentTurns: 3,
      maxOutputChars: 1000,
    });

    // On the final turn before maxTurns, set tool_choice to "none" while retaining tool definitions for schema validation
    const isLastTurn = turn === maxTurns;
    const activeTemperature = samplingTemperature(options.workspaceRoot, options.temperature ?? 0.7);
    const effort = effortAccepted ? getThinkingEffort(options.workspaceRoot) : undefined;
    const payload = {
      model: modelName,
      messages: preparedMessages,
      tools: openAiTools,
      tool_choice: isLastTurn ? "none" : "auto",
      // Streamed so the answer appears as it is written. Usage totals only come
      // back on a stream when they are asked for.
      stream: true,
      stream_options: { include_usage: true },
      temperature: activeTemperature,
      ...(effort ? { reasoning_effort: effort } : {}),
      ...(options.topP != null ? { top_p: options.topP } : {}),
      ...(options.maxOutputTokens != null ? { max_tokens: options.maxOutputTokens } : {}),
    };
    let responseJson: any;
    let isOverflowError = false;
    let retryWithoutEffort = false;
    // Text already delivered as deltas; it must not be delivered a second time.
    let streamedText: string | undefined;
    try {
      const res = await fetch(
        `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: options.abortSignal,
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        if (
          errorText.includes("context_length_exceeded") ||
          errorText.includes("context_overflow") ||
          errorText.includes("maximum context length") ||
          errorText.includes("prompt_too_long")
        ) {
          isOverflowError = true;
        } else if (effort && /reasoning_effort/i.test(errorText)) {
          // The host does not take the field. Drop it and run this turn again
          // rather than reporting a provider error the user cannot act on.
          effortAccepted = false;
          retryWithoutEffort = true;
        } else {
          yield {
            type: "query.failed",
            error: `Provider HTTP ${res.status}: ${errorText.slice(0, 200)}`,
          };
          return;
        }
      } else if (isEventStream(res)) {
        // Deltas are forwarded as they arrive, then reassembled into the same
        // shape a non-streaming response has, so nothing downstream changes.
        const stream = readCompletionStream(res.body!);
        streamedText = "";
        for (;;) {
          const step = await stream.next();
          if (step.done === true) {
            responseJson = {
              choices: [{ message: step.value.message, finish_reason: step.value.finishReason }],
              usage: step.value.usage,
              reasoning: step.value.reasoning,
            };
            break;
          }
          if (step.value.kind === "reasoning") {
            yield { type: "reasoning.delta", role: "coder", delta: step.value.text };
            continue;
          }
          streamedText += step.value.text;
          yield { type: "message.delta", role: "coder", delta: step.value.text };
        }
        const usage = responseJson.usage;
        if (usage) {
          recordSessionUsage(options.sessionId, {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            model: modelName,
          });
        }
      } else {
        // A provider that ignored `stream: true` answers with one JSON body; read
        // it rather than failing, and let the text arrive in a single delta.
        responseJson = await res.json();
        const usage = responseJson.usage;
        if (usage) {
          recordSessionUsage(options.sessionId, {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            model: modelName,
          });
        }
      }
    } catch (err) {
      // The user's own cancel aborts the request in flight. That is not a
      // network failure to report; the runtime records the interruption.
      if (options.abortSignal?.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      yield {
        type: "query.failed",
        error: `Network error: ${msg}`,
      };
      return;
    }

    if (retryWithoutEffort) {
      turn--;
      continue;
    }

    // Self-healing context overflow recovery
    if (isOverflowError) {
      const recovered = await executeFullCompaction();
      if (recovered) {
        // Retry current turn with fresh compacted context
        continue;
      } else {
        yield {
          type: "query.failed",
          error: "Context overflow error: could not compact context automatically.",
        };
        return;
      }
    }

    lastFinishReason = responseJson.choices?.[0]?.finish_reason ?? undefined;
    lastReasoningLength = typeof responseJson.reasoning === "string" ? responseJson.reasoning.length : 0;
    const choice = responseJson.choices?.[0];
    const assistantMessage = choice?.message;
    if (!assistantMessage) {
      yield {
        type: "query.failed",
        error: "Empty response from provider",
      };
      return;
    }

    let textContent = assistantMessage.content || "";
    const textToolCalls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }> = [];

    // Extract DSML tool calls with constrained inner tags to prevent cross-invocation hijacking
    if (textContent.includes("<｜DSML｜invoke")) {
      const dsmlMatches = textContent.matchAll(
        /<｜DSML｜invoke\s+name=["']([^"']+)["']>(?:(?!<\/｜DSML｜invoke>)[\s\S])*?<｜DSML｜parameter\s+name=["']arguments["'][^>]*>([\s\S]*?)<\/｜DSML｜parameter>(?:(?!<\/｜DSML｜invoke>)[\s\S])*?<\/｜DSML｜invoke>/gi,
      );
      for (const m of dsmlMatches) {
        textToolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          type: "function",
          function: {
            name: m[1],
            arguments: m[2].trim(),
          },
        });
      }
      textContent = textContent
        .replace(/<｜DSML｜tool_calls>[\s\S]*?<\/｜DSML｜tool_calls>/gi, "")
        .replace(/<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/gi, "")
        .trim();
    }

    // Combine standard OpenAI tool_calls and parsed DSML tool calls
    const rawToolCalls = assistantMessage.tool_calls || [];
    const toolCalls = [...rawToolCalls, ...textToolCalls];

    // Ensure assistantMessage.tool_calls in messages matches all executed toolCalls
    // to strictly preserve OpenAI chat protocol integrity
    const messageToPush =
      toolCalls.length > 0 && toolCalls.length !== rawToolCalls.length
        ? {
            ...assistantMessage,
            content: textContent,
            tool_calls: toolCalls,
          }
        : assistantMessage;
    messages.push(messageToPush);
    if (toolCalls.length > 0) {
      options.onTurnMessage?.({
        role: "assistant",
        content: textContent,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });
    }
    // If assistant returned clean text content, yield output. Streamed text has
    // already been delivered chunk by chunk; only a correction to it is re-sent,
    // which happens when DSML tool calls were stripped out of the prose.
    if (textContent) {
      lastAssistantText = textContent;
      if (streamedText === undefined) {
        yield { type: "message.delta", role: "coder", delta: textContent };
      } else if (textContent !== streamedText) {
        yield { type: "message.replace", role: "coder", text: textContent };
      }
    }

    if (toolCalls.length === 0) {
      // Model finished without tool calls
      break;
    }
    const isTruncated = choice?.finish_reason === "length";
    if (isTruncated) {
      logger.warn(`Turn ${turn} response was truncated by provider token limit (finish_reason=length).`);
    }

    const pendingFeedbacks: string[] = [];
    for (const toolCall of toolCalls) {
      if (!toolCall || !toolCall.function || !toolCall.function.name) {
        continue;
      }
      const funcName = toolCall.function.name;
      let funcArgs: Record<string, unknown> = {};
      let parseError: string | null = null;
      try {
        funcArgs = parseJsonWithRepair<Record<string, unknown>>(toolCall.function.arguments || "{}");
      } catch (err) {
        parseError = `Invalid JSON arguments: ${err instanceof Error ? err.message : String(err)}`;
      }
      // Check Doom Loop (Repeated identical tool calls with same arguments)
      const doomCheck = doomLoopDetector.recordAndCheck(funcName, funcArgs);
      if (doomCheck.isDoomLoop) {
        logger.warn(`Doom loop detected: ${funcName} invoked ${doomCheck.repeatCount} times with identical arguments`, {
          toolName: funcName,
          repeatCount: doomCheck.repeatCount,
        });
      }

      yield {
        type: "tool.started",
        toolName: funcName,
        taskId: toolCall.id,
        ...(parseError ? {} : { args: funcArgs }),
      };

      const tool = toolRegistry.get(funcName);
      let outputContent = "";
      let isSuccess = false;
      if (isTruncated) {
        outputContent = `Error: Tool invocation aborted because model response was cut off by token limit (finish_reason=length).`;
        isSuccess = false;
      } else if (parseError) {
        outputContent = `Error: Malformed JSON arguments for tool '${funcName}': ${parseError}. Raw: ${toolCall.function.arguments}`;
        isSuccess = false;
      } else if (doomCheck.isDoomLoop) {
        outputContent = `Warning: Doom Loop detected! Tool '${funcName}' has been repeatedly executed ${doomCheck.repeatCount} times with identical arguments without state progression. Please try a different approach, refine your parameters, or formulate a final response based on existing observations.`;
        isSuccess = false;
      } else if (!tool) {
        outputContent = `Error: Tool '${funcName}' is not registered.`;
        isSuccess = false;
      } else if (
        options.agentMode === "plan" &&
        funcName !== "read" &&
        funcName !== "glob" &&
        funcName !== "grep" &&
        funcName !== "lsp" &&
        funcName !== "browser" &&
        funcName !== "web_fetch" &&
        funcName !== "web_search" &&
        funcName !== "ask" &&
        funcName !== "todo" &&
        funcName !== "task" &&
        !(funcName === "bash" && typeof funcArgs?.command === "string" && isReadOnlyBashCommand(funcArgs.command))
      ) {
        outputContent = `Blocked: Plan mode is active. Tool '${funcName}' ${funcName === "bash" ? "with non-read-only command " : ""}is not permitted in plan mode. Switch to build mode via /build to execute modifications or commands.`;
        isSuccess = false;
      } else {
        const permissionEval = evaluateToolPermissionScope(
          funcName,
          funcArgs,
          options.permissionScope ?? "ask",
          options.workspaceRoot,
        );
        let permissionDenied = false;
        let escalationApproved = false;
        let escalationDecision: string | undefined;

        if (permissionEval.requiresEscalation) {
          if (options.escalationPromptHandler) {
            const prompt = buildToolEscalationPrompt(
              funcName,
              permissionEval.operation,
              permissionEval.target,
              permissionEval.reason,
            );
            const response = await options.escalationPromptHandler(prompt);
            if (response.decision === "deny") {
              const rawFeedback = response.userComment && !response.userComment.startsWith("CLI explicit approval")
                ? response.userComment.replace(/^User denied with reason:\s*/i, "").trim()
                : "";
              if (rawFeedback) {
                outputContent = `[User Denied Permission]: The user explicitly rejected this tool call.\nUser feedback / instructions: "${rawFeedback}"\nYou MUST follow the user's instructions above instead of repeating the rejected action.`;
              } else {
                outputContent = `Blocked: User denied permission for tool '${funcName}' (${permissionEval.operation}) on '${permissionEval.target}'.`;
              }
              isSuccess = false;
              permissionDenied = true;
            } else {
              escalationApproved = true;
              escalationDecision = response.decision;
            }
          } else {
            outputContent = `Blocked: Tool '${funcName}' requires permission (${permissionEval.reason}), but no interactive handler is available.`;
            isSuccess = false;
            permissionDenied = true;
          }
        }

        if (!permissionDenied) {
          const preDecision = await hookDispatcher.dispatch({
            eventName: "PreToolUse",
            sessionId: options.sessionId,
            workspaceRoot: options.workspaceRoot,
            timestamp: new Date().toISOString(),
            toolName: funcName,
            toolCallId: toolCall.id,
            args: funcArgs,
          });

          if (preDecision && preDecision.decision === "block") {
            outputContent = `Blocked by Hook: ${preDecision.reason || "Action rejected by security/verification hook policy."}`;
            isSuccess = false;
          } else {
            try {
              const execResult = await tool.execute(funcArgs, {
                workspaceRoot: options.workspaceRoot,
                taskId: toolCall.id,
                abortSignal: options.abortSignal,
                interactiveAsk: options.interactiveAsk,
              });
              outputContent =
                execResult.output || execResult.content || "Success";
              isSuccess = Boolean(execResult.success);
              if (escalationApproved && isSuccess) {
                outputContent = `[User approved ${permissionEval.operation} operation (${escalationDecision})]\n${outputContent}`;
              }
            } catch (execErr) {
              const errStr =
                execErr instanceof Error ? execErr.message : String(execErr);
              outputContent = `Tool execution error: ${errStr}`;
              isSuccess = false;
            }
          }
        }
      }

      // PostToolUse Hook Dispatcher
      const postDecision = await hookDispatcher.dispatch({
        eventName: "PostToolUse",
        sessionId: options.sessionId,
        workspaceRoot: options.workspaceRoot,
        timestamp: new Date().toISOString(),
        toolName: funcName,
        toolCallId: toolCall.id,
        args: funcArgs,
        output: outputContent,
        success: isSuccess,
      });

      // Push tool message immediately to satisfy OpenAI protocol (tool message must follow assistant tool_call)
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: outputContent.slice(0, 10000), // Protect token budget
      });
      options.onTurnMessage?.({
        role: "tool",
        tool_call_id: toolCall.id,
        content: outputContent.slice(0, 10000),
      });

      // Collect verification feedback without breaking tool message sequence
      if (postDecision && postDecision.feedback) {
        pendingFeedbacks.push(postDecision.feedback);
      }

      yield {
        type: "tool.result",
        toolName: funcName,
        taskId: toolCall.id,
        success: isSuccess,
        failureReason: isSuccess ? undefined : outputContent.slice(0, 120),
        // The whole output, bounded: a card the user can open is only worth
        // opening if what the tool actually printed is behind it.
        output: outputContent.slice(0, CARD_OUTPUT_LIMIT),
      };
    }

    // Append collected post-tool verification feedbacks as user message after all tool calls resolved
    if (pendingFeedbacks.length > 0) {
      messages.push({
        role: "user",
        content: pendingFeedbacks.join("\n\n"),
      });
    }
  }
  // An interrupted turn did not finish; nothing below may pretend it did.
  if (options.abortSignal?.aborted) return;
  // The model finished without saying anything. Report why, rather than inventing a
  // summary: "Completed execution across 1 turns" told the user nothing, and told
  // them it in a vocabulary that only makes sense inside this loop.
  if (!lastAssistantText && messages.length > 2) {
    const lastToolOutput = messages.filter((m) => m.role === "tool").slice(-1)[0]?.content;
    const summaryText = lastToolOutput
      ? `The tools ran but no answer followed. What the last one returned:\n\n${lastToolOutput.slice(0, 1000)}`
      : emptyAnswerExplanation(lastFinishReason, lastReasoningLength);
    yield { type: "message.delta", role: "coder", delta: summaryText };
    lastAssistantText = summaryText;
  }

  await hookDispatcher.dispatch({
    eventName: "Stop",
    sessionId: options.sessionId,
    workspaceRoot: options.workspaceRoot,
    timestamp: new Date().toISOString(),
    turnsExecuted: turn,
    finalOutput: lastAssistantText,
  });
  yield {
    type: "query.completed",
    result: {
      status: "completed",
      terminalClassification: "success",
      terminalReason: "completed",
      transcript: [],
      sharedContext: {
        sessionId: options.sessionId,
        initialPrompt: options.prompt,
        notes: [`turns: ${turn}`],
        handoffs: [],
      },
      finalOutput: lastAssistantText,
    },
  };
}

/**
 * The line that tells the model where it is and what it is working towards.
 *
 * The objective is only carried while it is active: a paused one is deliberately
 * out of the way, and repeating a completed one would keep steering towards work
 * that is already done.
 */
function environmentLine(workspaceRoot: string, permissionScope?: PermissionScope): string {
  const goal = getActiveSessionGoal(workspaceRoot);
  const objective = goal?.phase === "active" ? ` | active_goal=${goal.objective}` : "";
  const perm = permissionScope ? ` | permission_scope=${permissionScope}` : "";
  return `[Environment Context: cwd=${workspaceRoot}${perm}${objective}]`;
}
/**
 * Why a turn produced no answer, in terms the user can act on.
 *
 * Each case has a different remedy, so each is named: a truncated response needs a
 * shorter context, a refusal needs a different request, and a model that spent the
 * whole turn reasoning without concluding needs to be asked again.
 */
function emptyAnswerExplanation(finishReason: string | undefined, reasoningLength: number): string {
  if (finishReason === "length") {
    return "The reply was cut off before any of it arrived — the context is probably full. Run `/compact` and ask again.";
  }
  if (finishReason === "content_filter") {
    return "The provider withheld the reply. Rephrasing the request usually gets past it.";
  }
  if (reasoningLength > 0) {
    return `The model spent the whole turn working and never wrote an answer (${reasoningLength} characters of reasoning, shown above). Asking again usually resolves it.`;
  }
  return `The model returned nothing at all${finishReason ? ` (${finishReason})` : ""}. Ask again, or check the provider with \`/connect\`.`;
}
