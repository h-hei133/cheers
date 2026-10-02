import * as fs from "node:fs";
import * as path from "node:path";
import {
  classifyTranscriptLine,
  createMessageTranscriptEvent,
  createTranscriptEntryId,
  createTranscriptHeader,
  encodeTranscriptEvent,
  legacyTranscriptEntryId,
  transcriptEventToSessionMessage,
  transcriptVersionOf,
  TRANSCRIPT_FORMAT_VERSION,
  type TranscriptEvent,
  type TranscriptHeader,
} from "../sessionEventCodec.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { Session } from "../schema/sessionRecord.js";

/**
 * The whole transcript: its format version, and the entries in order.
 *
 * The header is not returned as an entry. It describes the file rather than being
 * part of the conversation, and every caller here wants the conversation.
 */
export interface ReadTranscript {
  /** The format the file was written in; 0 when it has no header. */
  readonly version: number;
  readonly events: readonly TranscriptEvent[];
  readonly unreadableLines: number;
  readonly warnings: readonly string[];
}

export function readTranscriptEvents(transcriptPath: string): TranscriptEvent[] {
  return readTranscript(transcriptPath).events as TranscriptEvent[];
}

/**
 * Read a transcript, header included in what is reported.
 *
 * Header lines are not numbered. The derived name an entry gets when it has no id
 * comes from its position, so counting a header would shift every such name by
 * one in a file that has one — the same entry would answer to a different name
 * depending on whether a header happened to precede it. Entries start at one
 * either way.
 */
export function readTranscript(transcriptPath: string): ReadTranscript {
  if (!fs.existsSync(transcriptPath)) {
    return { version: 0, events: [], unreadableLines: 0, warnings: [] };
  }

  const events: TranscriptEvent[] = [];
  let header: TranscriptHeader | undefined;
  let lineNumber = 0;
  let unreadableLines = 0;
  const warnings = new Set<string>();
  for (const line of fs.readFileSync(transcriptPath, "utf8").split("\n")) {
    if (!line) continue;
    const decoded = classifyTranscriptLine(line);
    if (decoded.kind === "header") {
      if (header || lineNumber > 0) warnings.add("An unexpected transcript header was found; file provenance is uncertain.");
      if (!Number.isInteger(decoded.header.version) || decoded.header.version < 0 || decoded.header.version > TRANSCRIPT_FORMAT_VERSION) {
        warnings.add("The transcript format version is unsupported; only recognized entries are shown.");
      }
      // Only the first one counts. A second can only come from a concatenated
      // file, and letting it overwrite the real header would report the wrong
      // version for the entries that follow it.
      header ??= decoded.header;
      continue;
    }
    lineNumber += 1;
    if (decoded.kind === "entry") {
      events.push(
        decoded.event.id === undefined
          ? { ...decoded.event, id: legacyTranscriptEntryId(lineNumber) }
          : decoded.event,
      );
    } else {
      unreadableLines += 1;
    }
  }
  if (unreadableLines > 0) warnings.add(`${unreadableLines} unreadable transcript ${unreadableLines === 1 ? "line was" : "lines were"} omitted.`);
  return { version: transcriptVersionOf(header), events, unreadableLines, warnings: [...warnings] };
}

/**
 * The messages on the branch the thread is looking at.
 *
 * The transcript holds every branch, because it is append-only and nothing that
 * was said is erased when the user steps away from it. Which of those lines the
 * conversation is currently made of is a question about the thread, so the thread
 * answers it: the active path names the messages in view.
 *
 * Only message lines are filtered by branch. Compaction and branch-summary lines
 * keep applying, because they describe how to read the history rather than being
 * part of it, and dropping them would put back the messages a checkpoint replaced.
 *
 * Falling back to the whole transcript when no thread has been written keeps a
 * session recorded before any of this existed loading exactly as it did.
 */
export function projectBranchMessages(
  events: readonly TranscriptEvent[],
  activeEntryIds: readonly string[] | undefined,
  knownEntryIds?: readonly string[],
): SessionMessage[] {
  if (activeEntryIds === undefined) return projectTranscriptMessages(events);
  const onBranch = new Set(activeEntryIds);
  const known = knownEntryIds === undefined ? onBranch : new Set(knownEntryIds);

  const messages = events.filter((event) => event.type === "message");
  // A thread that names none of these messages does not describe them — it was
  // written against some other transcript, or against a version of this one that
  // recorded no ids. Filtering by it would return an empty conversation, which
  // reads as "this session said nothing" rather than "these two files disagree",
  // so the transcript wins.
  if (messages.length > 0 && !messages.some((event) => event.id !== undefined && known.has(event.id))) {
    return projectTranscriptMessages(events);
  }

  // A branch summary records what was left behind, so it stops applying once the
  // branch it describes is the one in view: reading it there would tell the user
  // what they had stepped away from while they were looking at it. The turns it
  // names are the test — a note whose abandoned turns are on the active path
  // describes the conversation in front of the reader, not one they left.
  return projectTranscriptMessages(
    events.filter((event) => {
      if (event.type === "message") {
        return event.id !== undefined && onBranch.has(event.id);
      }
      if (event.type === "branch_summary") {
        // A note written before the abandoned turns were recorded names none of
        // them, so there is nothing to test it with and it stays.
        const names = event.abandonedEntryIds ?? [];
        return names.length === 0 || !names.some((id) => onBranch.has(id));
      }
      return true;
    }),
  );
}

/**
 * Add one entry to a transcript.
 *
 * This is the only place that appends, so it is the only place that has to be
 * sure the file starts the way a transcript should. The session writer does put a
 * header in when it creates the file, but a transcript on disk from an older
 * build has none, and nothing stops a caller from appending to a path directly.
 *
 * A header is written only when the file is absent or empty. A file with content
 * and no header is an older transcript, and it stays one: putting a header in
 * front of lines already written is exactly the rewrite these files are promised
 * never to get. Readers infer version 0 from the missing header instead.
 */
export function appendTranscriptEvent(
  transcriptPath: string,
  event: TranscriptEvent,
  header?: { readonly sessionId: string; readonly timestamp: string; readonly cwd: string },
): void {
  ensureTranscriptHeader(transcriptPath, header);
  fs.appendFileSync(transcriptPath, `${encodeTranscriptEvent(event)}\n`, "utf8");
}

/**
 * Give a new transcript its header, and leave every other file alone.
 *
 * Emptiness is the whole test, and it is asked of the file's size rather than its
 * contents. Reading the file to see whether it is empty would cost the whole
 * transcript on every append, which is the size of the session squared over its
 * life — on the hot path of every turn, for a question whose answer is a
 * stat call.
 *
 * A file with content and no header is an older transcript, and it stays one:
 * putting a header in front of lines already written is exactly the rewrite these
 * files are promised never to get.
 */
function ensureTranscriptHeader(
  transcriptPath: string,
  header: { readonly sessionId: string; readonly timestamp: string; readonly cwd: string } | undefined,
): void {
  let empty: boolean;
  try {
    empty = fs.statSync(transcriptPath).size === 0;
  } catch {
    // Absent, or unreadable. Only the absent case is ours to start.
    try {
      fs.statSync(transcriptPath);
      return;
    } catch {
      empty = true;
    }
  }
  if (!empty) return;
  const written = header ?? {
    sessionId: path.basename(path.dirname(transcriptPath)),
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
  };
  fs.writeFileSync(transcriptPath, `${JSON.stringify(createTranscriptHeader(written))}\n`, "utf8");
}

export function projectTranscriptMessages(
  events: readonly TranscriptEvent[],
): SessionMessage[] {
  let messages: SessionMessage[] = [];

  for (const event of events) {
    if (event.type === "compaction") {
      // Re-anchor context at the compaction checkpoint, keeping the most
      // recent messages verbatim behind it.
      const kept = event.keptMessages && event.keptMessages > 0 ? messages.slice(-event.keptMessages) : [];
      messages = [
        {
          role: "user",
          content: `[Context Checkpoint]\n${event.summary}`,
          metadata: { contextSummary: "compaction" },
          timestamp: event.timestamp,
        },
        ...kept,
      ];
    } else if (event.type === "branch_summary") {
      // What the abandoned turns established, carried forward as a note. It is
      // not a turn the user took, so it reads as context rather than as speech.
      // A move with nothing to summarize adds no message: there is no content to
      // carry, and inventing a placeholder would put a turn in the conversation
      // that nobody said.
      if (event.summary !== undefined) {
        messages = [
          ...messages,
          {
            role: "user",
            content: `[Earlier Path]\n${event.summary}`,
            metadata: { contextSummary: "branch" },
            timestamp: event.timestamp,
          },
        ];
      }
    } else if (event.type === "message") {
      const msg = transcriptEventToSessionMessage(event);
      if (msg) {
        messages.push(msg);
      }
    }
  }

  return messages;
}

export function appendCompactionEvent(
  transcriptPath: string,
  input: {
    readonly summary: string;
    readonly firstKeptEntryId?: string;
    readonly keptMessages?: number;
    readonly tokensBefore?: number;
    readonly timestamp: string;
  },
): void {
  appendTranscriptEvent(transcriptPath, {
    type: "compaction",
    id: createTranscriptEntryId("comp"),
    summary: input.summary,
    firstKeptEntryId: input.firstKeptEntryId,
    keptMessages: input.keptMessages,
    tokensBefore: input.tokensBefore,
    timestamp: input.timestamp,
  });
}

export function appendBranchSummaryEvent(
  transcriptPath: string,
  input: {
    /** Absent when nothing could summarize the abandoned turns. */
    readonly summary?: string;
    readonly droppedTurns: number;
    /** The entry the conversation moved to. */
    readonly toEntryId?: string;
    /** The turns left behind, so the note can be read back only where it applies. */
    readonly abandonedEntryIds?: readonly string[];
    readonly timestamp: string;
  },
): void {
  appendTranscriptEvent(transcriptPath, {
    type: "branch_summary",
    id: createTranscriptEntryId("brsum"),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    droppedTurns: input.droppedTurns,
    ...(input.toEntryId !== undefined ? { toEntryId: input.toEntryId } : {}),
    ...(input.abandonedEntryIds !== undefined && input.abandonedEntryIds.length > 0
      ? { abandonedEntryIds: input.abandonedEntryIds }
      : {}),
    timestamp: input.timestamp,
  });
}

export function appendSessionTurn(input: {
  readonly session: Session;
  readonly message: SessionMessage;
  readonly timestamp: string;
  readonly append: (event: TranscriptEvent) => void;
  readonly writeMetadata: (session: Session) => void;
  readonly writeState: (session: Session) => void;
}): void {
  const nextMessage: SessionMessage & { timestamp: string } = {
    ...input.message,
    timestamp: input.timestamp,
    // Named at the moment it is recorded, so the thread can point back at it.
    // The transcript and the turn list then agree on which message is which,
    // which is what lets a branch be resolved into the messages it contains.
    id: input.message.id ?? createTranscriptEntryId("turn"),
  };
  input.session.turns.push(nextMessage);
  input.session.updatedAt = input.timestamp;
  input.append(createMessageTranscriptEvent(nextMessage));
  input.writeMetadata(input.session);
  input.writeState(input.session);
}
