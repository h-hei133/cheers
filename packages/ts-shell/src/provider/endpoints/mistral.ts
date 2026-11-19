import { createHash } from "node:crypto";
import { isRecord } from "../../core/values/record.js";
import { readCompletionStream, type CompletedBody } from "../../turn/completion.js";
import { providerResponseError } from '../response/error.js';
import { declareEndpoint, endpointShape, type EndpointShape, type SimpleRequest } from "./kinds.js";
import { compatibleBody, compatibleTurnBody } from './openaiCompatible.js';
import { projectContent, readContent } from './mistral/content.js';
import { captureReplay, replayContent } from './mistral/replay.js';

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

const baseShape = (): ReturnType<typeof endpointShape> => endpointShape("openai-compatible");

function readBody(body: unknown): CompletedBody {
  if (isRecord(body) && body.error != null) throw providerResponseError(body.error);
  const decoded = baseShape().readBody(body);
  const { choices: rawChoices, usage } = decoded;
  if (!Array.isArray(rawChoices)) return { usage };
  let reasoning = decoded.reasoning;
  let reasoningSignature: string | undefined;
  const choices = rawChoices.map((choice: NonNullable<CompletedBody['choices']>[number], index) => {
    const message = choice?.message;
    const finish = choice?.finish_reason === 'model_length' ? 'length' : choice?.finish_reason;
    if (!Array.isArray(message?.content)) return finish === choice?.finish_reason ? choice : { ...choice, finish_reason: finish };
    const projected = projectContent(message.content);
    if (index === 0) {
      reasoning = projected.reasoning || reasoning;
      const { role, prefix } = message as Record<string, unknown>;
      if ((finish === 'stop' || finish === 'tool_calls')
        && (role === undefined || role === 'assistant')
        && (prefix === undefined || prefix === false)
        && projected.reasoning === (reasoning ?? '')) {
        reasoningSignature = captureReplay(message.content, message.tool_calls);
      }
    }
    return { ...choice, message: { ...message, content: projected.text }, finish_reason: finish };
  });
  return { choices, usage, reasoning, ...(reasoningSignature ? { reasoningSignature } : {}) };
}

const chatShape: EndpointShape = {
  usageInput: 'inclusive',
  opaqueReplay: true,
  contextFields: { conversation: "messages", tools: "tools", firstMessageIsSystem: true },
  path: () => "/chat/completions",
  modelsPath: "/models",
  headers: (apiKey) => ({ ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }),
  requestHeaders: (input): Record<string, string> => {
    if (input.cacheRetention === "none") return {};
    const affinity = sanitizeAffinity(input.sessionId);
    return affinity ? { "x-affinity": affinity } : {};
  },
  body: (input) => normalizeMistralPayload(compatibleBody(input, replayContent), input),
  turnBody: (input) => normalizeMistralPayload(compatibleTurnBody(input, replayContent), input),
  refreshBody: (body, model) => baseShape().refreshBody?.(body, model),
  readBody,
  readStream: (body, observe) => readCompletionStream(body, readContent, observe),
};

declareEndpoint("mistral-chat-completions", chatShape);
// Retain configurations using the earlier endpoint name.
declareEndpoint("mistral-conversations", chatShape);
