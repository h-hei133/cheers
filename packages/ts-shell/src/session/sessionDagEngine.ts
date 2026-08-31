import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SessionMessage } from "./schema/sessionMessage.js";

/**
 * Unified JSONL Session DAG Engine
 * (Benchmarked against Pi Agent's `packages/coding-agent/src/core/session-manager.ts`)
 *
 * Implements:
 * 1. Single-file JSONL DAG layout (<timestamp>_<sessionId>.jsonl)
 * 2. Immutable SessionHeader and SessionEntry (id, parentId) nodes
 * 3. branch(leafId) & branchWithSummary(leafId, summary)
 * 4. buildSessionContext() path traversal and firstKeptEntryId anchor trimming
 */

export interface SessionHeader {
  readonly type: "session";
  readonly version: 3;
  readonly id: string;
  readonly timestamp: string;
  readonly cwd: string;
  readonly parentSession?: string;
}

export type SessionDagEntry =
  | {
      readonly type: "message";
      readonly id: string;
      readonly parentId: string | null;
      readonly message: SessionMessage;
      readonly timestamp: string;
    }
  | {
      readonly type: "compaction";
      readonly id: string;
      readonly parentId: string | null;
      readonly summary: string;
      readonly firstKeptEntryId?: string;
      readonly tokensBefore?: number;
      readonly timestamp: string;
    }
  | {
      readonly type: "branch_summary";
      readonly id: string;
      readonly parentId: string | null;
      readonly fromId: string;
      readonly summary: string;
      readonly timestamp: string;
    };

export class SessionDagEngine {
  readonly header: SessionHeader;
  readonly filePath: string;
  private readonly entriesById = new Map<string, SessionDagEntry>();
  private activeLeafId: string | null = null;

  constructor(filePath: string, header: SessionHeader) {
    this.filePath = filePath;
    this.header = header;
  }

  static createNew(dirPath: string, cwd: string = process.cwd(), parentSession?: string): SessionDagEngine {
    const id = `sess_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const safeTimestamp = now.replace(/[:.]/g, "-");
    const filename = `${safeTimestamp}_${id}.jsonl`;
    const filePath = path.join(dirPath, filename);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const header: SessionHeader = {
      type: "session",
      version: 3,
      id,
      timestamp: now,
      cwd,
      ...(parentSession ? { parentSession } : {}),
    };

    fs.writeFileSync(filePath, `${JSON.stringify(header)}\n`, "utf8");
    return new SessionDagEngine(filePath, header);
  }

  static load(filePath: string): SessionDagEngine {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Session DAG file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length === 0) {
      throw new Error(`Empty session DAG file: ${filePath}`);
    }

    const header = JSON.parse(lines[0]) as SessionHeader;
    const engine = new SessionDagEngine(filePath, header);

    for (let i = 1; i < lines.length; i++) {
      const entry = JSON.parse(lines[i]) as SessionDagEntry;
      engine.entriesById.set(entry.id, entry);
      engine.activeLeafId = entry.id;
    }

    return engine;
  }

  getActiveLeafId(): string | null {
    return this.activeLeafId;
  }

  appendMessage(message: SessionMessage): SessionDagEntry {
    const id = `msg_${crypto.randomUUID().slice(0, 8)}`;
    const entry: SessionDagEntry = {
      type: "message",
      id,
      parentId: this.activeLeafId,
      message,
      timestamp: new Date().toISOString(),
    };

    this.persistEntry(entry);
    return entry;
  }

  appendCompaction(summary: string, firstKeptEntryId?: string, tokensBefore?: number): SessionDagEntry {
    const id = `comp_${crypto.randomUUID().slice(0, 8)}`;
    const entry: SessionDagEntry = {
      type: "compaction",
      id,
      parentId: this.activeLeafId,
      summary,
      firstKeptEntryId,
      tokensBefore,
      timestamp: new Date().toISOString(),
    };

    this.persistEntry(entry);
    return entry;
  }

  branch(targetLeafId: string): void {
    if (targetLeafId && !this.entriesById.has(targetLeafId)) {
      throw new Error(`Cannot branch from unknown entry id: ${targetLeafId}`);
    }
    this.activeLeafId = targetLeafId;
  }

  branchWithSummary(targetLeafId: string, summary: string): SessionDagEntry {
    const fromId = this.activeLeafId ?? "root";
    this.branch(targetLeafId);

    const id = `brsum_${crypto.randomUUID().slice(0, 8)}`;
    const entry: SessionDagEntry = {
      type: "branch_summary",
      id,
      parentId: this.activeLeafId,
      fromId,
      summary,
      timestamp: new Date().toISOString(),
    };

    this.persistEntry(entry);
    return entry;
  }

  buildSessionContext(): { readonly messages: SessionMessage[] } {
    if (!this.activeLeafId) {
      return { messages: [] };
    }

    // Step 1: Walk from activeLeafId to root along parentId pointers
    const pathEntries: SessionDagEntry[] = [];
    let currentId: string | null = this.activeLeafId;

    while (currentId) {
      const entry = this.entriesById.get(currentId);
      if (!entry) break;
      pathEntries.push(entry);
      currentId = entry.parentId;
    }
    pathEntries.reverse();

    // Step 2: Locate latest CompactionEntry to trim older history
    let latestCompactionIdx = -1;
    for (let i = pathEntries.length - 1; i >= 0; i--) {
      if (pathEntries[i].type === "compaction") {
        latestCompactionIdx = i;
        break;
      }
    }

    let relevantEntries = pathEntries;
    if (latestCompactionIdx >= 0) {
      const comp = pathEntries[latestCompactionIdx] as Extract<SessionDagEntry, { type: "compaction" }>;
      const firstKeptId = comp.firstKeptEntryId;

      let keptStartIdx = 0;
      if (firstKeptId) {
        const foundIdx = pathEntries.findIndex((e) => e.id === firstKeptId);
        if (foundIdx >= 0) keptStartIdx = foundIdx;
      }

      relevantEntries = [
        comp,
        ...pathEntries.slice(keptStartIdx).filter((e) => e.id !== comp.id),
      ];
    }

    // Step 3: Project entries to clean SessionMessage list
    const messages: SessionMessage[] = [];
    for (const entry of relevantEntries) {
      if (entry.type === "message") {
        messages.push(entry.message);
      } else if (entry.type === "compaction") {
        messages.push({
          role: "user",
          content: `[Context Checkpoint]\n${entry.summary}`,
          timestamp: entry.timestamp,
        });
      } else if (entry.type === "branch_summary") {
        messages.push({
          role: "user",
          content: `[Branch Context]\n${entry.summary}`,
          timestamp: entry.timestamp,
        });
      }
    }

    return { messages };
  }

  private persistEntry(entry: SessionDagEntry): void {
    this.entriesById.set(entry.id, entry);
    this.activeLeafId = entry.id;
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
