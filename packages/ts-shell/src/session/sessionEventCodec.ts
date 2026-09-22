import { randomUUID } from "node:crypto";
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
  id?: string;
  summary: string;
  firstKeptEntryId?: string;
  /** Messages immediately before this entry that stay in the context verbatim. */
  keptMessages?: number;
  tokensBefore?: number;
  timestamp: string;
}

/**
 * A summary of turns the user stepped back past.
 *
 * Going back in the conversation discards what was said after that point. The
 * turns themselves are gone, but what they established — what was tried, what
 * it ruled out — is usually still worth carrying forward, so it travels as a
 * summary attached at the point the user returned to.
 */
export interface BranchSummaryTranscriptEntry {
  type: "branch_summary";
  id?: string;
  summary: string;
  /** How many turns were dropped at the point this summary was written. */
  droppedTurns: number;
  timestamp: string;
}

export type TranscriptEvent =
  | {
      type: "message";
      id?: string;
      role: SessionMessage["role"];
      content: string;
      tool_calls?: readonly SessionToolCall[];
      tool_call_id?: string;
      timestamp: string;
    }
  | {
      type: "lifecycle";
      id?: string;
      event: TranscriptLifecycleEventName;
      timestamp: string;
      detail?: string;
    }
  | { type: "query-event"; id?: string; event: QueryEvent; timestamp: string }
  | CompactionTranscriptEntry
  | BranchSummaryTranscriptEntry;

/**
 * A short, unique name for one transcript entry.
 *
 * Sequential numbers would be simpler, but the transcript is appended to by more
 * than one writer across a session's life and a repeat after a crash would make
 * two entries answer to the same name. Random suffixes cost nothing here and
 * cannot collide.
 */
export function createTranscriptEntryId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

/**
 * The id an entry has when it was written before ids existed.
 *
 * Derived from the line number rather than assigned and stored: rewriting old
 * transcripts would break the promise that they are append-only, and a derived
 * name is stable for as long as the file is.
 */
export function legacyTranscriptEntryId(lineNumber: number): string {
  return `line-${lineNumber}`;
}

export function createMessageTranscriptEvent(
  message: SessionMessage & { timestamp: string },
): Extract<TranscriptEvent, { type: "message" }> {
  return {
    type: "message",
    id: createTranscriptEntryId("msg"),
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
    id: createTranscriptEntryId("evt"),
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
    id: createTranscriptEntryId("qevt"),
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
  if (record.type === "branch_summary") return typeof record.summary === "string";
  return false;
}

export function decodeTranscriptLineSafe(
  line: string,
  lineNumber?: number,
): TranscriptEvent | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isTranscriptEvent(parsed)) return undefined;
  // Lines written before entries had ids get a name derived from their position.
  // Derived rather than stored, because rewriting an old transcript would break
  // the promise that these files are append-only.
  if (parsed.id === undefined && lineNumber !== undefined) {
    return { ...parsed, id: legacyTranscriptEntryId(lineNumber) };
  }
  return parsed;
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
