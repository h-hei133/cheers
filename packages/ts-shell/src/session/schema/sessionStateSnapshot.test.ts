import { describe, expect, it } from "vitest";
import {
  buildSessionStateSnapshot,
  type SessionStateSnapshot,
} from "./sessionStateSnapshot.js";
import type { Session } from "./sessionRecord.js";

describe("sessionStateSnapshot schema codec", () => {
  it("preserves durable state fields and explicit undefined overrides", () => {
    const session: Session = {
      id: "sess_schema",
      projectRoot: "/repo",
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:01.000Z",
      status: "completed",
      turns: [],
    };
    const current: SessionStateSnapshot = {
      status: "interrupted",
      projectRoot: "/repo",
      runPhase: "turn-active",
      terminalReason: "stopped-by-user",
      terminalClassification: "stopped",
      lastContinuationReason: "handoff",
      workingMemory: { keep: true },
    };

    const snapshot = buildSessionStateSnapshot(session, current, {
      terminalReason: undefined,
      terminalClassification: undefined,
      lastContinuationReason: undefined,
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        status: "completed",
        projectRoot: "/repo",
        runPhase: "turn-active",
        terminalReason: undefined,
        terminalClassification: undefined,
        lastContinuationReason: undefined,
        durableStatus: "success",
        workingMemory: { keep: true },
      }),
    );
  });
});
