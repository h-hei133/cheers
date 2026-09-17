import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applySessionCompactRetention } from "./sessionCompactModule.js";
import {
  extractGroundedDeliverableMode,
  extractLastReadDeliveredLines,
  extractLastReadFragment,
  findLastQueryCompletionEvent,
} from "./sessionContinuityModule.js";
import { decodeTranscriptLine, encodeTranscriptEvent } from "./sessionEventCodec.js";
import { projectApprovalMemoryPersistence } from "./approval/sessionApprovalMemory.js";
import {
  projectCurrentSessionRegistryResolution,
  projectCurrentSessionSelectionStore,
  readSessionRegistryStore,
  removeCurrentSessionSelectionFromStore,
  writeSessionRegistryStore,
} from "./store/currentSessionRegistry.js";
import {
  createSessionStoreLayout,
  projectSessionFileLayout,
  validateSessionId,
} from "./store/sessionFileLayout.js";

describe("SessionManager module boundary facades", () => {
  it("projects session store layout and id validation without changing filenames", () => {
    const home = path.join(os.tmpdir(), "session-manager-boundary-home");
    const layout = createSessionStoreLayout(home);
    const files = projectSessionFileLayout({
      sessionsDir: layout.sessionsDir,
      sessionId: "sess_boundary",
    });

    expect(layout.sessionsDir).toBe(
      path.join(home, ".private-agents", "sessions"),
    );
    expect(layout.currentSessionStorePath).toBe(
      path.join(home, ".private-agents", "current-session.json"),
    );
    expect(files).toEqual({
      sessionDir: path.join(layout.sessionsDir, "sess_boundary"),
      metadataPath: path.join(layout.sessionsDir, "sess_boundary", "metadata.json"),
      transcriptPath: path.join(
        layout.sessionsDir,
        "sess_boundary",
        "transcript.jsonl",
      ),
      statePath: path.join(layout.sessionsDir, "sess_boundary", "state.json"),
      stateLockPath: path.join(
        layout.sessionsDir,
        "sess_boundary",
        "state.lock",
      ),
    });
    expect(validateSessionId(" sess.ok-1_2 ")).toBe("sess.ok-1_2");
    expect(() => validateSessionId("bad/id")).toThrow("Invalid session id");
  });

  it("preserves current-session registry read/write/remove and selection facts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-registry-"));
    const storePath = path.join(root, "current-session.json");
    try {
      const empty = readSessionRegistryStore(storePath);
      expect(empty.readError).toBeNull();
      expect(empty.store).toEqual({ schemaVersion: 1, byProjectRoot: {} });

      const next = projectCurrentSessionSelectionStore({
        current: empty.store,
        normalizedProjectRoot: "/repo",
        sessionId: "sess_current",
        updatedAt: "2026-05-20T00:00:00.000Z",
      });
      writeSessionRegistryStore({ storePath, store: next });
      expect(JSON.parse(fs.readFileSync(storePath, "utf8"))).toEqual(next);

      const resolution = projectCurrentSessionRegistryResolution({
        projectRoot: "/repo",
        normalizedProjectRoot: "/repo",
        storeReadError: null,
        selection: next.byProjectRoot["/repo"],
        sessionExists: false,
      });
      expect(resolution.resolution).toEqual({
        ok: false,
        reason: "missing-session",
        sessionId: "sess_current",
        detail: "Current session sess_current no longer exists for /repo.",
      });
      expect(resolution.clearSelection).toBe(true);

      const removed = removeCurrentSessionSelectionFromStore({
        current: next,
        normalizedProjectRoot: "/repo",
      });
      expect(removed).toEqual({ schemaVersion: 1, byProjectRoot: {} });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("projects approval-memory persistence without changing working-memory keys", () => {
    const projected = projectApprovalMemoryPersistence({
      currentWorkingMemory: {
        summary: ["- previous: keep"],
      },
      sessionProjectRoot: "/repo",
      recordedAt: "2026-05-20T00:00:00.000Z",
      historyLimit: 2,
      decision: {
        decision: "allow-once",
        decisionSource: "interactive",
        persistent: false,
        cacheEffect: "none",
        projectRoot: "/repo",
        cacheKey: "bash:/repo",
        scopeLabel: "bash in /repo",
        channel: "interactive",
        inputKey: "y",
      },
    });

    expect(projected.approvalAudit).toEqual(
      expect.objectContaining({
        decision: "allow-once",
        projectRoot: path.resolve("/repo"),
        cacheKey: "bash:/repo",
        recordedAt: "2026-05-20T00:00:00.000Z",
      }),
    );
    expect(projected.workingMemory.approvalAudit).toEqual(projected.approvalAudit);
    expect(projected.workingMemory.approvalAuditHistory).toEqual([
      projected.approvalAudit,
    ]);
    expect(projected.workingMemory.continuity).toEqual(
      expect.objectContaining({
        lastApprovalDecision: "allow-once",
        lastRequestScopeCacheKey: "bash:/repo",
        lastPermissionRequestCacheKey: "bash:/repo",
      }),
    );
    expect(projected.workingMemory.summary).toContain("- previous: keep");
    expect(projected.workingMemory.summary).toContain(
      "- last-approval-decision: allow-once",
    );
  });

  it("preserves compact retention counters and approval continuity handoff", () => {
    const workingMemory = {
      sourceEventCount: 0,
      sourceTurnCount: 0,
      compacted: false,
      summary: [],
      approvalAudit: {
        decision: "allow-once",
        decisionSource: "interactive",
        persistent: false,
        cacheEffect: "none",
        projectRoot: "/repo",
        cacheKey: "bash:/repo",
        scopeLabel: "bash in /repo",
        recordedAt: "2026-05-20T00:00:00.000Z",
      },
    };
    const retained = applySessionCompactRetention({
      workingMemory,
      event: {
        type: "query.completed",
        result: {
          status: "completed",
          terminalReason: "completed",
          terminalClassification: "success",
          transcript: [],
          sharedContext: {
            sessionId: "sess_compact_boundary",
            initialPrompt: "hello",
            notes: [],
            handoffs: [],
          },
          finalOutput: "done",
        },
      },
      turnThreshold: 1,
      historyLimit: 4,
      now: "2026-05-20T00:00:00.000Z",
    }) as Record<string, unknown>;

    expect(retained.sourceEventCount).toBe(1);
    expect(retained.sourceTurnCount).toBe(1);
    expect(retained.compacted).toBe(true);
    expect(retained.compactReason).toBe("auto-threshold");
    expect(retained.continuity).toEqual(
      expect.objectContaining({
        lastApprovalDecision: "allow-once",
        lastApprovalCacheKey: "bash:/repo",
      }),
    );
  });

  it("keeps transcript and continuity evidence projections replay-safe", () => {
    const queryEvent = {
      type: "query-event",
      timestamp: "2026-05-20T00:00:00.000Z",
      event: {
        type: "query.completed",
        result: {
          status: "completed",
          terminalReason: "completed",
          terminalClassification: "success",
          transcript: [],
          sharedContext: {
            sessionId: "sess_continuity_boundary",
            initialPrompt: "read file",
            notes: [],
            handoffs: [],
          },
          finalOutput: "read complete",
        },
      },
    } as const;
    const roundTrip = decodeTranscriptLine(encodeTranscriptEvent(queryEvent));
    expect(roundTrip).toEqual(queryEvent);
    expect(findLastQueryCompletionEvent([roundTrip])?.event.result.finalOutput).toBe(
      "read complete",
    );
    const evidence = [
      "deliverable-mode:read",
      "read-delivered-lines:12",
      "read-fragment-start:2",
      "read-fragment-end:8",
      "read-fragment-line-indexes:2,4,4",
      "read-fragment-fingerprint:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "RAW_DOM_CONTENT_SHOULD_NOT_BE_PARSED",
      "sk-secret-output",
    ];
    expect(extractGroundedDeliverableMode(evidence)).toBe("read");
    expect(extractLastReadDeliveredLines(evidence)).toBe(12);
    expect(extractLastReadFragment(evidence)).toEqual(
      expect.objectContaining({
        start: 2,
        end: 8,
        lineIndexes: [2, 4],
        fingerprint:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    );
  });
});
