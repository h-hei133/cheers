/**
 * The Google AI Studio endpoint.
 *
 * A key in a header, the model in the path, and a server-sent event stream whose
 * events are JSON chunks. Simpler than the other Google endpoint in every way,
 * which is why it comes first: the translation is shared between them, so getting
 * it right here means the second one only has to get its host and credential
 * right.
 */

import { declareEndpoint } from "./kinds.js";
import type { CompletedBody, StreamFragment, StreamedCompletion } from "../../turn/completion.js";
import {
  convertContents,
  convertTools,
  thinkingConfigFor,
  textOf,
  type GoogleContent,
  type GooglePart,
  type GoogleRequestBody,
} from "./googleWire.js";

/** Where a request goes, given the model. */
export function googlePath(model: string, stream: boolean): string {
  const method = stream ? "streamGenerateContent" : "generateContent";
  return `/v1beta/models/${encodeURIComponent(model)}:${method}`;
}

/** The request body, shared with the other Google endpoint. */
export function googleBody(input: {
  readonly systemPrompt: string;
  readonly messages: readonly Parameters<typeof convertContents>[0][number][];
  readonly tools: Parameters<typeof convertTools>[0];
  readonly allowTools: boolean;
  readonly temperature: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly thinkingBudgetTokens?: number;
}): GoogleRequestBody {
  const tools = input.allowTools ? convertTools(input.tools) : undefined;
  return {
    contents: convertContents(input.messages),
    ...(input.systemPrompt.trim() !== ""
      ? { systemInstruction: { parts: [{ text: input.systemPrompt }] } }
      : {}),
    generationConfig: {
      temperature: input.temperature,
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(thinkingConfigFor(input.thinkingBudgetTokens) ?? {}),
    },
    ...(tools ? { tools } : {}),
    // Stated rather than left to the provider: the caller decides whether this
    // turn may call a tool, and a mode the provider chose would be that decision
    // made somewhere else.
    ...(tools ? { toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}),
  };
}

declareEndpoint("google-generative-ai", {
  // The model is in the path, and the streaming method is a different one.
  path: (model) => googlePath(model, true),
  headers: (apiKey) => ({ "x-goog-api-key": apiKey, "content-type": "application/json" }),
  body: (input) =>
    googleBody({
      systemPrompt: input.systemPrompt ?? "",
      messages: input.messages as never,
      tools: [],
      allowTools: false,
      temperature: input.temperature ?? 0,
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    }) as never,
  turnBody: (input) =>
    googleBody({
      systemPrompt: input.systemPrompt,
      messages: input.messages as never,
      tools: input.tools,
      allowTools: input.allowTools,
      temperature: input.temperature,
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(input.thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens: input.thinkingBudgetTokens } : {}),
    }) as never,
  readBody: readGenerateContent,
  readStream: readGenerateContentStream,
});

/** A response's chunks, as the protocol frames them. */
interface Chunk {
  readonly candidates?: readonly {
    readonly content?: GoogleContent;
    readonly finishReason?: string;
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
  };
  readonly promptFeedback?: { readonly blockReason?: string; readonly blockReasonMessage?: string };
}

/** The answer out of a non-streamed response. */
function readGenerateContent(body: unknown): CompletedBody {
  const candidates = (body as Chunk)?.candidates;
  const parts = candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((part) => part.text ?? "").join("");
  return { choices: [{ message: { content: text } }] };
}

/**
 * Reading the answer.
 *
 * Each event is a JSON document carrying one step of the response, and the parts
 * accumulate: text and reasoning arrive as fragments, and a tool call arrives
 * whole. A part's `thoughtSignature` is attached to the reasoning it signs and
 * travels back with it.
 */
async function* readGenerateContentStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamFragment, StreamedCompletion, undefined> {
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let reasoning = "";
  let reasoningSignature = "";
  let finishReason: string | undefined;
  let usage: StreamedCompletion["usage"];
  let blocked: string | undefined;
  const calls: Array<{ id: string; name: string; args: string }> = [];
  const iterator = (body as unknown as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();

  for (;;) {
    const chunk = await iterator.next();
    if (chunk.done === true) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    for (;;) {
      const boundary = findEventBoundary(buffer);
      if (!boundary) break;
      const raw = buffer.slice(0, boundary.at);
      buffer = buffer.slice(boundary.at + boundary.width);
      const payload = dataOf(raw);
      if (payload === undefined) continue;

      let parsed: Chunk;
      try {
        parsed = JSON.parse(payload) as Chunk;
      } catch {
        // A partial or malformed event is skipped rather than failing the stream;
        // the alternative turns one bad frame into no answer at all.
        continue;
      }
      if (parsed.promptFeedback?.blockReason) {
        blocked = parsed.promptFeedback.blockReasonMessage ?? parsed.promptFeedback.blockReason;
        continue;
      }

      const candidate = parsed.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (parsed.usageMetadata) {
        usage = {
          prompt_tokens: parsed.usageMetadata.promptTokenCount ?? 0,
          completion_tokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
        };
      }

      for (const part of candidate?.content?.parts ?? []) {
        if (part.functionCall) {
          calls.push({
            id: part.functionCall.id ?? `call_${calls.length}`,
            name: part.functionCall.name ?? "",
            args: JSON.stringify(part.functionCall.args ?? {}),
          });
          continue;
        }
        if (!part.text) continue;
        if (part.thought) {
          reasoning += part.text;
          if (part.thoughtSignature) reasoningSignature += part.thoughtSignature;
          yield { kind: "reasoning", text: part.text };
        } else {
          text += part.text;
          yield { kind: "text", text: part.text };
        }
      }
    }
  }

  if (blocked !== undefined) {
    throw new Error(`The provider refused the prompt: ${blocked}`);
  }

  return {
    message: {
      role: "assistant",
      content: text,
      ...(calls.length > 0
        ? {
            tool_calls: calls.map((call, index) => ({
              id: call.id,
              type: "function" as const,
              function: { name: call.name, arguments: call.args },
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

/** Where the next complete event ends, for any of the separators the format allows. */
function findEventBoundary(buffer: string): { readonly at: number; readonly width: number } | undefined {
  let at = -1;
  let width = 0;
  for (const separator of ["\r\n\r\n", "\n\n", "\r\r"]) {
    const index = buffer.indexOf(separator);
    if (index < 0 || (at >= 0 && index >= at)) continue;
    at = index;
    width = separator.length;
  }
  return at < 0 ? undefined : { at, width };
}

/** The `data:` payload of one event, or nothing when it carries none. */
function dataOf(raw: string): string | undefined {
  const data = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  return data === "" ? undefined : data;
}

export type { GooglePart };
export { textOf };
