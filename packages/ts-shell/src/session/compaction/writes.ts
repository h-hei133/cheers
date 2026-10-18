import type { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { appendCompactionEvent } from '../transcript/sessionTranscript.js';
import { captureSessionCompaction, commitSessionCompaction } from './commit.js';
import type { CompactionCommitInput, CompactionCommit, CompactionSource } from './contract.js';

/** The session manager inherits this thin native compaction write surface. */
export abstract class SessionCompactionWrites {
  protected constructor(private readonly compactionStore: SessionStoreAccess) {}
  captureCompactionSource(sessionId: string): CompactionSource {
    return captureSessionCompaction(this.compactionStore, sessionId);
  }
  appendCompactionIfCurrent(input: CompactionCommitInput): CompactionCommit {
    return commitSessionCompaction(this.compactionStore, input);
  }
  /** Compatibility writer for explicit historical/test fixtures. Live compaction uses conditional commit. */
  appendCompactionEntry(sessionId: string, input: {
    readonly summary: string; readonly firstKeptEntryId?: string; readonly keptMessages?: number; readonly tokensBefore?: number;
  }): void {
    this.compactionStore.withSessionStateLock(sessionId, () => {
      appendCompactionEvent(this.compactionStore.transcriptPath(sessionId), { ...input, timestamp: new Date().toISOString() });
    }, { requireExisting: true });
  }
}
