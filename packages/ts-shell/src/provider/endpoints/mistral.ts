import { createHash } from "node:crypto";
import { isRecord } from "../../core/values/record.js";
import { readCompletionStream, type CompletionContentFragment } from "../../turn/completion.js";
import { declareEndpoint, endpointShape, type EndpointShape, type SimpleRequest } from "./kinds.js";

/**
 * Mistral Chat Completions endpoint.
 *
 * Normalizes tool-call IDs to Mistral's 9-character `[a-zA-Z0-9]` requirement
 * deterministically without prefix collisions, and forwards `x-affinity` when
 * prompt caching is active.
 */

const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MISTRAL_ID_LENGTH = 9;
const AFFINITY_MAX_LENGTH = 128;

export function normalizeMistralToolCallId(id: string): string {
  if (/^[a-zA-Z0-9]{9}$/.test(id)) return id;
  const digest = createHash("sha256").update(id).digest();
  let result = "";
  for (let i = 0; i < MISTRAL_ID_LENGTH; i++) {
    result += BASE62_ALPHABET[digest[i]! % BASE62_ALPHABET.length]!;
  }
  return result;
}

function sanitizeAffinity(sessionId: string | undefined): string | undefined {
  if (!sessionId) return undefined;
  const cleaned = sessionId.replace(/[\r\n\x00-\x1f\x7f]/g, "").trim();
  if (!cleaned) return undefined;
  const chars = Array.from(cleaned);
  return chars.length <= AFFINITY_MAX_LENGTH ? cleaned : chars.slice(0, AFFINITY_MAX_LENGTH).join("");
}

function normalizeMistralPayload(body: Record<string, unknown>, input: Pick<SimpleRequest, "sessionId" | "cacheRetention">): Record<string, unknown> {
  // Usage is part of native Mistral frames; OpenAI's stream options and retention
  // field are not fields of this request protocol.
  const { stream_options: _streamOptions, prompt_cache_retention: _retention, prompt_cache_key: _cacheKey, ...payload } = body;
  const affinity = input.cacheRetention === "none" ? undefined : sanitizeAffinity(input.sessionId);
  if (affinity) payload.prompt_cache_key = affinity;
  if (!Array.isArray(body.messages)) return payload;
  const messages = body.messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const rec = msg as Record<string, unknown>;
    const toolCallId = typeof rec.tool_call_id === "string" ? normalizeMistralToolCallId(rec.tool_call_id) : undefined;
    const toolCalls = Array.isArray(rec.tool_calls)
      ? rec.tool_calls.map((tc) => {
          if (!tc || typeof tc !== "object") return tc;
          const call = tc as Record<string, unknown>;
          return typeof call.id === "string" ? { ...call, id: normalizeMistralToolCallId(call.id) } : call;
        })
      : undefined;
    return {
      ...rec,
      ...(toolCallId !== undefined ? { tool_call_id: toolCallId } : {}),
      ...(toolCalls !== undefined ? { tool_calls: toolCalls } : {}),
    };
  });
  return { ...payload, messages };
}

function readMistralContent(parts: readonly unknown[]): readonly CompletionContentFragment[] {
  const fragments: CompletionContentFragment[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      if (part) fragments.push({ kind: "text", text: part });
      continue;
    }
    if (!isRecord(part)) continue;
    if (part.type === "text" && typeof part.text === "string" && part.text) {
      fragments.push({ kind: "text", text: part.text });
    } else if (part.type === "thinking" && Array.isArray(part.thinking)) {
      let text = "";
      for (const segment of part.thinking) {
        if (isRecord(segment) && segment.type === "text" && typeof segment.text === "string") text += segment.text;
      }
      if (text) fragments.push({ kind: "reasoning", text });
    }
  }
  return fragments;
}

const baseShape = (): ReturnType<typeof endpointShape> => endpointShape("openai-compatible");

const chatShape: EndpointShape = {
  usageInput: 'inclusive',
  contextFields: { conversation: "messages", tools: "tools", firstMessageIsSystem: true },
  path: () => "/chat/completions",
  modelsPath: "/models",
  headers: (apiKey) => ({ ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }),
  requestHeaders: (input): Record<string, string> => {
    if (input.cacheRetention === "none") return {};
    const affinity = sanitizeAffinity(input.sessionId);
    return affinity ? { "x-affinity": affinity } : {};
  },
  body: (input) => normalizeMistralPayload(baseShape().body(input), input),
  turnBody: (input) => normalizeMistralPayload(baseShape().turnBody(input), input),
  refreshBody: (body, model) => baseShape().refreshBody?.(body, model),
  readBody: (body) => baseShape().readBody(body),
  readStream: (body, observe) => readCompletionStream(body, readMistralContent, observe),
};

declareEndpoint("mistral-chat-completions", chatShape);
// Retain configurations using the earlier endpoint name.
declareEndpoint("mistral-conversations", chatShape);
