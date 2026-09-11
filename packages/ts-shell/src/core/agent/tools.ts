import type { AgentEventSink } from "./events.js";
import type { AgentMessage } from "./state.js";

export interface AgentToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: unknown;
}

export interface AgentToolResult {
  readonly output: string;
  readonly isError: boolean;
  readonly terminate?: boolean;
}

export type AgentToolExecutionMode = "sequential" | "parallel";

export interface AgentTool {
  readonly name: string;
  readonly executionMode?: AgentToolExecutionMode;
  readonly prepareArguments?: (args: unknown) => Record<string, unknown>;
  execute(
    toolCallId: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: (partialResult: unknown) => void,
  ): Promise<AgentToolResult>;
}

export interface BeforeToolCallContext {
  readonly assistantMessage: AgentMessage;
  readonly call: AgentToolCall;
  readonly args: Record<string, unknown>;
}

export interface BeforeToolCallDecision {
  readonly block: boolean;
  readonly reason?: string;
  readonly terminate?: boolean;
}

export interface AfterToolCallContext {
  readonly assistantMessage: AgentMessage;
  readonly call: AgentToolCall;
  readonly args: Record<string, unknown>;
  readonly result: AgentToolResult;
  readonly isError: boolean;
}

export interface AfterToolCallUpdate {
  readonly output?: string;
  readonly isError?: boolean;
  readonly terminate?: boolean;
}

export interface ToolHooks {
  readonly beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallDecision | undefined>;
  readonly afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallUpdate | undefined>;
}

export type PreparedToolCall =
  | { readonly kind: "prepared"; readonly call: AgentToolCall; readonly tool: AgentTool; readonly args: Record<string, unknown> }
  | { readonly kind: "immediate"; readonly result: AgentToolResult };

export interface ExecutedToolBatch {
  readonly messages: AgentMessage[];
  readonly terminate: boolean;
}

export const TOOL_OUTPUT_LIMIT = 10_000;

export function parseToolArgs(
  raw: string,
): { readonly args: Record<string, unknown> } | { readonly parseError: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { args: parsed as Record<string, unknown> };
    }
    return { parseError: "tool arguments must be a JSON object" };
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : String(error) };
  }
}

export function boundText(text: string, limit: number = TOOL_OUTPUT_LIMIT): string {
  return text.length > limit ? text.slice(0, limit) : text;
}

export function createToolResultMessage(toolCallId: string, output: string): AgentMessage {
  return { role: "tool", tool_call_id: toolCallId, content: output };
}

function abortedResult(): AgentToolResult {
  return { output: "Operation aborted", isError: true };
}

function emitExecutionEnd(
  emit: AgentEventSink,
  call: AgentToolCall,
  isError: boolean,
): Promise<void> | void {
  return emit({
    type: "tool_execution_end",
    toolCallId: call.id,
    toolName: call.name,
    isError,
  });
}

export async function failTruncatedCalls(
  calls: readonly AgentToolCall[],
  emit: AgentEventSink,
): Promise<AgentMessage[]> {
  const messages: AgentMessage[] = [];
  for (const call of calls) {
    await emit({ type: "tool_execution_start", toolCallId: call.id, toolName: call.name, args: call.args });
    const result: AgentToolResult = {
      output: `Tool call "${call.name}" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.`,
      isError: true,
    };
    await emitExecutionEnd(emit, call, true);
    messages.push(createToolResultMessage(call.id, result.output));
  }
  return messages;
}

export async function prepareToolCall(
  tools: readonly AgentTool[],
  assistantMessage: AgentMessage,
  call: AgentToolCall,
  hooks: ToolHooks | undefined,
  signal: AbortSignal | undefined,
): Promise<PreparedToolCall> {
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (!tool) {
    return { kind: "immediate", result: { output: `Tool ${call.name} not found`, isError: true } };
  }
  try {
    const args = tool.prepareArguments ? tool.prepareArguments(call.args) : toArgsRecord(call.args);
    if (hooks?.beforeToolCall) {
      const decision = await hooks.beforeToolCall({ assistantMessage, call, args }, signal);
      if (signal?.aborted) {
        return { kind: "immediate", result: abortedResult() };
      }
      if (decision?.block) {
        return {
          kind: "immediate",
          result: {
            output: decision.reason || "Tool execution was blocked",
            isError: true,
            ...(decision.terminate === true ? { terminate: true } : {}),
          },
        };
      }
    }
    if (signal?.aborted) {
      return { kind: "immediate", result: abortedResult() };
    }
    return { kind: "prepared", call, tool, args };
  } catch (error) {
    return {
      kind: "immediate",
      result: { output: error instanceof Error ? error.message : String(error), isError: true },
    };
  }
}

export async function executeToolBatch(
  tools: readonly AgentTool[],
  assistantMessage: AgentMessage,
  calls: readonly AgentToolCall[],
  hooks: ToolHooks | undefined,
  mode: AgentToolExecutionMode | undefined,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ExecutedToolBatch> {
  const requested = mode ?? "parallel";
  const forcedSequential = calls.some((call) =>
    tools.find((tool) => tool.name === call.name)?.executionMode === "sequential",
  );
  const batch =
    requested === "sequential" || forcedSequential
      ? await runSequential(tools, assistantMessage, calls, hooks, signal, emit)
      : await runParallel(tools, assistantMessage, calls, hooks, signal, emit);
  const bounded = batch.messages.map((message) => ({
    ...message,
    content: boundText(message.content),
  }));
  if (!signal?.aborted) {
    return { messages: bounded, terminate: batch.terminate };
  }
  const pairedIds = bounded.map((message) => message.tool_call_id);
  const messages = [...bounded];
  for (const call of calls) {
    if (pairedIds.includes(call.id)) {
      continue;
    }
    await emit({ type: "tool_execution_start", toolCallId: call.id, toolName: call.name, args: call.args });
    await emitExecutionEnd(emit, call, true);
    messages.push(createToolResultMessage(call.id, abortedResult().output));
  }
  return { messages, terminate: batch.terminate };
}

export function shouldTerminateBatch(results: readonly AgentToolResult[]): boolean {
  return results.length > 0 && results.every((result) => result.terminate === true);
}

function toArgsRecord(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  throw new Error("tool arguments must be an object");
}

async function executePreparedCall(
  tool: AgentTool,
  call: AgentToolCall,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<AgentToolResult> {
  try {
    return await tool.execute(call.id, args, signal, (partialResult) => {
      void emit({
        type: "tool_execution_update",
        toolCallId: call.id,
        toolName: call.name,
        args: call.args,
        partialResult,
      });
    });
  } catch (error) {
    return {
      output: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

async function finalizeExecutedCall(
  assistantMessage: AgentMessage,
  call: AgentToolCall,
  args: Record<string, unknown>,
  executed: AgentToolResult,
  hooks: ToolHooks | undefined,
  signal: AbortSignal | undefined,
): Promise<AgentToolResult> {
  if (!hooks?.afterToolCall) {
    return executed;
  }
  try {
    const update = await hooks.afterToolCall(
      { assistantMessage, call, args, result: executed, isError: executed.isError },
      signal,
    );
    if (!update) {
      return executed;
    }
    return {
      output: update.output ?? executed.output,
      isError: update.isError ?? executed.isError,
      terminate: update.terminate ?? executed.terminate,
    };
  } catch {
    return executed;
  }
}

async function runSequential(
  tools: readonly AgentTool[],
  assistantMessage: AgentMessage,
  calls: readonly AgentToolCall[],
  hooks: ToolHooks | undefined,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ExecutedToolBatch> {
  const messages: AgentMessage[] = [];
  const results: AgentToolResult[] = [];
  for (const call of calls) {
    await emit({ type: "tool_execution_start", toolCallId: call.id, toolName: call.name, args: call.args });
    const prepared = await prepareToolCall(tools, assistantMessage, call, hooks, signal);
    let result: AgentToolResult;
    if (prepared.kind === "immediate") {
      result = prepared.result;
    } else {
      const executed = await executePreparedCall(prepared.tool, call, prepared.args, signal, emit);
      result = await finalizeExecutedCall(assistantMessage, call, prepared.args, executed, hooks, signal);
    }
    await emitExecutionEnd(emit, call, result.isError);
    results.push(result);
    messages.push(createToolResultMessage(call.id, result.output));
    if (signal?.aborted) {
      break;
    }
  }
  return { messages, terminate: shouldTerminateBatch(results) };
}

async function runParallel(
  tools: readonly AgentTool[],
  assistantMessage: AgentMessage,
  calls: readonly AgentToolCall[],
  hooks: ToolHooks | undefined,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
): Promise<ExecutedToolBatch> {
  const pending: Array<() => Promise<AgentToolResult>> = [];
  for (const call of calls) {
    await emit({ type: "tool_execution_start", toolCallId: call.id, toolName: call.name, args: call.args });
    const prepared = await prepareToolCall(tools, assistantMessage, call, hooks, signal);
    if (prepared.kind === "immediate") {
      const result = prepared.result;
      await emitExecutionEnd(emit, call, result.isError);
      pending.push(async () => result);
    } else {
      const preparedCall = prepared;
      pending.push(async () => {
        if (signal?.aborted) {
          const result = abortedResult();
          await emitExecutionEnd(emit, call, true);
          return result;
        }
        const executed = await executePreparedCall(preparedCall.tool, call, preparedCall.args, signal, emit);
        const result = await finalizeExecutedCall(
          assistantMessage,
          call,
          preparedCall.args,
          executed,
          hooks,
          signal,
        );
        await emitExecutionEnd(emit, call, result.isError);
        return result;
      });
    }
    if (signal?.aborted) {
      break;
    }
  }
  const results = await Promise.all(pending.map((run) => run()));
  const messages = calls
    .slice(0, results.length)
    .map((call, index) => createToolResultMessage(call.id, results[index].output));
  return { messages, terminate: shouldTerminateBatch(results) };
}
