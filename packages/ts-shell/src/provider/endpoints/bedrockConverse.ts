/**
 * The Bedrock Converse wire shape.
 *
 * Different from the other two in ways a flag could not express. The model is
 * named in the URL rather than the body; the system instruction is a list of
 * blocks rather than a role; tools are wrapped in a `toolSpec`; a tool's result
 * is a block inside a user turn rather than a turn of its own; and the answer
 * arrives as length-prefixed binary messages rather than as text.
 *
 * One rule is worth stating where it bites: a request whose history contains a
 * tool call or a tool result is rejected unless it also carries a tool
 * configuration. The protocol has no way to say "no tools this time" while
 * showing a tool's output, so a turn that offers none still declares one.
 */

import { declareEndpoint } from "./kinds.js";
import type { EndpointShape, SimpleRequest, TurnRequest } from "./kinds.js";
import { readEventStream, type EventMessage } from "../aws/eventStream.js";
import { resolveCredentials } from "../aws/credentials.js";
import { signAwsRequest } from "../aws/signature.js";
import type { RequestSigner } from "../request/fetch.js";
import { convertMessages, type WireMessage } from "./bedrock/messages.js";
import type { CompletedBody, StreamFragment, StreamedCompletion } from "../../turn/completion.js";

/**
 * The declaration sent when a request shows tool history but offers no tools.
 *
 * The model is instructed to answer in text rather than call it. Execution
 * eligibility remains the turn layer's responsibility; this satisfies a validation
 * rule that has no "none" spelling.
 */
const MIN_THINKING_BUDGET_TOKENS = 1024;
const MIN_ANSWER_TOKENS = 1024;

const PLACEHOLDER_TOOL_NAME = "__no_tools__";

const PLACEHOLDER_TOOL = {
  toolSpec: {
    name: PLACEHOLDER_TOOL_NAME,
    description: "Placeholder required when a request carries tool history. Answer with text; do not call this.",
    inputSchema: { json: { type: "object", properties: {} } },
  },
};

/** Whether anything in the conversation refers to a tool. */
function mentionsTools(messages: readonly WireMessage[]): boolean {
  return messages.some((message) =>
    message.content.some((block) => "toolUse" in block || "toolResult" in block),
  );
}

/**
 * The tool configuration, which is omitted only when it is allowed to be.
 *
 * Omitting it while the history shows a tool call is a rejected request rather
 * than a turn with no tools, so the placeholder stands in for the list. It is
 * only ever sent when there were no real tools to send, which is why the model
 * is told not to call it.
 */
function toolConfigFor(input: {
  readonly tools: TurnRequest["tools"];
  readonly allowTools: boolean;
  readonly mentionsTools: boolean;
}): Record<string, unknown> | undefined {
  if (input.tools.length > 0 && input.allowTools) {
    return {
      tools: input.tools.map((tool) => ({
        toolSpec: {
          name: tool.function.name,
          ...(tool.function.description ? { description: tool.function.description } : {}),
          inputSchema: { json: tool.function.parameters },
        },
      })),
      toolChoice: { auto: {} },
    };
  }
  return input.mentionsTools ? { tools: [PLACEHOLDER_TOOL] } : undefined;
}

/**
 * The request body for a turn.
 *
 * `maxTokens` is always stated because this protocol has no default for it, and a
 * request without one is rejected rather than given a sensible limit.
 */
function converseBody(input: TurnRequest): Record<string, unknown> {
  const messages = convertMessages(input.messages, input.vision);
  const maxTokens = input.maxOutputTokens ?? 4096;
  // Keep the requested output ceiling and reserve room for the answer. A budget
  // below 1024 is rejected by the model, so small ceilings get no thinking.
  const budget = Math.min(input.thinkingBudgetTokens ?? 0, maxTokens - MIN_ANSWER_TOKENS);
  const toolConfig = toolConfigFor({
    tools: input.tools,
    allowTools: input.allowTools,
    mentionsTools: mentionsTools(messages),
  });

  return {
    messages,
    ...(input.systemPrompt.trim() !== "" ? { system: [{ text: input.systemPrompt }] } : {}),
    inferenceConfig: {
      maxTokens,
      // Only stated when the model takes one: a reasoning model rejects the field.
      ...(input.supportsTemperature !== false && input.thinkingLevelName === undefined
        ? { temperature: input.temperature }
        : {}),
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
    },
    // Thinking is a model-level request, not a sampling setting: it travels in
    // the protocol's own fields when the configured budget fits the output cap.
    ...(budget >= MIN_THINKING_BUDGET_TOKENS
      ? {
          additionalModelRequestFields: {
            thinking: { type: "enabled", budget_tokens: budget },
          },
        }
      : {}),
    ...(toolConfig ? { toolConfig } : {}),
  };
}

/**
 * Extract an AWS region from an endpoint hostname, when the hostname carries one.
 *
 * Bedrock hostnames look like `bedrock-runtime.eu-west-1.amazonaws.com` (or with cn- domains).
 * A custom gateway or reverse proxy will not carry a standard region segment, in which case
 * undefined is returned and the caller falls back to the environment or default region.
 */
function regionFromHost(host: string): string | undefined {
  const match = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.([a-z]{2}-[a-z]+-\d+)\.amazonaws\.com(?:\.cn)?$/i.exec(host);
  return match ? match[1] : undefined;
}

/**
 * The signer for this endpoint.
 *
 * The host is derived from the region because the signature covers it, and the
 * host has to be the one the request actually goes to or the service rejects the
 * signature. A base URL that already names a host wins, so a caller pointing at a
 * gateway signs for the gateway.
 *
 * The credential is resolved per request so that expiring credentials (such as STS
 * AssumeRole, SSO, container, or IMDS sessions) are refreshed by the credentials
 * provider cache rather than captured once for the lifetime of the signer.
 */
async function bedrockSigner(): Promise<RequestSigner | undefined> {
  return async (request) => {
    const url = new URL(request.url);
    const region =
      regionFromHost(url.hostname) ??
      process.env.AWS_REGION ??
      process.env.AWS_DEFAULT_REGION ??
      "us-east-1";
    const credentials = await resolveCredentials();
    return signAwsRequest({
      method: request.method,
      host: url.host,
      path: url.pathname,
      ...(url.search ? { query: url.search.slice(1) } : {}),
      headers: request.headers,
      body: request.body ?? "",
      region,
      service: "bedrock-runtime",
      credentials,
    });
  };
}

declareEndpoint("bedrock-converse-stream", {
  minimumThinkingOutputTokens: MIN_THINKING_BUDGET_TOKENS + MIN_ANSWER_TOKENS,
  // This protocol names the model in the URL, which is why the path is a function.
  path: (model, stream = true) => `/model/${encodeURIComponent(model)}/${stream ? "converse-stream" : "converse"}`,
  // Signing happens at the transport, because a signature covers the body and the
  // body does not exist here. These are the headers that are always true.
  headers: () => ({ "content-type": "application/json", accept: "application/vnd.amazon.eventstream" }),
  // A signature covers the body, so it is built at the transport rather than
  // here. The region and service are fixed; the credential is whatever the
  // account provides.
  signer: () => bedrockSigner(),
  body: (input: SimpleRequest) => converseBody(simpleAsTurn(input)),
  turnBody: converseBody,
  refreshBody: (body) => {
    const fields = body.additionalModelRequestFields as { thinking?: { type?: string } } | undefined;
    if (fields?.thinking?.type === "enabled") return undefined;
    return { ...body, inferenceConfig: { ...(body.inferenceConfig as object), maxTokens: 1 } };
  },
  readBody: readConverseBody,
  readStream: readConverseStream,
});

/** The answer text out of a non-streamed response, in the shape the callers share. */
function readConverseBody(body: unknown): CompletedBody {
  const output = (body as { output?: { message?: { content?: ReadonlyArray<{ text?: string }> } } })?.output;
  const text = (output?.message?.content ?? []).map((block) => block.text ?? "").join("");
  return { choices: [{ message: { content: text }, finish_reason: mapConverseStopReason((body as { stopReason?: string })?.stopReason) }],
    usage: converseUsage((body as { usage?: ConverseUsage })?.usage),
  };
}

/**
 * Reading the answer.
 *
 * Every event arrives as its own binary message whose headers say what it is. The
 * text and the reasoning arrive as fragments and are joined; a tool call's
 * arguments arrive as a string built one fragment at a time, and are parsed once
 * the block ends rather than at each fragment — a partial object is not JSON.
 */
async function* readConverseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamFragment, StreamedCompletion, undefined> {
  let text = "";
  let reasoning = "";
  let reasoningSignature = "";
  let finishReason: string | undefined;
  let usage: StreamedCompletion["usage"];
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let sawMessageStop = false;

  for await (const message of readEventStream(body)) {
    const messageType = message.headers[":message-type"];
    if (messageType === "exception" || messageType === "error") {
      // The stream carries provider failures in band, which is the only place
      // they can be seen: the transport succeeded, the answer did not. The frame
      // is terminal — the answer is already known to be unusable — so the rest of
      // the stream is not read. Draining it would spend the connection on bytes
      // that cannot change the outcome, and would delay the failure until the
      // provider chose to close.
      const detail = (message.headers[":exception-type"] ?? message.headers[":error-code"] ?? "error").toString();
      throw new Error(
        `Provider reported an error mid-stream: ${detail}: ${new TextDecoder().decode(message.payload).slice(0, 300)}`,
      );
    }
    if (messageType !== "event") continue;

    const event = parsePayload(message);
    if (!event) continue;
    const type = message.headers[":event-type"];

    if (type === "contentBlockStart") {
      const start = event.start as { toolUse?: { toolUseId?: string; name?: string } } | undefined;
      if (start?.toolUse) {
        calls.set(blockIndex(event), {
          id: start.toolUse.toolUseId ?? "",
          name: start.toolUse.name ?? "",
          args: "",
        });
      }
      continue;
    }
    if (type === "contentBlockDelta") {
      const delta = event.delta as
        | { text?: string; toolUse?: { input?: string }; reasoningContent?: { text?: string; signature?: string } }
        | undefined;
      if (delta?.text) {
        text += delta.text;
        yield { kind: "text", text: delta.text };
      } else if (delta?.reasoningContent?.text) {
        reasoning += delta.reasoningContent.text;
        yield { kind: "reasoning", text: delta.reasoningContent.text };
      }
      if (delta?.reasoningContent?.signature) reasoningSignature += delta.reasoningContent.signature;
      if (delta?.toolUse?.input !== undefined) {
        const call = calls.get(blockIndex(event));
        if (call) call.args += delta.toolUse.input;
      }
      continue;
    }
    if (type === "messageStop") {
      sawMessageStop = true;
      finishReason = mapConverseStopReason(event.stopReason);
      continue;
    }
    if (type === "metadata") {
      const tokens = event.usage as ConverseUsage | undefined;
      if (tokens) {
        // Named the way every other protocol names them, so a reader of usage
        // does not have to know which endpoint answered.
        usage = converseUsage(tokens);
      }
    }
  }

  if (!sawMessageStop) {
    // A stream without completion evidence is a truncated answer, and saying
    // so beats returning the part that arrived as though it were the whole thing.
    throw new Error("Provider stream ended before it reported the message was complete");
  }

  return {
    message: {
      role: "assistant",
      content: text,
      ...(calls.size > 0
        ? {
            tool_calls: [...calls.entries()].map(([index, call]) => ({
              id: call.id,
              type: "function" as const,
              function: { name: call.name, arguments: call.args || "{}" },
              index,
            })),
          }
        : {}),
    },
    reasoning,
    ...(reasoningSignature ? { reasoningSignature } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  } as StreamedCompletion;
}

/**
 * A request without tools, in the full turn shape.
 *
 * The two callers ask different questions — a summarizer sends a conversation and
 * a prompt, a turn sends tools and sampling settings — so the simple form has to
 * be widened before the body can be built. The fields it does not carry are the
 * ones a summarization has no opinion about.
 */
function simpleAsTurn(input: SimpleRequest): TurnRequest {
  return {
    model: input.model,
    systemPrompt: input.systemPrompt ?? "",
    messages: input.messages,
    tools: [],
    allowTools: false,
    vision: false,
    temperature: input.temperature ?? 0,
    ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    ...(input.supportsTemperature !== undefined ? { supportsTemperature: input.supportsTemperature } : {}),
    systemRole: "system",
    reasoningEffort: false,
    maxTokensField: "max_tokens",
    assistantAfterToolResult: false,
  };
}

/** The block a delta belongs to, as a number the accumulator keys on. */
/**
 * Bedrock's stop reason, in the vocabulary the turn layer reads.
 *
 * Total for the same reason the other protocols' mappers are: the turn layer
 * decides between an answer and a failure from this value alone, so a provider
 * that hands over its own words leaves it guessing. Bedrock names the ordinary
 * ending `end_turn` and truncation `max_tokens`, neither of which the turn layer
 * knows — passing them through made every normal reply a failure and every
 * truncated one a generic error.
 *
 * The context-window case is grouped with truncation because that is what it is:
 * the reply was cut for want of room, and the remedy (ask for less, or compact)
 * is the same one.
 */
function mapConverseStopReason(reason: unknown): string | undefined {
  if (typeof reason !== "string") return undefined;
  if (reason === "end_turn" || reason === "stop_sequence") return "stop";
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") return "length";
  if (reason === "tool_use") return "tool_calls";
  return reason;
}

function blockIndex(event: Record<string, unknown>): number {
  const index = event.contentBlockIndex;
  return typeof index === "number" ? index : 0;
}

/** One event's payload as an object, or nothing when it is not one. */
function parsePayload(message: EventMessage): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(message.payload)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    // A payload that is not JSON is not an event this reader knows, and skipping
    // it is better than failing a stream over something it does not use.
    return undefined;
  }
}

export type { EndpointShape };

interface ConverseUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadInputTokens?: number;
  readonly cacheWriteInputTokens?: number;
  readonly totalTokens?: number;
}

/** Converse reports ordinary input separately from cache reads and writes. */
function converseUsage(usage: ConverseUsage | undefined): CompletedBody["usage"] {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    cache_read_input_tokens: usage.cacheReadInputTokens,
    cache_creation_input_tokens: usage.cacheWriteInputTokens,
    ...(usage.totalTokens !== undefined ? { total_tokens: usage.totalTokens } : {}),
  };
}
