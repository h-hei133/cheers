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
import type { ChatMessage } from "../../turn/prompt.js";
import type { CompletedBody, StreamFragment, StreamedCompletion } from "../../turn/completion.js";

/**
 * The declaration sent when a request shows tool history but offers no tools.
 *
 * Named so that it cannot collide with a real tool: it is never callable, because
 * the model is told to answer in text, and it exists only to satisfy a validation
 * rule that has no "none" spelling.
 */
const PLACEHOLDER_TOOL_NAME = "__no_tools__";

const PLACEHOLDER_TOOL = {
  toolSpec: {
    name: PLACEHOLDER_TOOL_NAME,
    description: "Placeholder required when a request carries tool history. Answer with text; do not call this.",
    inputSchema: { json: { type: "object", properties: {} } },
  },
};

/** A block in a user turn. */
type UserBlock =
  | { readonly text: string }
  | { readonly image: { readonly format: string; readonly source: { readonly bytes: string } } }
  | { readonly toolResult: { readonly toolUseId: string; readonly content: ReadonlyArray<{ text: string }>; readonly status: "success" | "error" } };

/** A block in an assistant turn. */
type AssistantBlock =
  | { readonly text: string }
  | { readonly toolUse: { readonly toolUseId: string; readonly name: string; readonly input: unknown } }
  | { readonly reasoningContent: { readonly reasoningText: { readonly text: string; readonly signature?: string } } };

interface WireMessage {
  readonly role: "user" | "assistant";
  readonly content: ReadonlyArray<UserBlock | AssistantBlock>;
}

/**
 * The conversation in this protocol's shape.
 *
 * Turns are merged rather than emitted one per message. The protocol takes
 * alternating turns whose content is a list of blocks, so a tool's result and
 * anything the user said in the same turn belong in one entry — emitting them
 * separately would produce two user turns in a row, which is not a shape it
 * accepts.
 */
function convertMessages(messages: readonly ChatMessage[]): WireMessage[] {
  const wire: WireMessage[] = [];

  const pushUser = (block: UserBlock): void => {
    const previous = wire[wire.length - 1];
    if (previous && previous.role === "user") {
      wire[wire.length - 1] = { role: "user", content: [...previous.content, block] };
      return;
    }
    wire.push({ role: "user", content: [block] });
  };

  for (const message of messages) {
    if (message.role === "system") continue;

    if (message.role === "tool") {
      pushUser({
        toolResult: {
          toolUseId: message.tool_call_id ?? "",
          content: [{ text: textOf(message.content) }],
          // The conversation carries no success marker, so every result is
          // reported as one. The text is where a failure is described, and
          // claiming the opposite of what the text says would be worse than
          // repeating it.
          status: "success",
        },
      });
      continue;
    }

    if (message.role === "user") {
      pushUserBlocks(pushUser, message.content);
      continue;
    }

    const blocks: AssistantBlock[] = [];
    // Signed reasoning goes first, because that is the order it was produced in
    // and the order this protocol expects it back. A turn carrying a tool call
    // has to bring the signed block that preceded it.
    if (message.reasoning?.text && message.reasoning.signature) {
      blocks.push({
        reasoningContent: {
          reasoningText: { text: message.reasoning.text, signature: message.reasoning.signature },
        },
      });
    }
    const text = textOf(message.content);
    if (text) blocks.push({ text });
    for (const call of message.tool_calls ?? []) {
      blocks.push({
        toolUse: {
          toolUseId: call.id,
          name: call.function.name,
          input: safeParse(call.function.arguments),
        },
      });
    }
    if (blocks.length > 0) {
      const previous = wire[wire.length - 1];
      if (previous && previous.role === "assistant") {
        wire[wire.length - 1] = { role: "assistant", content: [...previous.content, ...blocks] };
      } else {
        wire.push({ role: "assistant", content: blocks });
      }
    }
  }
  return wire;
}

type PushUser = (block: UserBlock) => void;

/** The text of a message whose content may be a string or a list of blocks. */
function textOf(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

/**
 * A user message's blocks in this protocol's shape.
 *
 * Text stays text and an image stays an image: flattening to text here would
 * send a request the model reads as a description of a picture it cannot see,
 * and the picture would never arrive. A block this code does not recognize is
 * carried as its text rather than dropped, so an unknown shape costs the
 * picture rather than the words beside it.
 */
function pushUserBlocks(pushUser: PushUser, content: ChatMessage["content"]): void {
  if (typeof content === "string") {
    if (content) pushUser({ text: content });
    return;
  }
  if (!content) return;
  for (const block of content) {
    if (block.type === "text") {
      if (block.text) pushUser({ text: block.text });
      continue;
    }
    if (block.type === "image") {
      pushUser({
        image: {
          format: imageFormat(block.mimeType),
          source: { bytes: block.data },
        },
      });
      continue;
    }
    const fallback: string = (block as { readonly text?: string }).text ?? "";
    if (fallback) pushUser({ text: fallback });
  }
}

/** The format name this protocol expects for a MIME type. */
function imageFormat(mimeType: string): string {
  const format = mimeType.split("/")[1]?.toLowerCase();
  if (format === "jpg") return "jpeg";
  return format ?? "png";
}

/** Arguments as an object, falling back to an empty one for text that is not JSON. */
function safeParse(arguments_: string): unknown {
  try {
    return arguments_ ? JSON.parse(arguments_) : {};
  } catch {
    return {};
  }
}

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
  const messages = convertMessages(input.messages);
  const toolConfig = toolConfigFor({
    tools: input.tools,
    allowTools: input.allowTools,
    mentionsTools: mentionsTools(messages),
  });

  return {
    messages,
    ...(input.systemPrompt.trim() !== "" ? { system: [{ text: input.systemPrompt }] } : {}),
    inferenceConfig: {
      maxTokens: input.maxOutputTokens ?? 4_096,
      // Only stated when the model takes one: a reasoning model rejects the field.
      ...(input.supportsTemperature !== false && input.thinkingLevelName === undefined
        ? { temperature: input.temperature }
        : {}),
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
    },
    // Thinking is a model-level request, not a sampling setting: it travels in
    // the protocol's own fields, and only when the run configured a budget.
    // Sending it unasked would turn on reasoning for a model the caller wanted
    // fast, and omitting it when asked would silently drop the setting.
    ...(input.thinkingBudgetTokens !== undefined
      ? {
          additionalModelRequestFields: {
            thinking: { type: "enabled", budget_tokens: input.thinkingBudgetTokens },
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
      host: url.hostname,
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
  // This protocol names the model in the URL, which is why the path is a function.
  path: (model) => `/model/${encodeURIComponent(model)}/converse-stream`,
  // Signing happens at the transport, because a signature covers the body and the
  // body does not exist here. These are the headers that are always true.
  headers: () => ({ "content-type": "application/json", accept: "application/vnd.amazon.eventstream" }),
  // A signature covers the body, so it is built at the transport rather than
  // here. The region and service are fixed; the credential is whatever the
  // account provides.
  signer: () => bedrockSigner(),
  body: (input: SimpleRequest) => converseBody(simpleAsTurn(input)),
  turnBody: converseBody,
  readBody: readConverseBody,
  readStream: readConverseStream,
});

/** The answer text out of a non-streamed response, in the shape the callers share. */
function readConverseBody(body: unknown): CompletedBody {
  const output = (body as { output?: { message?: { content?: ReadonlyArray<{ text?: string }> } } })?.output;
  const text = (output?.message?.content ?? []).map((block) => block.text ?? "").join("");
  return { choices: [{ message: { content: text } }] };
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
  let sawMessageStart = false;
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

    if (type === "messageStart") {
      sawMessageStart = true;
      continue;
    }
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
      finishReason = event.stopReason as string | undefined;
      continue;
    }
    if (type === "metadata") {
      const tokens = event.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      if (tokens) {
        // Named the way every other protocol names them, so a reader of usage
        // does not have to know which endpoint answered.
        usage = {
          prompt_tokens: tokens.inputTokens ?? 0,
          completion_tokens: tokens.outputTokens ?? 0,
        };
      }
    }
  }

  if (sawMessageStart && !sawMessageStop) {
    // A stream that started and never finished is a truncated answer, and saying
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
