import type { MultimodalContentBlock } from "../model-adapters/multimodal.js";
import { randomUUID } from "node:crypto";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { SessionMessage, SessionToolCall } from "./schema/sessionMessage.js";
import { isReadableTranscriptEvent } from "./transcript/validation.js";
import type { ReportTranscriptEntry } from './reports/model.js';
export type TranscriptLifecycleEventName =
  | "run-started"
  | "run-interrupted"
  | "run-completed"
  | "run-error"
  | "run-terminated";

export interface CompactionTranscriptEntry {
  /** Requires a later matching commit marker before model-context projection. */
  publication?: 'prepared';
  type: "compaction";
  id?: string;
  summary: string;
  /** New receipts apply only on this captured path or its descendants. */
  sourceActivePath?: readonly string[];
  firstKeptEntryId?: string;
  /** Messages immediately before this entry that stay in the context verbatim. */
  keptMessages?: number;
  tokensBefore?: number;
  timestamp: string;
}

/**
 * A record that the conversation moved to another branch.
 *
 * Written on every move, whether or not a summary was produced. The move itself
 * is the fact worth keeping: without this, reopening a session showed a shorter
 * conversation with nothing saying that anything had been left behind or how
 * much. A summary, when there is one, is what the abandoned turns established.
 */
export interface BranchSummaryTranscriptEntry {
  type: "branch_summary";
  id?: string;
  /** What the abandoned turns established, when something could summarize them. */
  summary?: string;
  /** How many turns were left behind at this point. */
  droppedTurns: number;
  /** The entry the conversation moved to, so the record names where it went. */
  toEntryId?: string;
  /**
   * The turns this move left behind, by entry id.
   *
   * Recorded so the note can be told apart from the branch it describes: without
   * it there is nothing on the record that says which conversation was abandoned,
   * and the note is read back on every branch — including the one it was written
   * about, where it tells the reader what they stepped away from while they are
   * looking at it.
   */
  abandonedEntryIds?: readonly string[];
  timestamp: string;
}

export type TranscriptEvent =
  | {
      type: "message";
      id?: string;
      role: SessionMessage["role"];
      /** Text, or text with images; see `SessionMessage.content`. */
      content: string | readonly MultimodalContentBlock[];
      tool_calls?: readonly SessionToolCall[];
      tool_call_id?: string;
      /**
       * Structured facts recorded beside a tool's prose; see
       * `SessionMessage.metadata`. Bounded when the event is written, so a
       * large record cannot swell the transcript.
       */
      metadata?: Record<string, unknown>;
      /**
       * The model an assistant answer came from. Absent on every line written
       * before the field existed, and on every role that has no model behind
       * it. Readers treat absence as the current model, so old transcripts
       * keep behaving as they did when they were written.
       */
      origin?: {
        readonly provider?: string;
        readonly model: string;
        readonly replayBinding?: string;
      };
      /**
       * The working out an assistant answer came with, and the provider's
       * signature over it. See `SessionMessage.reasoning` for why it is kept.
       */
      reasoning?: {
        readonly text: string;
        readonly signature?: string;
        readonly redacted?: boolean;
      };
      /**
       * Why an assistant answer failed, when it did.
       *
       * The provider's own wording is kept in `errorMessage`; this is the
       * category it belongs to, so a reader can tell a rate limit from a bad
       * request without matching on prose that varies by provider.
       */
      failureClass?: string;
      timestamp: string;
    }
  | {
      type: "lifecycle";
      id?: string;
      sourceEntryId?: string;
      event: TranscriptLifecycleEventName;
      timestamp: string;
      detail?: string;
    }
  | { type: "query-event"; id?: string; sourceEntryId?: string; event: QueryEvent; timestamp: string }
  | CompactionTranscriptEntry
  | { type: 'compaction-commit'; id: string; compactionId: string; digest: string; timestamp: string }
  | ReportTranscriptEntry
  | BranchSummaryTranscriptEntry;

/**
 * The transcript format this build writes.
 *
 * One number for the whole file rather than a field on every entry: what changes
 * between formats is how the lines are to be read, which is a property of the
 * file. A file with no header was written before any of this existed and is
 * version 0 — inferred from the absence rather than assigned, because assigning
 * it would mean rewriting files this project promises never to rewrite.
 */
export const TRANSCRIPT_FORMAT_VERSION = 1;

/**
 * The first line of a transcript, saying what it is.
 *
 * Metadata only, and not part of the conversation: it names the session and the
 * format, so a reader can tell what it is holding before deciding whether it
 * knows how to read it. Absent from every transcript written before this
 * existed, which is how those files are recognized.
 */
export interface TranscriptHeader {
  readonly type: "session";
  readonly version: number;
  readonly id: string;
  readonly timestamp: string;
  readonly cwd: string;
}

/** The header a new transcript starts with. */
export function createTranscriptHeader(input: {
  readonly sessionId: string;
  readonly timestamp: string;
  readonly cwd: string;
}): TranscriptHeader {
  return {
    type: "session",
    version: TRANSCRIPT_FORMAT_VERSION,
    id: input.sessionId,
    timestamp: input.timestamp,
    cwd: input.cwd,
  };
}

/**
 * Whether a parsed line is a transcript header rather than an entry.
 *
 * Deliberately loose about `version`: a header from a future build should be
 * recognized as a header even by a reader that does not know its version, so the
 * complaint can be about the version instead of about malformed input.
 */
export function isTranscriptHeader(value: unknown): value is TranscriptHeader {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === "session" &&
    typeof record.id === "string" &&
    typeof record.timestamp === "string" &&
    typeof record.cwd === "string"
  );
}

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
    // The message's own id when it has one, so the transcript and the turn list
    // name the same thing. A branch is defined as a set of these ids, and the
    // two would drift apart if each generated its own.
    id: message.id ?? createTranscriptEntryId("msg"),
    role: message.role,
    content: message.content,
    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
    ...(message.metadata ? { metadata: message.metadata } : {}),
    ...(message.origin ? { origin: message.origin } : {}),
    ...(message.reasoning ? { reasoning: message.reasoning } : {}),
    ...(message.failureClass ? { failureClass: message.failureClass } : {}),
    timestamp: message.timestamp,
  };
}

export function createLifecycleTranscriptEvent(input: {
  readonly event: TranscriptLifecycleEventName;
  readonly timestamp: string;
  readonly detail?: string;
  readonly sourceEntryId?: string;
}): Extract<TranscriptEvent, { type: "lifecycle" }> {
  return {
    type: "lifecycle",
    id: createTranscriptEntryId("evt"),
    ...(input.sourceEntryId !== undefined ? { sourceEntryId: input.sourceEntryId } : {}),
    event: input.event,
    timestamp: input.timestamp,
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  };
}

export function createQueryTranscriptEvent(input: {
  readonly event: QueryEvent;
  readonly timestamp: string;
  readonly sourceEntryId?: string;
}): Extract<TranscriptEvent, { type: "query-event" }> {
  return {
    type: "query-event",
    id: createTranscriptEntryId("qevt"),
    ...(input.sourceEntryId !== undefined ? { sourceEntryId: input.sourceEntryId } : {}),
    event: durableQueryEvent(input.event),
    timestamp: input.timestamp,
  };
}

/**
 * The event as it goes to disk.
 *
 * A tool result's pictures are carried for the card that shows the result; the
 * same bytes are already stored on the tool result message, which is what replay
 * and the model read. Writing them here as well would put the encoded payload in
 * the transcript twice, so the durable copy drops the display-only field.
 */
function durableQueryEvent(event: QueryEvent): QueryEvent {
  if (event.type !== 'tool.result' || event.images === undefined) return event;
  const { images: _displayOnly, ...rest } = event;
  return rest;
}

export function encodeTranscriptEvent(event: TranscriptEvent): string {
  // Older readers reject this new wire type instead of applying an unverified summary.
  return JSON.stringify(event.type === 'compaction' && event.publication === 'prepared'
    ? { ...event, type: 'compaction-prepared' } : event);
}

export function decodeTranscriptLine(line: string): TranscriptEvent {
  const decoded = classifyTranscriptLine(line);
  if (decoded.kind !== 'entry') throw new Error('Transcript entry is unreadable.');
  return decoded.event;
}

export function decodeTranscriptLineSafe(
  line: string,
  lineNumber?: number,
): TranscriptEvent | undefined {
  const decoded = classifyTranscriptLine(line);
  if (decoded.kind !== "entry") return undefined;
  // Lines written before entries had ids get a name derived from their position.
  // Derived rather than stored, because rewriting an old transcript would break
  // the promise that these files are append-only.
  if (decoded.event.id === undefined && lineNumber !== undefined) {
    return { ...decoded.event, id: legacyTranscriptEntryId(lineNumber) };
  }
  return decoded.event;
}

/**
 * What one line of a transcript turned out to be.
 *
 * A reader that takes a file from the top has to tell three things apart — a
 * header, an entry, and a line it cannot use — and it has to do that once per
 * line. Returning the category rather than only the entry is what lets the caller
 * count entries without counting headers, which is the whole reason the derived
 * names above stay stable once a header exists.
 */
export type TranscriptLine =
  | { readonly kind: "header"; readonly header: TranscriptHeader }
  | { readonly kind: "entry"; readonly event: TranscriptEvent }
  | { readonly kind: "unreadable" };

/**
 * Read one line, and say which of the three it is.
 *
 * Parses once. The alternative — asking separately whether a line is a header —
 * would parse every line twice on the way through a file that can be long.
 */
export function classifyTranscriptLine(line: string): TranscriptLine {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { kind: "unreadable" };
  }
  if (isTranscriptHeader(parsed)) return { kind: "header", header: parsed };
  if (isReadableTranscriptEvent(parsed)) return { kind: "entry", event: parsed as TranscriptEvent };
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>).type === 'compaction-prepared') {
    const event = { ...parsed, type: 'compaction', publication: 'prepared' };
    if (isReadableTranscriptEvent(event)) return { kind: 'entry', event: event as TranscriptEvent };
  }
  return { kind: "unreadable" };
}

/**
 * The format version a transcript was written in.
 *
 * A file with no header predates the header and is version 0. A header whose
 * version is missing or unreadable is also version 0: the field did not parse,
 * and reporting a number nobody wrote would be worse than reporting none.
 */
export function transcriptVersionOf(header: TranscriptHeader | undefined): number {
  if (!header) return 0;
  return Number.isInteger(header.version) ? header.version : 0;
}

export function transcriptEventToSessionMessage(
  event: TranscriptEvent,
): SessionMessage | undefined {
  if (event.type !== "message") {
    return undefined;
  }
  return {
    ...(event.id ? { id: event.id } : {}),
    role: event.role,
    content: event.content,
    tool_calls: event.tool_calls,
    tool_call_id: event.tool_call_id,
    // Carried back so a resumed session can replay the state the tool recorded.
    ...(event.metadata ? { metadata: event.metadata } : {}),
    ...(event.origin ? { origin: event.origin } : {}),
    // Carried back, not dropped. The signature is what makes a replayed
    // assistant turn acceptable to a provider that validates it, so losing it
    // here would undo the reason it was recorded: a resumed session would send
    // the working out back unsigned, and the request would be refused.
    ...(event.reasoning ? { reasoning: event.reasoning } : {}),
    ...(event.failureClass ? { failureClass: event.failureClass } : {}),
    timestamp: event.timestamp,
  };
}
