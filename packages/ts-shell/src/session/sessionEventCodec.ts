import type { QueryEvent } from "../core/query/runtime/events.js";
import type { SessionMessage, SessionToolCall } from "./schema/sessionMessage.js";
export type TranscriptLifecycleEventName =
  | "run-started"
  | "run-interrupted"
  | "run-completed"
  | "run-error"
  | "run-terminated";

export interface CompactionTranscriptEntry {
  type: "compaction";
  summary: string;
  firstKeptEntryId?: string;
  /** Messages immediately before this entry that stay in the context verbatim. */
  keptMessages?: number;
  tokensBefore?: number;
  timestamp: string;
}

export type TranscriptEvent =
  | {
      type: "message";
      role: SessionMessage["role"];
      content: string;
      tool_calls?: readonly SessionToolCall[];
      tool_call_id?: string;
      timestamp: string;
    }
  | {
      type: "lifecycle";
      event: TranscriptLifecycleEventName;
      timestamp: string;
      detail?: string;
    }
  | { type: "query-event"; event: QueryEvent; timestamp: string }
  | CompactionTranscriptEntry;

export function createMessageTranscriptEvent(
  message: SessionMessage & { timestamp: string },
): Extract<TranscriptEvent, { type: "message" }> {
  return {
    type: "message",
    role: message.role,
    content: message.content,
    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
    timestamp: message.timestamp,
  };
}

export function createLifecycleTranscriptEvent(input: {
  readonly event: TranscriptLifecycleEventName;
  readonly timestamp: string;
  readonly detail?: string;
}): Extract<TranscriptEvent, { type: "lifecycle" }> {
  return {
    type: "lifecycle",
    event: input.event,
    timestamp: input.timestamp,
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  };
}

export function createQueryTranscriptEvent(input: {
  readonly event: QueryEvent;
  readonly timestamp: string;
}): Extract<TranscriptEvent, { type: "query-event" }> {
  return {
    type: "query-event",
    event: input.event,
    timestamp: input.timestamp,
  };
}

export function encodeTranscriptEvent(event: TranscriptEvent): string {
  return JSON.stringify(event);
}

export function decodeTranscriptLine(line: string): TranscriptEvent {
  return JSON.parse(line) as TranscriptEvent;
}

const TRANSCRIPT_ROLES: ReadonlySet<unknown> = new Set(["system", "user", "assistant", "tool"]);

function isTranscriptEvent(value: unknown): value is TranscriptEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || typeof record.timestamp !== "string") return false;
  if (record.type === "message") {
    return TRANSCRIPT_ROLES.has(record.role) && typeof record.content === "string";
  }
  if (record.type === "lifecycle") return typeof record.event === "string";
  if (record.type === "query-event") return record.event !== null && typeof record.event === "object";
  if (record.type === "compaction") return typeof record.summary === "string";
  return false;
}

export function decodeTranscriptLineSafe(line: string): TranscriptEvent | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  return isTranscriptEvent(parsed) ? parsed : undefined;
}

export function transcriptEventToSessionMessage(
  event: TranscriptEvent,
): SessionMessage | undefined {
  if (event.type !== "message") {
    return undefined;
  }
  return {
    role: event.role,
    content: event.content,
    tool_calls: event.tool_calls,
    tool_call_id: event.tool_call_id,
    timestamp: event.timestamp,
  };
}
