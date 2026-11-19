import {
  extractFileFootprint,
  formatFileFootprintXml,
  mergeFileFootprints,
  parseFileFootprintXml,
} from "./fileFootprint.js";
import {
  EIGHT_SECTION_COMPACTION_PROMPT,
  UPDATE_COMPACTION_PROMPT,
  formatCheckpointMessage,
  parseCompactedSummary,
} from "./summarizer.js";
import { endpointBody, endpointKind, endpointUrl, type EndpointKind } from "../../../provider/endpoints/index.js";
import type { SimpleRequest } from '../../../provider/endpoints/kinds.js';
import { endpointShape } from '../../../provider/endpoints/index.js';
import { prepareRequestAttempt } from '../../../provider/request/attempt.js';
import type { ModelTransport, RequestPolicy } from '../../agent/request/model.js';
import type { ResolvedRequestShape } from '../../models/requestShape.js';
import { promptTokensFor, requestBudget } from '../../../context/request/budget.js';
import type { ProviderUsage } from '../../../turn/completion.js';
import { SummaryAdmissionError, type CompactionDispatch, type PreparedSummaryStep } from '../../../session/compaction/contract.js';
import { readCompletion } from '../../../provider/response/read.js';
import { createHash } from 'node:crypto';
import { snapshotData } from '../../values/data.js';
import { assertRequestInput, requestInputLimits } from '../../../provider/request/input.js';

/**
 * One summarization request.
 *
 * Both the in-loop overflow recovery and the explicit `/compact` command need
 * the same thing: the conversation so far condensed into one checkpoint message
 * the model can continue from. Asking the provider is done here, once, so the
 * two paths cannot drift in prompt, parsing, or footprint handling.
 */

export interface CompactionProvider {
  readonly sessionId?: string;
  readonly cacheRetention?: 'short' | 'long' | 'none';
  readonly supportsPromptCacheKey?: boolean;
  readonly supportsLongCacheRetention?: boolean;
  readonly supportsExplicitPromptCacheMode?: boolean;
  readonly serviceTier?: string;
  readonly shape?: ResolvedRequestShape;
  readonly contextWindow?: number;
  readonly inputLimit?: number;
  readonly maxOutputTokens?: number;
  readonly reserveTokens?: number;
  readonly providerId?: string;
  readonly replayBinding?: string;
  /** Which stored credential sends this summary; non-secret and rotation-sensitive. */
  readonly credentialId?: string;
  readonly credentialGeneration?: string;
  readonly baseUrl: string;
  /**
   * Headers this summarization authenticates with.
   *
   * The same shape the main request uses, for the same reason: a credential that
   * carries an account token rather than an API key has to be able to reach this
   * request too. Built by `providerAuthorization` at the wiring site.
   */
  readonly headers: Readonly<Record<string, string>>;
  readonly model: string;
  /**
   * Whether this model accepts a sampling temperature.
   *
   * Absent means it does, which is what every model got before the catalogue
   * could say otherwise. The compaction request carries no temperature of its
   * own, but the protocols gate on this flag, and a summarizer that cannot say
   * it is a model that rejects one would send a field the host refuses.
   */
  readonly supportsTemperature?: boolean;
  /**
   * Which endpoint kind this request goes to.
   *
   * Absent means the default one. Summarizing is a model call like any other, so
   * it has to speak whatever the run speaks — posting the default shape to an
   * endpoint that wants another fails a compaction that had nothing wrong with
   * it.
   */
  readonly endpoint?: EndpointKind;
}

/**
 * A message the summarizer sends.
 *
 * Tool activity stays structural for a model that accepts tool messages, so the
 * summarizer reads what ran and what came back. A model the catalogue marks as
 * taking none cannot receive that form at all, so the same activity is written
 * out as text instead; see `proseToolHistory`.
 */
export interface CompactionChatMessage {
  readonly tool_calls?: readonly import('../../../turn/prompt.js').ChatToolCall[];
  readonly role: "system" | "user" | "assistant" | "tool";
  /**
   * Text only, deliberately.
   *
   * The summariser condenses a conversation into words, and it is given the text
   * of it. Carrying images here would mean the summary model receiving pictures
   * it was never asked to describe, so callers pass `messageToText` and this
   * stays a string.
   */
  readonly content?: string | null;
  readonly tool_call_id?: string;
}

export interface CompactionRequest {
  readonly dispatch?: CompactionDispatch;
  /** Report billing before summary validation or a budget breach can reject the result. */
  readonly onUsage?: (usage: ProviderUsage | undefined) => void;
  readonly requestPolicy?: RequestPolicy;
  readonly modelTransport?: ModelTransport;
  readonly maxOutputTokens?: number;
  readonly purpose?: 'compaction' | 'turn-summary' | 'branch-summary';
  readonly provider: CompactionProvider;
  /**
   * The fetch to send with.
   *
   * Compaction issues its own model call, so it needs the same deadlines and
   * transport as the main request: a summarization that hangs is as fatal to a
   * turn as an answer that hangs, and it is the harder one to notice because the
   * conversation looks idle rather than broken.
   *
   * Required, and deliberately not defaulting to the global `fetch`. It was
   * optional with that fallback, which is how one of the three callers kept the
   * unbounded transport: the omission compiled and ran, and nothing pointed at
   * it. A caller that must pass one cannot leave a model request without a
   * deadline by accident.
   */
  readonly fetchImpl: typeof fetch;
  /** The messages to condense, in order. */
  readonly messages: readonly CompactionChatMessage[];
  readonly signal?: AbortSignal;
  /** What the user asked the summary to pay attention to, if anything. */
  readonly instructions?: string;
  /** Which summary to ask for; defaults to the full checkpoint prompt. */
  readonly prompt?: string;
  /**
   * A sampling temperature for the summarization, when the caller has one.
   *
   * Gated by the provider's `supportsTemperature`, the same gate the main
   * request uses: a model that rejects the field gets a request without it
   * rather than a 400.
   */
  readonly temperature?: number;
  /**
   * The checkpoint the messages already begin with, when a previous compaction
   * wrote one.
   *
   * Present means the messages are additions to that checkpoint rather than a
   * conversation to summarize from scratch, so the summary asked for is a
   * revision of it. Supplying it here rather than letting the caller pick a
   * prompt keeps the choice of prompt and the shape of the request together.
   */
  readonly previousSummary?: string;
}

/** Pure preflight uses the same complete messages as the eventual summary send. */
export function prepareCompactionMessages(request: Pick<CompactionRequest, 'messages' | 'previousSummary' | 'instructions' | 'prompt' | 'maxOutputTokens'> & {
  readonly provider: Pick<CompactionProvider, 'contextWindow' | 'inputLimit' | 'maxOutputTokens' | 'reserveTokens' | 'shape'>;
}): readonly CompactionChatMessage[] {
  const previousSummary = request.previousSummary?.trim();
  // Revising a checkpoint and summarizing from scratch are different questions,
  // so the default prompt follows which one is being asked. An explicit prompt
  // still wins: the caller knows if it wants something else entirely.
  const base = request.prompt ?? (previousSummary ? UPDATE_COMPACTION_PROMPT : EIGHT_SECTION_COMPACTION_PROMPT);
  const prompt = request.instructions?.trim()
    ? `${base}\n\nThe user asked the summary to focus on: ${request.instructions.trim()}`
    : base;
  const capturedHistory = summaryMessages(request.messages);
  const history = request.provider.shape?.toolCalling === false
    ? proseToolHistory(capturedHistory) : capturedHistory;
  const messages = [
    ...(previousSummary ? [{ role: 'user' as const, content: `<previous-summary>\n${previousSummary}\n</previous-summary>` }] : []),
    ...history, { role: 'user' as const, content: prompt },
  ];
  const maxOutputTokens = request.provider.maxOutputTokens ?? request.maxOutputTokens;
  if (request.provider.contextWindow !== undefined || request.provider.inputLimit !== undefined) {
    const budget = requestBudget({ window: request.provider.contextWindow, inputLimit: request.provider.inputLimit,
      outputTokens: maxOutputTokens,
      reserveTokens: request.provider.reserveTokens, promptTokens: promptTokensFor({ messages: messages.map(message => ({ ...message, content: message.content ?? '' })) }).tokens, measured: false });
    if (budget.ok === false && budget.reason !== 'unknown') throw new SummaryAdmissionError(`Summary request refused: ${budget.detail}`);
  }
  return messages;
}

/** Auxiliary endpoint codecs carry text system instructions outside conversation. */
function summaryMessages(messages: readonly CompactionChatMessage[]): readonly CompactionChatMessage[] {
  const system: string[] = [];
  const history: CompactionChatMessage[] = [];
  for (const message of messages) {
    if (message.content !== undefined && message.content !== null && typeof message.content !== 'string') {
      throw new SummaryAdmissionError('Summary request refused: only text messages can be summarized.');
    }
    if (message.role === 'system') {
      if (message.content) system.push(message.content);
    } else history.push(message);
  }
  return system.length ? [{ role: 'system', content: system.join('\n\n') }, ...history] : history;
}

/**
 * The same conversation with tool activity written out as prose.
 *
 * A model the catalogue marks as taking no tool messages still has to read what
 * ran and what came back, or the checkpoint loses the very work it condenses.
 * Writing the call and its result as text is what the summary prompt already
 * asks for, and it is the only form such a model accepts. Consecutive user
 * statements are merged because the call/result pairing that justified separate
 * turns no longer exists once the structure is gone.
 */
function proseToolHistory(messages: readonly CompactionChatMessage[]): CompactionChatMessage[] {
  const projected: CompactionChatMessage[] = [];
  const appendUser = (content: string): void => {
    const previous = projected[projected.length - 1];
    if (previous?.role === 'user') projected[projected.length - 1] = { role: 'user', content: [previous.content, content].filter(Boolean).join('\n\n') };
    else projected.push({ role: 'user', content });
  };
  for (const message of messages) {
    if (message.role === 'tool') {
      appendUser(`[tool result${message.tool_call_id ? ` ${message.tool_call_id}` : ''}]\n${message.content ?? ''}`);
      continue;
    }
    if (message.tool_calls?.length) {
      const calls = message.tool_calls.map(call => `[tool call${call.id ? ` ${call.id}` : ''}] ${call.function.name} ${call.function.arguments}`);
      projected.push({ role: 'assistant', content: [message.content, ...calls].filter(Boolean).join('\n') });
      continue;
    }
    if (message.role === 'user') { appendUser(message.content ?? ''); continue; }
    projected.push(message);
  }
  return projected;
}

/** Capture and admit one exact summary request before any durable claim or send. */
export function prepareCompactionRequest(request: CompactionRequest): PreparedSummaryStep {
  request.signal?.throwIfAborted();
  let data: { readonly provider: Omit<CompactionProvider, 'headers'>; readonly messages: readonly CompactionChatMessage[] };
  try {
    const provider: Omit<CompactionProvider, 'headers'> = {
      baseUrl: request.provider.baseUrl, model: request.provider.model, providerId: request.provider.providerId,
      endpoint: request.provider.endpoint, replayBinding: request.provider.replayBinding,
      credentialId: request.provider.credentialId, credentialGeneration: request.provider.credentialGeneration,
      shape: request.provider.shape, serviceTier: request.provider.serviceTier,
      sessionId: request.provider.sessionId, cacheRetention: request.provider.cacheRetention,
      supportsPromptCacheKey: request.provider.supportsPromptCacheKey ?? request.provider.shape?.promptCacheKey,
      supportsLongCacheRetention: request.provider.supportsLongCacheRetention ?? request.provider.shape?.supportsLongCacheRetention,
      supportsExplicitPromptCacheMode: request.provider.supportsExplicitPromptCacheMode ?? request.provider.shape?.supportsExplicitPromptCacheMode,
      contextWindow: request.provider.contextWindow, inputLimit: request.provider.inputLimit,
      maxOutputTokens: request.provider.maxOutputTokens, reserveTokens: request.provider.reserveTokens,
      supportsTemperature: request.provider.supportsTemperature,
    };
    data = snapshotData({ provider, messages: request.messages },
      { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 48 }) as unknown as typeof data;
  } catch { throw new SummaryAdmissionError('Summary request refused: messages and request shape must be bounded inert data.'); }
  const headers = new Headers(request.provider.headers);
  const captured = Object.freeze({ ...request,
    provider: Object.freeze({ ...data.provider, headers: Object.freeze(Object.fromEntries(headers)) }), messages: data.messages });
  const messages = prepareCompactionMessages(captured);
  const history = captured.provider.shape?.toolCalling === false ? proseToolHistory(summaryMessages(captured.messages))
    : summaryMessages(captured.messages);
  const tokens = promptTokensFor({ messages: history.map(message => ({ ...message, content: message.content ?? '' })) }).tokens;
  const kind = endpointKind(captured.provider.endpoint) ?? 'openai-compatible';
  headers.set('accept', endpointShape(kind).simpleResponse === 'stream' ? 'text/event-stream' : 'application/json');
  const maxOutputTokens = captured.provider.maxOutputTokens ?? captured.maxOutputTokens;
  const bodyInput: SimpleRequest = {
    ...captured.provider.shape,
    model: captured.provider.model,
    baseUrl: captured.provider.baseUrl,
    sessionId: captured.provider.sessionId,
    cacheRetention: captured.provider.cacheRetention,
    supportsPromptCacheKey: captured.provider.supportsPromptCacheKey,
    supportsLongCacheRetention: captured.provider.supportsLongCacheRetention,
    supportsExplicitPromptCacheMode: captured.provider.supportsExplicitPromptCacheMode,
    provider: captured.provider.providerId,
    replayBinding: captured.provider.replayBinding,
    serviceTier: captured.provider.serviceTier,
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(captured.provider.supportsTemperature !== undefined ? { supportsTemperature: captured.provider.supportsTemperature } : {}),
    ...(captured.temperature !== undefined ? { temperature: captured.temperature } : {}),
    systemPrompt: messages.filter(message => message.role === 'system').map(message => message.content ?? '').join('\n\n'),
    messages: messages.filter(message => message.role !== 'system'),
  };
  for (const [name, value] of Object.entries(endpointShape(kind).requestHeaders?.(bodyInput) ?? {})) headers.set(name, value);
  const body = JSON.stringify(endpointBody(kind, bodyInput));
  try { assertRequestInput(body, endpointShape(kind).contextFields, requestInputLimits(captured.provider.shape?.inputLimits)); }
  catch { throw new SummaryAdmissionError('Summary request refused: the complete input exceeds the selected model limits.'); }
  const url = endpointUrl(captured.provider.baseUrl, kind, captured.provider.model, false);
  const identity = createHash('sha256').update(JSON.stringify([
    'prepared-summary-v1', createHash('sha256').update(url).digest('hex'),
    createHash('sha256').update(body).digest('hex'), captured.provider.providerId ?? '', captured.provider.model, kind,
    captured.provider.replayBinding ?? '', captured.provider.credentialId ?? '', captured.provider.credentialGeneration ?? '',
    captured.provider.sessionId, captured.provider.cacheRetention, captured.provider.supportsPromptCacheKey,
    captured.provider.supportsLongCacheRetention, captured.provider.supportsExplicitPromptCacheMode,
    captured.provider.shape, captured.provider.contextWindow, captured.provider.inputLimit,
    captured.provider.reserveTokens, maxOutputTokens, captured.purpose ?? 'compaction',
  ])).digest('hex');
  captured.signal?.throwIfAborted();
  let consumed = false;
  return Object.freeze({ identity, tokens, send: async (dispatch?: CompactionDispatch) => {
    if (consumed) throw new Error('The prepared summary request has already been consumed.');
    captured.signal?.throwIfAborted();
    consumed = true;
    return sendCompactionRequest(captured, { body, headers, kind, url }, dispatch);
  } });
}

/** The checkpoint replacing history, or nothing when the provider cannot summarize it. */
export async function requestCompactionSummary(request: CompactionRequest): Promise<string | undefined> {
  return prepareCompactionRequest(request).send(request.dispatch);
}

async function sendCompactionRequest(request: CompactionRequest,
  capture: { readonly body: string; readonly headers: Headers; readonly kind: EndpointKind; readonly url: string },
  dispatch?: CompactionDispatch): Promise<string | undefined> {
  const previousSummary = request.previousSummary?.trim();
  const fetchImpl = request.fetchImpl;
  const { body, headers, kind, url } = capture;
  const attempt = await prepareRequestAttempt({ body, provider: request.provider.providerId ?? '', model: request.provider.model,
    endpoint: kind ?? 'openai-compatible', purpose: request.purpose ?? 'compaction', policy: request.requestPolicy,
    inputLimits: request.provider.shape?.inputLimits,
    ...(request.provider.credentialId && request.provider.credentialGeneration
      ? { credential: { credentialId: request.provider.credentialId, generation: request.provider.credentialGeneration } } : {}) });
  const transport: ModelTransport | undefined = dispatch ? (input, init, beforeDispatch) => {
    const handoff = (): void => { dispatch.checkAdmission?.(); beforeDispatch(); dispatch.dispatch(); };
    if (request.modelTransport) return request.modelTransport(input, init, handoff);
    handoff();
    return fetchImpl(input, init);
  } : request.modelTransport;
  const res = await attempt.send(url, {
    method: "POST",
    headers,
    body,
    signal: request.signal,
  }, fetchImpl, transport);
  if (!res.ok) { attempt.settle(); return undefined; }
  const completion = await readCompletion(kind, res);
  request.onUsage?.(completion.usage);
  attempt.settle(completion.usage);
  if (['error', 'length', 'refusal', 'content_filter'].includes(completion.choices?.[0]?.finish_reason ?? '')) return undefined;
  const summaryContent = completion.choices?.[0]?.message?.content;
  if (!summaryContent) return undefined;
  const { rawSummary } = parseCompactedSummary(summaryContent);
  // The previous checkpoint's own footprint is merged in, so a file read before
  // an earlier compaction is still named after this one. Without it the list
  // only ever describes the messages in front of the summarizer, and the model
  // re-reads files it has already seen — which is the cost this list exists to
  // avoid.
  const footprint = mergeFileFootprints(
    parseFileFootprintXml(previousSummary),
    extractFileFootprint(request.messages),
  );
  return formatCheckpointMessage(rawSummary, formatFileFootprintXml(footprint));
}
