import type { AgentMessage } from '../../core/agent/state.js';
import { estimateTokens } from '../context.js';
import { SummaryAdmissionError } from './contract.js';

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

/** Pure budget checks happen before any request claim. Oversized indivisible units refuse. */
export function scheduleSegments(input: {
  readonly messages: readonly AgentMessage[];
  readonly maxTokens?: number;
  readonly validate?: (messages: readonly AgentMessage[]) => void;
}): readonly (readonly AgentMessage[])[] {
  const maxTokens = input.maxTokens ?? DEFAULT_SEGMENT_TOKENS;
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) throw new Error('Summary segment budget is invalid.');
  const fits = (messages: readonly AgentMessage[]): boolean => {
    if (messages.length > MAX_SEGMENT_MESSAGES || estimateTokens(messages) > maxTokens) return false;
    try { input.validate?.(messages); return true; } catch { return false; }
  };
  const segments: AgentMessage[][] = [];
  let current: AgentMessage[] = [];
  for (const unit of legalUnits(input.messages)) {
    const candidate = [...current, ...unit];
    if (fits(candidate)) { current = candidate; continue; }
    if (!current.length || !fits(unit)) throw new SummaryAdmissionError('Summary request refused: a legal message group exceeds its segment budget.');
    segments.push(current);
    current = [...unit];
    if (segments.length >= MAX_SEGMENTS) throw new SummaryAdmissionError('Summary request refused: the bounded segment schedule is full.');
  }
  if (current.length) segments.push(current);
  return segments;
}
