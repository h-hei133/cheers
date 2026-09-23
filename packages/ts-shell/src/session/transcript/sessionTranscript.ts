import * as fs from "node:fs";
import {
  createMessageTranscriptEvent,
  createTranscriptEntryId,
  decodeTranscriptLineSafe,
  encodeTranscriptEvent,
  transcriptEventToSessionMessage,
  type TranscriptEvent,
} from "../sessionEventCodec.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { Session } from "../schema/sessionRecord.js";

export function readTranscriptEvents(transcriptPath: string): TranscriptEvent[] {
  if (!fs.existsSync(transcriptPath)) {
    return [];
  }

  const events: TranscriptEvent[] = [];
  let lineNumber = 0;
  for (const line of fs.readFileSync(transcriptPath, "utf8").split("\n")) {
    if (!line) continue;
    lineNumber += 1;
    const event = decodeTranscriptLineSafe(line, lineNumber);
    if (event) events.push(event);
  }
  return events;
}

/**
 * The messages on the branch the thread is looking at.
 *
 * The transcript holds every branch, because it is append-only and nothing that
 * was said is erased when the user steps away from it. Which of those lines the
 * conversation is currently made of is a question about the thread, so the thread
 * answers it: the active path names the messages in view.
 *
 * Only message lines are filtered. Compaction and branch-summary lines keep
 * applying, because they describe how to read the history rather than being part
 * of it, and dropping them would put back the messages a checkpoint replaced.
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

  return projectTranscriptMessages(
    events.filter((event) => event.type !== "message" || (event.id !== undefined && onBranch.has(event.id))),
  );
}

export function appendTranscriptEvent(
  transcriptPath: string,
  event: TranscriptEvent,
): void {
  fs.appendFileSync(transcriptPath, `${encodeTranscriptEvent(event)}\n`, "utf8");
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
          timestamp: event.timestamp,
        },
        ...kept,
      ];
    } else if (event.type === "branch_summary") {
      // What the abandoned turns established, carried forward as a note. It is
      // not a turn the user took, so it reads as context rather than as speech.
      messages = [
        ...messages,
        {
          role: "user",
          content: `[Earlier Path]\n${event.summary}`,
          timestamp: event.timestamp,
        },
      ];
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
    readonly summary: string;
    readonly droppedTurns: number;
    readonly timestamp: string;
  },
): void {
  appendTranscriptEvent(transcriptPath, {
    type: "branch_summary",
    id: createTranscriptEntryId("brsum"),
    summary: input.summary,
    droppedTurns: input.droppedTurns,
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