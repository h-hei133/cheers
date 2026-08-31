/**
 * Session Tree & Checkpoint Timeline Types (Pi Agent Aligned)
 */

export interface SessionTreeEntry {
  readonly id: string;
  readonly parentId?: string;
  readonly type: "user_turn" | "assistant_turn" | "tool_batch" | "compaction_boundary" | "checkpoint";
  readonly timestamp: number;
  readonly summary?: string;
  readonly data: Record<string, unknown>;
}

export interface SessionTreeSnapshot {
  readonly sessionId: string;
  readonly rootEntryId: string;
  readonly activeLeafId: string;
  readonly entries: readonly SessionTreeEntry[];
  readonly checkpointIds: readonly string[];
}

export class SessionTree {
  private readonly sessionId: string;
  private readonly entriesById = new Map<string, SessionTreeEntry>();
  private activeLeafId: string = "";
  private rootEntryId: string = "";

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  appendEntry(
    type: SessionTreeEntry["type"],
    data: Record<string, unknown>,
    summary?: string,
  ): SessionTreeEntry {
    const id = `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const parentId = this.activeLeafId || undefined;
    const entry: SessionTreeEntry = {
      id,
      parentId,
      type,
      timestamp: Date.now(),
      summary,
      data,
    };

    this.entriesById.set(id, entry);
    if (!this.rootEntryId) {
      this.rootEntryId = id;
    }
    this.activeLeafId = id;

    return entry;
  }

  createCheckpoint(summary: string): string {
    const checkpointEntry = this.appendEntry("checkpoint", { checkpointTime: Date.now() }, summary);
    return checkpointEntry.id;
  }

  getTimeline(): readonly SessionTreeEntry[] {
    const timeline: SessionTreeEntry[] = [];
    let currentId: string | undefined = this.activeLeafId;

    while (currentId) {
      const entry = this.entriesById.get(currentId);
      if (!entry) break;
      timeline.unshift(entry);
      currentId = entry.parentId;
    }

    return timeline;
  }

  rewindToCheckpoint(checkpointId: string): boolean {
    if (!this.entriesById.has(checkpointId)) {
      return false;
    }
    this.activeLeafId = checkpointId;
    return true;
  }

  toSnapshot(): SessionTreeSnapshot {
    const checkpoints: string[] = [];
    for (const [id, entry] of this.entriesById.entries()) {
      if (entry.type === "checkpoint" || entry.type === "compaction_boundary") {
        checkpoints.push(id);
      }
    }

    return {
      sessionId: this.sessionId,
      rootEntryId: this.rootEntryId,
      activeLeafId: this.activeLeafId,
      entries: Array.from(this.entriesById.values()),
      checkpointIds: checkpoints,
    };
  }
}
