import { describe, expect, it } from "vitest";
import {
  classifyFencedEditOutcome,
  fencedEditOutcomeEvidence,
  type FencedEditOutcomeKind,
} from "./fencedEditOutcome.js";

describe("fencedEditOutcome", () => {
  it("defines stable success, stopped, and failed taxonomy markers", () => {
    const cases: readonly {
      readonly blocker?: string;
      readonly writerStarted?: boolean;
      readonly postWriteVerification?: "not-run" | "blocked" | "failed";
      readonly kind: FencedEditOutcomeKind;
      readonly state: "stopped" | "failed";
      readonly mutationRan: boolean;
    }[] = [
      {
        blocker: "missing-target",
        kind: "fenced-edit-missing-target",
        state: "stopped",
        mutationRan: false,
      },
      {
        blocker: "missing-mapping",
        kind: "fenced-edit-missing-mapping",
        state: "stopped",
        mutationRan: false,
      },
      {
        blocker: "multiple-matches",
        kind: "fenced-edit-multiple-matches",
        state: "stopped",
        mutationRan: false,
      },
      {
        blocker: "mapping-not-found",
        kind: "fenced-edit-no-match",
        state: "stopped",
        mutationRan: false,
      },
      {
        blocker: "workspace-final-stale-read",
        kind: "fenced-edit-stale-read",
        state: "stopped",
        mutationRan: false,
      },
      {
        blocker: "unsupported-fuzzy",
        kind: "fenced-edit-unsupported-fuzzy",
        state: "stopped",
        mutationRan: false,
      },
      {
        blocker: "unsupported-discovery",
        kind: "fenced-edit-unsupported-discovery",
        state: "stopped",
        mutationRan: false,
      },
      {
        blocker: "unsupported-generated",
        kind: "fenced-edit-unsupported-generated",
        state: "stopped",
        mutationRan: false,
      },
      {
        blocker: "unsupported-multi-file",
        kind: "fenced-edit-unsupported-multi-file",
        state: "stopped",
        mutationRan: false,
      },
      {
        blocker: "workspace-post-write-verification",
        writerStarted: true,
        postWriteVerification: "failed",
        kind: "fenced-edit-verification-failed",
        state: "failed",
        mutationRan: true,
      },
      {
        blocker: "workspace-write-application",
        writerStarted: true,
        postWriteVerification: "blocked",
        kind: "fenced-edit-writer-failed",
        state: "failed",
        mutationRan: true,
      },
    ];

    const success = classifyFencedEditOutcome({ status: "written" });
    expect(success).toMatchObject({
      kind: "fenced-edit-success",
      state: "success",
      terminalClassification: "success",
      resultStatus: "completed",
      mutationRan: true,
    });
    expect(fencedEditOutcomeEvidence(success)).toContain(
      "fenced-edit-outcome:fenced-edit-success",
    );

    for (const entry of cases) {
      const outcome = classifyFencedEditOutcome({
        status: "blocked",
        blocker: entry.blocker,
        writerStarted: entry.writerStarted,
        postWriteVerification: entry.postWriteVerification,
      });
      expect(outcome).toMatchObject({
        kind: entry.kind,
        state: entry.state,
        resultStatus: "stopped_error",
        mutationRan: entry.mutationRan,
      });
      expect(fencedEditOutcomeEvidence(outcome)).toEqual(
        expect.arrayContaining([
          `fenced-edit-outcome:${entry.kind}`,
          `fenced-edit-mutation:${entry.mutationRan ? "ran" : "not-run"}`,
        ]),
      );
    }
  });
});
