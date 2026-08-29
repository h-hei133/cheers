import type { QueryEvent } from "./runtime/events.js";
import { createCoreToolRegistry } from "../tools/registry.js";
import type { ToolDefinition } from "../../tools/types.js";

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
        "You are an expert autonomous coding agent equipped with real tools (read, write, edit, glob, grep, bash, git-status, git-diff).",
        `Current working directory: ${options.workspaceRoot}`,
        options.agentMode === "plan"
          ? "PLAN MODE ACTIVE: You have full access to inspect files using read, glob, grep, and git inspection tools, but cannot modify files. Produce a structured execution plan based on real file contents."
          : "BUILD MODE ACTIVE: You have full access to inspect, execute, and edit files to accomplish the user's task.",
        "CRITICAL: When asked to inspect, analyze, check architecture, find files, or modify code, YOU MUST ACTIVELY CALL YOUR TOOLS (e.g. call glob to list directories/files, or read to read package.json/configs) instead of asking the user to paste code or claiming you cannot access files. You have full access through your tool calls.",
      ].join("\n"),
    },
    {
      role: "user",
      content: options.prompt,
    },
  ];

  const maxTurns = options.maxTurns ?? 15;
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

  while (turn < maxTurns) {
    turn++;
    if (options.abortSignal?.aborted) {
      break;
    }

    // On the final turn before maxTurns, set tool_choice to "none" while retaining tool definitions for schema validation
    const isLastTurn = turn === maxTurns;
    const payload = {
      model: modelName,
      messages,
      tools: openAiTools,
      tool_choice: isLastTurn ? "none" : "auto",
    };
    let responseJson: any;
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
        yield {
          type: "query.failed",
          error: `Provider HTTP ${res.status}: ${errorText.slice(0, 200)}`,
        };
        return;
      }

      responseJson = await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield {
        type: "query.failed",
        error: `Network error: ${msg}`,
      };
      return;
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

    // If assistant returned text content, yield output
    if (assistantMessage.content) {
      lastAssistantText = assistantMessage.content;
      yield {
        type: "message.delta",
        role: "coder",
        delta: assistantMessage.content,
      };
    }

    // Check for tool calls
    const toolCalls = assistantMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
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
        funcName !== "git-status" &&
        funcName !== "git-diff"
      ) {
        outputContent = `Blocked: Plan mode is active. Tool '${funcName}' is not a read-only inspection tool. Only read-only tools (read, glob, grep, git-status, git-diff) are permitted in plan mode. Switch to build mode via /build to execute modifications or commands.`;
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

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: outputContent.slice(0, 10000), // Protect token budget
      });

      yield {
        type: "tool.result",
        toolName: funcName,
        taskId: toolCall.id,
        success: isSuccess,
        failureReason: isSuccess ? undefined : outputContent.slice(0, 120),
      };
    }
  }

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
