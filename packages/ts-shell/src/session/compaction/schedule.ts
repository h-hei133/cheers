import type { AgentMessage } from '../../core/agent/state.js';
import { estimateTokens } from '../context.js';
import { SummaryAdmissionError, type PreparedSummaryStep } from './contract.js';
import { clampToolResults } from './projection.js';

export const MAX_SEGMENTS = 64;
export const MAX_SEGMENT_MESSAGES = 512;
export const DEFAULT_SEGMENT_TOKENS = 16_000;

/** Boundaries close every tool call; neither a segment nor a tail starts on a result. */
export function legalUnits(messages: readonly AgentMessage[]): readonly (readonly AgentMessage[])[] {
  const units: AgentMessage[][] = [];
  const open = new Set<string>();
  const seen = new Set<string>();
  let unit: AgentMessage[] = [];
  for (const message of messages) {
    if (message.role === 'tool' && (!message.tool_call_id || !open.has(message.tool_call_id))) {
      throw new SummaryAdmissionError('Summary request refused: a tool result has no call in its segment.');
    }
    unit.push(message);
    for (const call of message.tool_calls ?? []) {
      if (!call.id || seen.has(call.id)) throw new SummaryAdmissionError('Summary request refused: tool call IDs are missing or repeated.');
      seen.add(call.id);
      open.add(call.id);
    }
    if (message.tool_call_id) open.delete(message.tool_call_id);
    if (!open.size) { units.push(unit); unit = []; }
  }
  if (unit.length) throw new SummaryAdmissionError('Summary request refused: a tool call is unresolved.');
  return units;
}

export interface ScheduledSegment {
  readonly messages: readonly AgentMessage[];
  readonly prepared?: PreparedSummaryStep;
}

/** Preparation precedes claims; accepted captures stay attached to their legal group. */
export async function scheduleSegments(input: {
  readonly messages: readonly AgentMessage[];
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
  /** Summary merge material must fit as one complete request. */
  readonly indivisible?: boolean;
  readonly validate?: (messages: readonly AgentMessage[], index: number) => void | Promise<void>;
  readonly prepare?: (messages: readonly AgentMessage[], index: number) => Promise<PreparedSummaryStep>;
}): Promise<readonly ScheduledSegment[]> {
  input.signal?.throwIfAborted();
  const maxTokens = input.maxTokens ?? DEFAULT_SEGMENT_TOKENS;
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) throw new Error('Summary segment budget is invalid.');
  const admit = async (messages: readonly AgentMessage[], index: number): Promise<ScheduledSegment | undefined> => {
    input.signal?.throwIfAborted();
    if (messages.length > MAX_SEGMENT_MESSAGES || (!input.prepare && estimateTokens(messages) > maxTokens)) return undefined;
    try {
      const prepared = await input.prepare?.(messages, index);
      input.signal?.throwIfAborted();
      if (input.prepare && (!prepared || typeof prepared.identity !== 'string' || !prepared.identity
        || !Number.isSafeInteger(prepared.tokens) || prepared.tokens < 0 || typeof prepared.send !== 'function')) {
        throw new Error('Summary preparation returned an invalid request identity or token count.');
      }
      if (prepared && prepared.tokens > maxTokens) return undefined;
      await input.validate?.(messages, index);
      input.signal?.throwIfAborted();
      return { messages, ...(prepared ? { prepared } : {}) };
    }
    catch (error) {
      input.signal?.throwIfAborted();
      if (error instanceof SummaryAdmissionError) return undefined;
      throw error;
    }
  };
  const segments: ScheduledSegment[] = [];
  let current: ScheduledSegment | undefined;
  const legal = legalUnits(input.messages);
  const units = input.indivisible && input.messages.length ? [input.messages] : legal;
  for (const unit of units) {
    const candidate = current ? [...current.messages, ...unit] : unit;
    const accepted = await admit(candidate, segments.length);
    if (accepted) { current = accepted; continue; }
    let projected: ScheduledSegment | undefined;
    if (current) {
      segments.push(current);
      if (segments.length >= MAX_SEGMENTS) throw new SummaryAdmissionError('Summary request refused: the bounded segment schedule is full.');
      projected = await admit(unit, segments.length);
    }
    projected ??= await clampToolResults(unit, maxTokens, messages => admit(messages, segments.length), input.signal);
    if (!projected) throw new SummaryAdmissionError('Summary request refused: a legal message group exceeds its segment budget.');
    current = projected;
  }
  if (current) segments.push(current);
  input.signal?.throwIfAborted();
  return segments;
}
