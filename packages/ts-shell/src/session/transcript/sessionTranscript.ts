import * as fs from "node:fs";
import {
  createMessageTranscriptEvent,
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
  for (const line of fs.readFileSync(transcriptPath, "utf8").split("\n")) {
    if (!line) continue;
    const event = decodeTranscriptLineSafe(line);
    if (event) events.push(event);
  }
  return events;
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
  };
  input.session.turns.push(nextMessage);
  input.session.updatedAt = input.timestamp;
  input.append(createMessageTranscriptEvent(nextMessage));
  input.writeMetadata(input.session);
  input.writeState(input.session);
}
