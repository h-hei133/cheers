import type { AgentToolCall } from "../core/agent/tools.js";
import type { AgentMessage, AgentStopReason } from "../core/agent/state.js";
import type { AssistantStep } from "../core/agent/loop.js";
import { parseJsonWithRepair } from "../model-adapters/jsonRepair.js";
import { recordSessionUsage } from "../observability/usageTelemetry.js";
import { samplingTemperature } from "../core/commands/fastCommandRuntime.js";
import { getThinkingEffort } from "../core/commands/thinkingCommandRuntime.js";
import { microcompactMessages } from "../core/query/microCompact.js";
import { isEventStream, readCompletionStream, type StreamedToolCall } from "./completion.js";
import { toChatMessages } from "./prompt.js";
import { PARSE_ERROR_KEY, type ToolSchema } from "./tools.js";

/**
 * One model call.
 *
 * The kernel asks for the next assistant step and gets back text, tool calls,
 * and why the model stopped. Everything provider-shaped stays here: the wire
 * request, the streamed deltas, the reasoning channel, the usage record, the
 * host quirks. What comes out is the same whether the answer streamed or
 * arrived whole.
 */

export interface ProviderTarget {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
}

/** What a step reports while it runs, before the assembled message exists. */
export interface StepListener {
  readonly onText?: (delta: string) => void;
  readonly onReasoning?: (delta: string) => void;
  /** The assembled text differs from the streamed deltas. */
  readonly onReplace?: (text: string) => void;
}

export interface StepOptions {
  /** Whether the model may call tools on this step; the last step may not. */
  readonly allowTools: boolean;
}

/** The model side of the kernel: the next assistant step for a context. */
export type StepFunction = (
  messages: readonly AgentMessage[],
  signal: AbortSignal | undefined,
  listener: StepListener,
  options: StepOptions,
) => Promise<AssistantStep>;

export interface StepRequest {
  readonly provider: ProviderTarget;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly systemPrompt: string;
  readonly tools: readonly ToolSchema[];
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly fetchImpl?: typeof fetch;
}

const OVERFLOW_MARKERS = ["context_length_exceeded", "context_overflow", "maximum context length", "prompt_too_long"];

/** Prefix of the failure a step reports when the conversation no longer fits. */
export const CONTEXT_OVERFLOW_PREFIX = "Context overflow: ";

/** Whether a provider failure means the context is too large, not that the request was wrong. */
export function isContextOverflow(detail: string): boolean {
  return OVERFLOW_MARKERS.some((marker) => detail.includes(marker));
}

/** Whether a failed assistant message failed because the context overflowed. */
export function isOverflowFailure(message: Pick<AgentMessage, "stopReason" | "errorMessage">): boolean {
  return message.stopReason === "error" && (message.errorMessage?.startsWith(CONTEXT_OVERFLOW_PREFIX) ?? false);
}

interface CompletionShape {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string | null; readonly tool_calls?: readonly StreamedToolCall[] };
    readonly finish_reason?: string | null;
  }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number; readonly total_tokens?: number };
  readonly reasoning?: string;
  /** Text already delivered as deltas; it must not be delivered a second time. */
  readonly streamed?: string;
}

/**
 * Ask the model for its next step.
 *
 * A host that rejects `reasoning_effort` costs one retry rather than the turn;
 * once dropped the field stays dropped for this session, because asking again
 * would fail again. An overflow answer comes back as a failed step with its own
 * prefix so the session can compact and retry rather than report it.
 */
export function createStepFunction(request: StepRequest): StepFunction {
  let effortAccepted = true;
  const fetchImpl = request.fetchImpl ?? fetch;
  return async (messages, signal, listener, options) => {
    for (;;) {
      const effort = effortAccepted ? getThinkingEffort(request.workspaceRoot) : undefined;
      const payload = {
        model: request.provider.model,
        messages: [
          { role: "system", content: request.systemPrompt },
          ...microcompactMessages(toChatMessages(messages), { keepRecentTurns: 3, maxOutputChars: 1000 }).messages,
        ],
        tools: request.tools,
        tool_choice: options.allowTools ? "auto" : "none",
        stream: true,
        stream_options: { include_usage: true },
        temperature: samplingTemperature(request.workspaceRoot, request.temperature ?? 0.7),
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(request.topP != null ? { top_p: request.topP } : {}),
        ...(request.maxOutputTokens != null ? { max_tokens: request.maxOutputTokens } : {}),
      };
      // What has been shown so far, so an interrupted answer keeps the part
      // the user already read instead of vanishing from the conversation.
      let shown = "";
      const watched: StepListener = {
        ...listener,
        onText: (delta) => {
          shown += delta;
          listener.onText?.(delta);
        },
      };
      let response: Response;
      try {
        response = await fetchImpl(`${request.provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${request.provider.apiKey}` },
          body: JSON.stringify(payload),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) return abortedStep("");
        return errorStep(`Network error: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!response.ok) {
        const detail = await response.text();
        if (isContextOverflow(detail)) return errorStep(`${CONTEXT_OVERFLOW_PREFIX}${detail.slice(0, 200)}`);
        if (effort && /reasoning_effort/i.test(detail)) {
          effortAccepted = false;
          continue;
        }
        return errorStep(`Provider HTTP ${response.status}: ${detail.slice(0, 200)}`);
      }
      try {
        const completion = await readCompletion(response, watched);
        if (completion.usage) {
          recordSessionUsage(request.sessionId, {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
            model: request.provider.model,
          });
        }
        return toStep(completion, watched);
      } catch (error) {
        if (signal?.aborted) return abortedStep(shown);
        return errorStep(`Network error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
}

async function readCompletion(response: Response, listener: StepListener): Promise<CompletionShape> {
  if (!isEventStream(response)) {
    // A provider that ignored `stream: true` answers with one JSON body; the
    // text then arrives in a single delta.
    return (await response.json()) as CompletionShape;
  }
  const stream = readCompletionStream(response.body!);
  let streamed = "";
  for (;;) {
    const step = await stream.next();
    if (step.done === true) {
      return {
        choices: [{ message: step.value.message, finish_reason: step.value.finishReason }],
        usage: step.value.usage,
        reasoning: step.value.reasoning,
        streamed,
      };
    }
    if (step.value.kind === "reasoning") {
      listener.onReasoning?.(step.value.text);
      continue;
    }
    streamed += step.value.text;
    listener.onText?.(step.value.text);
  }
}

/** Shape the assembled response into a kernel step. */
export function toStep(completion: CompletionShape, listener: StepListener): AssistantStep {
  const choice = completion.choices?.[0];
  const message = choice?.message;
  if (!message) return errorStep("Empty response from provider");
  const { text, calls } = liftInlineCalls(message.content ?? "", message.tool_calls ?? []);
  if (text) {
    if (completion.streamed === undefined) listener.onText?.(text);
    else if (text !== completion.streamed) listener.onReplace?.(text);
  }
  const silent = !text && calls.length === 0;
  return {
    text,
    toolCalls: calls.map(toToolCall),
    stopReason: stopReasonOf(choice?.finish_reason),
    ...(silent ? { errorMessage: emptyAnswerExplanation(choice?.finish_reason, completion.reasoning?.length ?? 0) } : {}),
  };
}

function toToolCall(call: StreamedToolCall): AgentToolCall {
  let args: unknown;
  try {
    args = parseJsonWithRepair<Record<string, unknown>>(call.function.arguments || "{}");
  } catch (error) {
    args = {
      [PARSE_ERROR_KEY]: `Invalid JSON arguments: ${error instanceof Error ? error.message : String(error)}. Raw: ${call.function.arguments}`,
    };
  }
  return { id: call.id, name: call.function.name, args };
}

function stopReasonOf(finishReason: string | null | undefined): AgentStopReason {
  if (finishReason === "length") return "length";
  return "stop";
}

/**
 * Tool calls a model wrote into its prose instead of the tool-call channel.
 *
 * The inline block is lifted out so the text shown is the answer alone and the
 * calls run like any other. Inner tags are constrained to one invocation so a
 * malformed block cannot swallow the next one.
 */
function liftInlineCalls(
  content: string,
  channelCalls: readonly StreamedToolCall[],
): { readonly text: string; readonly calls: readonly StreamedToolCall[] } {
  if (!content.includes("<｜DSML｜invoke")) return { text: content, calls: channelCalls };
  const lifted: StreamedToolCall[] = [];
  const matches = content.matchAll(
    /<｜DSML｜invoke\s+name=["']([^"']+)["']>(?:(?!<\/｜DSML｜invoke>)[\s\S])*?<｜DSML｜parameter\s+name=["']arguments["'][^>]*>([\s\S]*?)<\/｜DSML｜parameter>(?:(?!<\/｜DSML｜invoke>)[\s\S])*?<\/｜DSML｜invoke>/gi,
  );
  for (const match of matches) {
    lifted.push({
      id: `call_${Math.random().toString(36).slice(2, 9)}`,
      type: "function",
      function: { name: match[1], arguments: match[2].trim() },
    });
  }
  const text = content
    .replace(/<｜DSML｜tool_calls>[\s\S]*?<\/｜DSML｜tool_calls>/gi, "")
    .replace(/<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/gi, "")
    .trim();
  return { text, calls: [...channelCalls, ...lifted] };
}

function abortedStep(shown: string): AssistantStep {
  return { text: shown, toolCalls: [], stopReason: "aborted", errorMessage: "Operation aborted" };
}

function errorStep(message: string): AssistantStep {
  return { text: "", toolCalls: [], stopReason: "error", errorMessage: message };
}

/**
 * Why a step produced no answer, in terms the user can act on.
 *
 * Each case has a different remedy, so each is named: a truncated response needs a
 * shorter context, a refusal needs a different request, and a model that spent the
 * whole step reasoning without concluding needs to be asked again.
 */
export function emptyAnswerExplanation(finishReason: string | null | undefined, reasoningLength: number): string {
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
