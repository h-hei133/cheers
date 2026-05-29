import { describe, expect, it } from "vitest";

import { projectSessionTree } from "../session/sessionTreeProjection.js";
import { projectSessionContextRebuild } from "./sessionContextRebuildProjection.js";

describe("session context rebuild projection", () => {
  it("distinguishes available, missing, excluded, stale, and unsupported facts", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-context-rebuild",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "raw transcript should stay excluded" }],
      },
      compactions: [{
        id: "compact-context",
        summary: "summary metadata only",
        evidence: "observed",
      }],
    });

    const projection = projectSessionContextRebuild({
      sessionProjection,
      requiredFacts: ["latest-save-point"],
      optionalFacts: ["branch-summary-record"],
      staleFacts: ["prior-context-window"],
    });

    expect(projection.availableContext).toEqual(
      expect.arrayContaining(["active-path:2", "compactions:1"]),
    );
    expect(projection.missingRequiredFacts).toEqual(["latest-save-point"]);
    expect(projection.missingOptionalFacts).toEqual(["branch-summary-record"]);
    expect(projection.excludedUnsafeFacts).toEqual(
      expect.arrayContaining([
        "raw-transcript-content",
        "raw-provider-output",
        "raw-edit-content",
      ]),
    );
    expect(projection.staleFacts).toEqual(["prior-context-window"]);
    expect(projection.unsupportedBranchFacts).toEqual(
      expect.arrayContaining([
        "storage-backed-branch-navigation",
        "branch-summary-not-supported-by-current-schema",
      ]),
    );
    expect(projection.unsupportedCompactionFacts).toEqual([]);
    expect(projection.missingFacts).toEqual(
      expect.arrayContaining([
        "latest-save-point",
        "branch-summary-record",
        "raw-transcript-content",
      ]),
    );
    expect(projection.terminalSuccessClaim).toBe(false);
    expect(projection.notProvenClaims).toEqual(
      expect.arrayContaining([
        "context-rebuilt-is-not-success",
        "context-completeness",
      ]),
    );
  });
});
