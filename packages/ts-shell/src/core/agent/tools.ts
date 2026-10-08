import { messageToText } from "../../model-adapters/multimodal.js";
import type { AgentEventSink } from "./events.js";
import { recordCount, recordTiming } from "../../observability/metrics.js";
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
  /**
   * Structured facts a tool wants recorded beside its prose.
   *
   * The prose is what the model reads and answers; the metadata is what a
   * later reader replays state from — the todo checklist, say, which is part of
   * the session's facts rather than of the answer. It travels with the result
   * message and is bounded at the event boundary. An explicit string
   * outputNotice also preserves page/recovery facts when model text is shortened.
   */
  readonly metadata?: Record<string, unknown>;
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
    onUpdate?: (partialResult: unknown, options?: { checkpoint?: boolean }) => void,
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
  readonly metadata?: Record<string, unknown>;
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

export function boundText(text: string, limit: number = TOOL_OUTPUT_LIMIT, notice?: unknown): string {
  if (text.length <= limit) {
    return text;
  }
  const marker = `\n\n[... output truncated to ${limit} chars]`;
  if (typeof notice !== "string" || notice.length === 0) {
    return `${text.slice(0, limit)}${marker}`;
  }
  // Producers identify the facts needed to recover an omitted page. Reserve
  // space for them, including the marker, without parsing the result's prose.
  const tail = boundedNotice(notice, Math.min(2000, Math.max(0, limit - marker.length - 2)));
  const suffix = `${marker}\n\n${tail}`;
  return `${text.slice(0, Math.max(0, limit - suffix.length))}${suffix}`.slice(0, limit);
}

function boundedNotice(notice: string, limit: number): string {
  if (notice.length <= limit) return notice;
  const marker = "\n[... result notice shortened]\n";
  if (limit <= marker.length) return marker.slice(0, limit);
  const retained = limit - marker.length;
  const head = Math.ceil(retained / 2);
  const tail = retained - head;
  return notice.slice(0, head) + marker + (tail ? notice.slice(-tail) : "");
}

export function createToolResultMessage(
  toolCallId: string,
  output: string,
  metadata?: Record<string, unknown>,
): AgentMessage {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: output,
    ...(metadata ? { metadata } : {}),
  };
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

async function emitToolResultMessage(message: AgentMessage, emit: AgentEventSink): Promise<AgentMessage> {
  await emit({ type: "message_start", message });
  await emit({ type: "message_end", message });
  return message;
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
    messages.push(
      await emitToolResultMessage(
        createToolResultMessage(call.id, result.output, result.metadata),
        emit,
      ),
    );
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
  // Bounded text, and the type it feeds is a string: this is the batch the
  // kernel records, and it carries text rather than attachments.
  const bounded = batch.messages.map((message) => ({
    ...message,
    content: boundText(messageToText(message.content), TOOL_OUTPUT_LIMIT, message.metadata?.outputNotice),
  }));
  if (!signal?.aborted) {
    return { messages: bounded, terminate: batch.terminate };
  }
  const pairedIds = new Set(bounded.map((message) => message.tool_call_id));
  // Annotated because the bounded copy narrows `content` to a string, and this
  // array also receives the tool results appended below.
  const messages: AgentMessage[] = [...bounded];
  for (const call of calls) {
    if (pairedIds.has(call.id)) {
      continue;
    }
    await emit({ type: "tool_execution_start", toolCallId: call.id, toolName: call.name, args: call.args });
    await emitExecutionEnd(emit, call, true);
    messages.push(await emitToolResultMessage(createToolResultMessage(call.id, abortedResult().output), emit));
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
  // Timed here because this is the one place every tool call passes through,
  // whether it ran sequentially or in a batch. The measurement is buffered, so
  // it costs a map update rather than a disk write on the hot path.
  const started = Date.now();
  try {
    const result = await tool.execute(call.id, args, signal, (partialResult) => {
      void emit({
        type: "tool_execution_update",
        toolCallId: call.id,
        toolName: call.name,
        args: call.args,
        partialResult,
      });
    });
    recordCount("tool.calls", 1, { tool: call.name, outcome: result.isError ? "error" : "ok" });
    recordTiming("tool.duration", Date.now() - started, { tool: call.name });
    return result;
  } catch (error) {
    // A throw is a tool outcome too, and leaving it uncounted would make the
    // error rate look lower than it is.
    recordCount("tool.calls", 1, { tool: call.name, outcome: "error" });
    recordTiming("tool.duration", Date.now() - started, { tool: call.name });
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
    const output = update.output ?? executed.output;
    const metadata = { ...executed.metadata, ...update.metadata };
    if (output !== executed.output && !Object.hasOwn(update.metadata ?? {}, "outputNotice")) {
      // Appended hook facts must survive the same cap as the producer's notice.
      // A replacement (including redaction) invalidates the original notice.
      if (typeof executed.metadata?.outputNotice === "string" && output.startsWith(executed.output)) {
        metadata.outputNotice = executed.metadata.outputNotice + output.slice(executed.output.length);
      } else {
        delete metadata.outputNotice;
      }
    }
    return {
      ...executed,
      ...(executed.metadata || update.metadata ? { metadata } : {}),
      output,
      isError: executed.isError || update.isError === true,
      terminate: update.terminate ?? executed.terminate,
    };
  } catch (error) {
    const warning = `Tool result hook error: ${error instanceof Error ? error.message : String(error)}`;
    return {
      ...executed,
      output: `${executed.output}\n\n${warning}`,
      metadata: { ...executed.metadata, outputNotice: [
        typeof executed.metadata?.outputNotice === "string" ? executed.metadata.outputNotice : "", warning,
      ].filter(Boolean).join("\n\n") },
      isError: true,
    };
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
    messages.push(
      await emitToolResultMessage(
        createToolResultMessage(call.id, result.output, result.metadata),
        emit,
      ),
    );
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
  const messages: AgentMessage[] = [];
  const paired = calls.slice(0, results.length);
  for (let index = 0; index < paired.length; index += 1) {
    messages.push(
      await emitToolResultMessage(
        createToolResultMessage(paired[index].id, results[index].output, results[index].metadata),
        emit,
      ),
    );
  }
  return { messages, terminate: shouldTerminateBatch(results) };
}
