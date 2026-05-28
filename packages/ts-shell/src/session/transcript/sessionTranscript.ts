import * as fs from "node:fs";
import {
  createMessageTranscriptEvent,
  decodeTranscriptLine,
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

  return fs
    .readFileSync(transcriptPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(decodeTranscriptLine);
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
  return events
    .map((event) => transcriptEventToSessionMessage(event) ?? null)
    .filter((event): event is SessionMessage => event !== null);
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
