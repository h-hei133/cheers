import type { Session } from "../schema/sessionRecord.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import type { SessionStateSnapshotOverrides } from "../schema/sessionStateSnapshot.js";

export interface SessionLifecycleCallbacks {
  readonly loadSession: (sessionId: string) => Session;
  readonly appendTranscriptEvent: (
    sessionId: string,
    event: TranscriptEvent,
  ) => void;
  readonly writeSessionMetadata: (session: Session) => void;
  readonly writeSessionState: (
    session: Session,
    overrides?: SessionStateSnapshotOverrides,
  ) => void;
  readonly now: () => string;
}

export interface SessionCreationCallbacks {
  readonly sessionExists: (sessionId: string) => boolean;
  readonly validateSessionId: (sessionId: string) => void;
  readonly createSessionId: () => string;
  readonly writeSession: (session: Session) => void;
  readonly setCurrentSessionForProject: (projectRoot: string, sessionId: string) => void;
  readonly now: () => string;
}
