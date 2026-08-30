import type { QueryEvent } from "./runtime/events.js";
import { createCoreToolRegistry } from "../tools/registry.js";
import type { ToolDefinition } from "../../tools/types.js";
import { microcompactMessages } from "./microCompact.js";
import {
  EIGHT_SECTION_COMPACTION_PROMPT,
  formatCheckpointMessage,
  parseCompactedSummary,
} from "./compaction/summarizer.js";
import { HookDispatcher, defaultHookDispatcher } from "../hooks/hookDispatcher.js";
import { setupBuiltinVerificationHooks } from "../hooks/builtin/index.js";
import { getActiveSessionGoal } from "../commands/goalCommandRuntime.js";

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
  readonly hookDispatcher?: HookDispatcher;
  readonly abortSignal?: AbortSignal;
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
    {
      role: "system",
      content: [
        "You are an expert autonomous coding agent equipped with real tools (read, write, edit, glob, grep, lsp, bash, git-status, git-diff, web_fetch, web_search, browser, ask, todo, task).",
        `Current working directory: ${options.workspaceRoot}`,
        ...(getActiveSessionGoal()?.phase === "active"
          ? [`CRITICAL ACTIVE GOAL (PINNED): ${getActiveSessionGoal()!.objective}`]
          : []),
        options.agentMode === "plan"
          ? "PLAN MODE ACTIVE: You have full access to inspect files, search symbols via LSP, and explore websites via browser and web tools using read, glob, grep, lsp, browser, web_fetch, web_search, ask, todo, task, and git inspection tools, but cannot modify files. Produce a structured execution plan based on real file contents."
          : "BUILD MODE ACTIVE: You have full access to inspect, search, execute, browse, and edit files to accomplish the user's task.",
        "- For web searching: use `web_search` to retrieve online technical references.",
        "- For workspace files: use `glob` (to find paths), `grep` (to search contents), `read` (to inspect files), `edit`/`write` (to update code), and `bash` (to run commands/tests).",
        "- Directly fulfill the user's immediate question without unnecessary side explorations.",
      ].join("\n"),
    },
    {
      role: "user",
      content: options.prompt,
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
      const summarizerPayload = {
        model: modelName,
        messages: [
          ...messages,
          {
            role: "user" as const,
            content: EIGHT_SECTION_COMPACTION_PROMPT,
          },
        ],
      };

      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(summarizerPayload),
        signal: options.abortSignal,
      });

      if (!res.ok) return false;
      const data = await res.json() as any;
      const summaryContent = data.choices?.[0]?.message?.content;
      if (!summaryContent) return false;

      const { rawSummary } = parseCompactedSummary(summaryContent);
      const checkpointMsg = formatCheckpointMessage(rawSummary);
      // Find last user message boundary to preserve conversational integrity without orphaned tools
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
    if (options.abortSignal?.aborted) {
      break;
    }
    // Check Token-Aware Dynamic Budget Threshold before message prep
    const estimatedTokens = estimateTokens(messages);
    if (estimatedTokens >= compactThresholdTokens && messages.length > 4) {
      await executeFullCompaction();
    }

    // Layer 1: Apply Microcompact (0ms in-memory pruning of older tool outputs)
    const { messages: preparedMessages } = microcompactMessages(messages, {
      keepRecentTurns: 3,
      maxOutputChars: 1000,
    });

    // On the final turn before maxTurns, set tool_choice to "none" while retaining tool definitions for schema validation
    const isLastTurn = turn === maxTurns;
    const payload = {
      model: modelName,
      messages: preparedMessages,
      tools: openAiTools,
      tool_choice: isLastTurn ? "none" : "auto",
    };
    let responseJson: any;
    let isOverflowError = false;
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
        } else {
          yield {
            type: "query.failed",
            error: `Provider HTTP ${res.status}: ${errorText.slice(0, 200)}`,
          };
          return;
        }
      } else {
        responseJson = await res.json();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield {
        type: "query.failed",
        error: `Network error: ${msg}`,
      };
      return;
    }

    // Self-Healing Context Overflow Recovery (learning from Pi Agent)
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

    const choice = responseJson.choices?.[0];
    const assistantMessage = choice?.message;
    if (!assistantMessage) {
      yield {
        type: "query.failed",
        error: "Empty response from provider",
      };
      return;
    }

    messages.push(assistantMessage);

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

    // If assistant returned clean text content, yield output
    if (textContent) {
      lastAssistantText = textContent;
      yield {
        type: "message.delta",
        role: "coder",
        delta: textContent,
      };
    }

    // Check for tool calls (OpenAI tool_calls + parsed DSML tool calls)
    const rawToolCalls = assistantMessage.tool_calls || [];
    const toolCalls = [...rawToolCalls, ...textToolCalls];
    if (toolCalls.length === 0) {
      // Model finished without tool calls
      break;
    }
    // Execute each tool call
    for (const toolCall of toolCalls) {
      if (!toolCall || !toolCall.function || !toolCall.function.name) {
        continue;
      }
      const funcName = toolCall.function.name;
      let funcArgs: Record<string, unknown> = {};
      let parseError: string | null = null;
      try {
        funcArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }

      yield {
        type: "tool.started",
        toolName: funcName,
        taskId: toolCall.id,
      };

      const tool = toolRegistry.get(funcName);
      let outputContent = "";
      let isSuccess = false;
      if (parseError) {
        outputContent = `Error: Malformed JSON arguments for tool '${funcName}': ${parseError}. Raw: ${toolCall.function.arguments}`;
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
        funcName !== "git-status" &&
        funcName !== "git-diff" &&
        funcName !== "browser" &&
        funcName !== "web_fetch" &&
        funcName !== "web_search" &&
        funcName !== "ask" &&
        funcName !== "todo" &&
        funcName !== "task"
      ) {
        outputContent = `Blocked: Plan mode is active. Tool '${funcName}' is not a read-only inspection tool. Only read-only tools (read, glob, grep, lsp, git-status, git-diff, browser, web_fetch, web_search, ask, todo, task) are permitted in plan mode. Switch to build mode via /build to execute modifications or commands.`;
        isSuccess = false;
      } else {
        // PreToolUse Hook interceptor
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
            });
            outputContent =
              execResult.output || execResult.content || "Success";
            isSuccess = Boolean(execResult.success);
          } catch (execErr) {
            const errStr =
              execErr instanceof Error ? execErr.message : String(execErr);
            outputContent = `Tool execution error: ${errStr}`;
            isSuccess = false;
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

      // If a verification hook (such as compiler guard) returned feedback/retry, attach user message after tool result
      if (postDecision && postDecision.feedback) {
        messages.push({
          role: "user",
          content: postDecision.feedback,
        });
      }
      yield {
        type: "tool.result",
        toolName: funcName,
        taskId: toolCall.id,
        success: isSuccess,
        failureReason: isSuccess ? undefined : outputContent.slice(0, 120),
      };
    }
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
