/**
 * The Google wire shape, shared by both of its endpoints.
 *
 * Two endpoints with the same request and response shapes but different hosts,
 * credentials and path layouts. Keeping the translation here and the differences
 * in their own modules means one set of translation bugs rather than two.
 *
 * Three things differ from every other protocol here and none is cosmetic:
 *
 *   - The assistant's role is called `model`, and a message is a list of parts
 *     rather than a string.
 *   - A tool's result is a `functionResponse` part inside a user turn, and the
 *     API requires the responses to one turn's calls to arrive together — so they
 *     are merged rather than emitted one per result.
 *   - Reasoning carries an opaque `thoughtSignature` that has to be handed back
 *     exactly where it came from. Moving one to a different part, or dropping it,
 *     makes the model unable to continue its own train of thought.
 */

import { formatNonVisionFallback, messageToText, type MultimodalContentBlock } from "../../model-adapters/multimodal.js";
import type { CompletedBody, StreamFragment, StreamedCompletion } from "../../turn/completion.js";
import { validGoogleFrame } from './google/frame.js';
import type { GooglePart, GoogleContent, GoogleMessage } from './google/model.js';
import { appendGoogleOutput, createGoogleOutput, googleOutput, googleProjection, googleSignature, replayGoogle, legacyGoogleSignature } from './google/replay.js';
export type { GooglePart, GoogleContent, GoogleMessage } from './google/model.js';

/** The request, as both endpoints spell it. */
export interface GoogleRequestBody {
  readonly contents: readonly GoogleContent[];
  readonly systemInstruction?: { readonly parts: readonly { readonly text: string }[] };
  readonly generationConfig?: Record<string, unknown>;
  readonly tools?: readonly { readonly functionDeclarations: readonly Record<string, unknown>[] }[];
  readonly toolConfig?: { readonly functionCallingConfig: { readonly mode: string } };
}

/** The text of a message whose content may be absent. */
export function textOf(content: GoogleMessage["content"]): string {
  return messageToText(content);
}

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

/** Keep unsupported images visible as text without sending invalid binary parts. */
function contentParts(content: GoogleMessage["content"], vision: boolean): GooglePart[] {
  if (typeof content === "string") return content ? [{ text: content }] : [];
  return (content ?? []).map((block) => {
    if (block.type === "text") return { text: block.text };
    if (!vision) return { text: formatNonVisionFallback(block) };
    if (!IMAGE_MIMES.has(block.mimeType)) return { text: `[Unsupported image type: ${block.mimeType}]` };
    return { inlineData: { mimeType: block.mimeType, data: block.data } };
  });
}

/** Arguments as an object, or an empty one for text that is not JSON. */
export function parseArguments(arguments_: string): Record<string, unknown> {
  try {
    const parsed = arguments_ ? (JSON.parse(arguments_) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The conversation in Google's shape.
 *
 * The merge of consecutive results is a correctness requirement rather than a
 * tidy-up: the API rejects a request whose count of response parts does not match
 * its count of call parts, and one result per turn is how that happens.
 */
export function convertContents(messages: readonly GoogleMessage[], model = "", vision = false, provider?: string, binding?: string): GoogleContent[] {
  const contents: GoogleContent[] = [];
  const toolCallNames = new Map<string, string>();
  const nativeCallIds = new Map<string, string | undefined>();
  const nestedImages = Number(/(?:^|\/)gemini-(\d+)(?:[.-]|$)/i.exec(model)?.[1] ?? 0) >= 3;
  let pendingImages: GooglePart[] = [];
  const flushImages = (): void => {
    if (pendingImages.length > 0) contents.push({ role: "user", parts: pendingImages });
    pendingImages = [];
  };

  for (const message of messages) {
    if (message.role === "system") continue;

    if (message.role !== "tool") flushImages();

    if (message.role === "tool") {
      const resolvedName =
        (message.tool_call_id ? toolCallNames.get(message.tool_call_id) : undefined) ??
        message.toolName ??
        "unknown";
      const converted = contentParts(message.content, vision);
      const images = converted.filter((part) => part.inlineData);
      const output = converted.flatMap((part) => part.text === undefined ? [] : [part.text]).join("\n");
      const part: GooglePart = {
        functionResponse: {
          // The protocol identifies a result by the tool's name, not by the id
          // the call carried, so the name has to travel with the result.
          name: resolvedName,
          response: { output: output || (images.length > 0 ? "(see attached image)" : "") },
          ...(nestedImages && images.length > 0 ? { parts: images } : {}),
          ...(message.tool_call_id && (!nativeCallIds.has(message.tool_call_id) || nativeCallIds.get(message.tool_call_id))
            ? { id: nativeCallIds.get(message.tool_call_id) ?? message.tool_call_id } : {}),
        },
      };
      const previous = contents[contents.length - 1];
      if (previous?.role === "user" && previous.parts.some((existing) => existing.functionResponse)) {
        contents[contents.length - 1] = { role: "user", parts: [...previous.parts, part] };
      } else {
        contents.push({ role: "user", parts: [part] });
      }
      // Defer image turns until all parallel function responses have been grouped.
      if (!nestedImages && images.length > 0) pendingImages.push({ text: `Tool result image (${resolvedName}):` }, ...images);
      continue;
    }

    if (message.role === "user") {
      const parts = contentParts(message.content, vision);
      if (parts.length > 0) contents.push({ role: "user", parts });
      continue;
    }

    const native = replayGoogle(message, provider, model, binding);
    if (native) {
      for (const call of message.tool_calls ?? []) toolCallNames.set(call.id, call.function.name);
      let index = 0;
      for (const part of native) if (part.functionCall) {
        nativeCallIds.set(message.tool_calls![index++]!.id, part.functionCall.id);
      }
      contents.push({ role: 'model', parts: native }); continue;
    }
    const parts: GooglePart[] = [];
    if (message.reasoning?.text) {
      // The signature goes back with the text it covers, in the same part. A
      // signed block that is moved or dropped leaves the model unable to pick up
      // its own reasoning.
      parts.push({
        text: message.reasoning.text,
        thought: true,
        ...(legacyGoogleSignature(message, provider, model, binding) ? { thoughtSignature: message.reasoning.signature } : {}),
      });
    }
    const text = textOf(message.content);
    if (text) parts.push({ text });
    for (const call of message.tool_calls ?? []) {
      toolCallNames.set(call.id, call.function.name);
      nativeCallIds.delete(call.id);
      parts.push({
        functionCall: {
          name: call.function.name,
          args: parseArguments(call.function.arguments),
          id: call.id,
        },
      });
    }
    if (parts.length > 0) contents.push({ role: "model", parts });
  }
  flushImages();
  return contents;
}

/** The tool declarations, in the shape both endpoints take. */
export function convertTools(
  tools: ReadonlyArray<{ readonly type: string; readonly function: { readonly name: string; readonly description?: string; readonly parameters: Record<string, unknown> } }>,
): { readonly functionDeclarations: readonly Record<string, unknown>[] }[] | undefined {
  if (tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description ?? "",
        // The shape the API reads is a JSON Schema under `parameters`.
        parameters: tool.function.parameters,
      })),
    },
  ];
}

/** Visible summaries can be requested while the provider retains its thinking budget. */
export function thinkingConfigFor(budgetTokens: number | undefined, summary?: boolean): Record<string, unknown> | undefined {
  if (budgetTokens === undefined && summary !== true) return undefined;
  return { thinkingConfig: {
    ...(budgetTokens !== undefined ? { thinkingBudget: budgetTokens } : {}),
    includeThoughts: summary ?? true,
  } };
}

/** A response's chunks, as the protocol frames them. */
export interface Chunk {
  readonly candidates?: readonly {
    readonly content?: GoogleContent;
    readonly finishReason?: string;
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly cachedContentTokenCount?: number;
    readonly thoughtsTokenCount?: number;
    readonly totalTokenCount?: number;
  };
  readonly promptFeedback?: { readonly blockReason?: string; readonly blockReasonMessage?: string };
}

/**
 * Map a Google finishReason into the stop reason the turn layer expects.
 *
 * `MAX_TOKENS` is the one reason that means "truncated, ask for less": every
 * other value the API sends — `SAFETY`, `RECITATION`, `BLOCKLIST`,
 * `PROHIBITED_CONTENT`, `SPII`, `IMAGE_SAFETY`, `MALFORMED_FUNCTION_CALL` and
 * the rest — means the provider refused to produce the answer, which is an
 * error rather than a finished one. Unknown values take the same branch: a
 * reason this code has never heard of is not a reason to claim the answer is
 * complete.
 */
export function mapGoogleFinishReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  if (reason === "STOP") return "stop";
  if (reason === "MAX_TOKENS") return "length";
  // Preserve refusal vocabulary for the shared retry and guidance classifier.
  // Unknown and malformed-call reasons remain errors without claiming safety.
  if (["SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"].includes(reason)) {
    return reason === "BLOCKLIST" || reason === "SPII" || reason === "IMAGE_SAFETY" ? "safety" : reason.toLowerCase();
  }
  return "error";
}

/** Extract tool calls from parts in the same shape both stream and body readers produce. */
/** The answer out of a non-streamed response. */
export function readGoogleBody(body: unknown): CompletedBody {
  const candidate = (body as Chunk)?.candidates?.[0];
  const usage = googleUsage((body as Chunk)?.usageMetadata);
  const parts = googleOutput(candidate?.content?.parts ?? []);
  const projected = googleProjection(parts ?? []);
  const finish_reason = mapGoogleFinishReason((body as Chunk)?.promptFeedback?.blockReason ?? candidate?.finishReason);
  const valid = validGoogleFrame(body) && !!parts;
  const complete = valid && finish_reason === 'stop';
  const signature = complete ? googleSignature(parts) : undefined;
  return {
    ...(usage ? { usage } : {}),
    reasoning: projected.reasoning,
    ...(signature ? { reasoningSignature: signature } : {}),
    choices: [
      {
        message: {
          content: projected.text,
          ...(complete && projected.calls.length > 0
            ? {
                tool_calls: projected.calls,
              }
            : {}),
        },
        finish_reason: valid ? finish_reason ?? 'error' : 'error',
      },
    ],
  };
}

/**
 * Reading the answer.
 *
 * Each event is a JSON document carrying one step of the response, and the parts
 * accumulate: text and reasoning arrive as fragments, and a tool call arrives
 * whole. A part's `thoughtSignature` is attached to the reasoning it signs and
 * travels back with it.
 */
export async function* readGoogleStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamFragment, StreamedCompletion, undefined> {
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let reasoning = "";
  const output = createGoogleOutput();
  let malformed = false;
  let finishReason: string | undefined;
  let usage: StreamedCompletion["usage"];
  let blocked: string | undefined;
  // Async iteration releases the body when the consumer stops after a fragment.
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });

    for (;;) {
      const boundary = findEventBoundary(buffer);
      if (!boundary) break;
      const raw = buffer.slice(0, boundary.at);
      buffer = buffer.slice(boundary.at + boundary.width);
      const payload = dataOf(raw);
      if (payload === undefined) continue;

      let parsed: Chunk;
      try {
        const value: unknown = JSON.parse(payload);
        if (!validGoogleFrame(value)) { malformed = true; continue; }
        parsed = value as Chunk;
      } catch {
        // A partial or malformed event is skipped rather than failing the stream;
        // the alternative turns one bad frame into no answer at all.
        malformed = true; continue;
      }
      if (parsed.promptFeedback?.blockReason) {
        blocked = parsed.promptFeedback.blockReasonMessage ?? parsed.promptFeedback.blockReason;
        continue;
      }

      const candidate = parsed.candidates?.[0];
      if (finishReason !== undefined && candidate?.content?.parts?.length) { malformed = true; continue; }
      if (candidate?.finishReason && (finishReason === undefined || finishReason === 'stop')) finishReason = mapGoogleFinishReason(candidate.finishReason);
      if (parsed.usageMetadata) {
        usage = googleUsage(parsed.usageMetadata);
      }

      const parts = googleOutput(candidate?.content?.parts ?? []);
      if (!parts) { malformed = true; continue; }
      if (!appendGoogleOutput(output, parts)) malformed = true;
      for (const part of candidate?.content?.parts ?? []) {
        if (part.functionCall) continue;
        if (!part.text) continue;
        if (part.thought) {
          reasoning += part.text;
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

  // A host that closes without a blank line after its last event leaves it in
  // the buffer. Dropping it costs whatever that event carried, which on a short
  // answer is the answer — the same tail the OpenAI-compatible reader flushes.
  buffer += decoder.decode();
  if (buffer.trim().length > 0) {
    const payload = dataOf(buffer);
    if (payload !== undefined) {
      try {
        const value: unknown = JSON.parse(payload);
        if (!validGoogleFrame(value)) throw new Error('Malformed Google response frame.');
        const parsed = value as Chunk;
        if (parsed.promptFeedback?.blockReason) {
          throw new Error(
            `The provider refused the prompt: ${parsed.promptFeedback.blockReasonMessage ?? parsed.promptFeedback.blockReason}`,
          );
        }
        const candidate = parsed.candidates?.[0];
        if (finishReason !== undefined && candidate?.content?.parts?.length) throw new Error('Content arrived after Google completion.');
        if (candidate?.finishReason && (finishReason === undefined || finishReason === 'stop')) finishReason = mapGoogleFinishReason(candidate.finishReason);
        if (parsed.usageMetadata) {
          usage = googleUsage(parsed.usageMetadata);
        }
        const parts = googleOutput(candidate?.content?.parts ?? []);
        if (!parts) throw new Error('Malformed Google model output.');
        if (!appendGoogleOutput(output, parts)) malformed = true;
        for (const part of candidate?.content?.parts ?? []) {
          if (part.functionCall) continue;
          if (!part.text) continue;
          if (part.thought) {
            reasoning += part.text;
            yield { kind: "reasoning", text: part.text };
          } else {
            text += part.text;
            yield { kind: "text", text: part.text };
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("The provider refused")) throw error;
        malformed = true;
      }
    }
  }

  if (finishReason === undefined) {
    throw new Error("Provider stream ended before it reported the message was complete");
  }

  const valid = googleOutput(output.parts);
  const complete = !malformed && !!valid && finishReason === 'stop';
  const projected = googleProjection(output.parts);
  const reasoningSignature = complete ? googleSignature(output.parts) : undefined;
  return {
    message: {
      role: "assistant",
      content: text,
      ...(complete && projected.calls.length > 0
        ? {
            tool_calls: projected.calls,
          }
        : {}),
    },
    reasoning,
    ...(reasoningSignature ? { reasoningSignature } : {}),
    finishReason: malformed || !valid ? 'error' : finishReason,
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
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  return data === "" ? undefined : data;
}


/** The request body, shared with the other Google endpoint. */
export function googleBody(input: {
  readonly model: string;
  readonly provider?: string;
  readonly replayBinding?: string;
  readonly vision?: boolean;
  readonly systemPrompt: string;
  readonly messages: readonly Parameters<typeof convertContents>[0][number][];
  readonly tools: Parameters<typeof convertTools>[0];
  readonly allowTools: boolean;
  readonly temperature?: number;
  /** Absent means the model takes one; see `supportsTemperature` in kinds. */
  readonly supportsTemperature?: boolean;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly thinkingBudgetTokens?: number;
  readonly reasoningSummary?: boolean;
}): GoogleRequestBody {
  const tools = input.allowTools ? convertTools(input.tools) : undefined;
  return {
    contents: convertContents(input.messages, input.model, input.vision ?? false, input.provider, input.replayBinding),
    ...(input.systemPrompt.trim() !== ""
      ? { systemInstruction: { parts: [{ text: input.systemPrompt }] } }
      : {}),
    generationConfig: {
      // Gated the way the other protocols gate it: a model that rejects a
      // sampling temperature rejects the whole request, and the caller that
      // declared it unsupported gets a request without one.
      ...(input.supportsTemperature !== false && input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(thinkingConfigFor(input.thinkingBudgetTokens, input.reasoningSummary) ?? {}),
    },
    ...(tools ? { tools } : {}),
    // Stated rather than left to the provider: the caller decides whether this
    // turn may call a tool, and a mode the provider chose would be that decision
    // made somewhere else.
    ...(tools ? { toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}),
  };
}

/** Keep the captured prefix and all sampling fields while bounding refresh output. */
export function googleRefreshBody(body: Record<string, unknown>, model: { readonly reasoning?: boolean }): Record<string, unknown> | undefined {
  const config = body.generationConfig as Record<string, unknown> | undefined;
  const thinking = config?.thinkingConfig as { thinkingBudget?: number } | undefined;
  if (thinking?.thinkingBudget !== 0 && (thinking?.thinkingBudget !== undefined || model.reasoning !== false)) return undefined;
  return { ...body, generationConfig: { ...config, maxOutputTokens: 1 } };
}

/** Input includes cache reads; output includes separately reported thinking. */
function googleUsage(usage: Chunk["usageMetadata"]): CompletedBody["usage"] {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.promptTokenCount,
    completion_tokens: usage.candidatesTokenCount === undefined && usage.thoughtsTokenCount === undefined
      ? undefined : (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    metering_output_complete: usage.candidatesTokenCount !== undefined && usage.thoughtsTokenCount !== undefined,
    prompt_tokens_details: { cached_tokens: usage.cachedContentTokenCount },
    ...(usage.totalTokenCount !== undefined ? { total_tokens: usage.totalTokenCount } : {}),
  };
}
