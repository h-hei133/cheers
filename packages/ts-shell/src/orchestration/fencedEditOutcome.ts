import type { ActionableBlockerKind } from "../core/query/actionableBlockerModule.js";

export type FencedEditOutcomeKind =
  | "fenced-edit-success"
  | "fenced-edit-missing-target"
  | "fenced-edit-missing-mapping"
  | "fenced-edit-multiple-matches"
  | "fenced-edit-no-match"
  | "fenced-edit-stale-read"
  | "fenced-edit-unsupported-fuzzy"
  | "fenced-edit-unsupported-discovery"
  | "fenced-edit-unsupported-generated"
  | "fenced-edit-unsupported-multi-file"
  | "fenced-edit-verification-failed"
  | "fenced-edit-writer-failed";

export type FencedEditOutcomeState = "success" | "stopped" | "failed";

export interface FencedEditOutcome {
  readonly kind: FencedEditOutcomeKind;
  readonly state: FencedEditOutcomeState;
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly resultStatus: "completed" | "stopped_error";
  readonly actionableBlockerKind?: ActionableBlockerKind;
  readonly mutationRan: boolean;
  readonly continuationEvidenceAllowed: boolean;
  readonly marker: string;
}

export function classifyFencedEditOutcome(input: {
  readonly status: "written" | "blocked";
  readonly blocker?: string;
  readonly writerStarted?: boolean;
  readonly postWriteVerification?: "passed" | "not-run" | "blocked" | "failed";
}): FencedEditOutcome {
  if (input.status === "written") {
    return outcome({
      kind: "fenced-edit-success",
      state: "success",
      terminalClassification: "success",
      resultStatus: "completed",
      mutationRan: true,
      continuationEvidenceAllowed: true,
    });
  }

  const blocker = input.blocker ?? "";
  if (
    input.writerStarted ||
    blocker.includes("write-application") ||
    blocker.includes("recovery-authority-capture")
  ) {
    return outcome({
      kind:
        input.postWriteVerification === "failed" ||
        blocker.includes("post-write-verification")
          ? "fenced-edit-verification-failed"
          : "fenced-edit-writer-failed",
      state: "failed",
      terminalClassification: "error",
      resultStatus: "stopped_error",
      actionableBlockerKind:
        input.postWriteVerification === "failed" ||
        blocker.includes("post-write-verification")
          ? "verification-failed"
          : "partial-mutation-failed",
      mutationRan: true,
      continuationEvidenceAllowed: true,
    });
  }

  if (blocker.includes("stale-read")) {
    return stopped("fenced-edit-stale-read", "stale-read");
  }
  if (
    blocker.includes("multiple-matches") ||
    blocker.includes("ambiguous-target")
  ) {
    return stopped("fenced-edit-multiple-matches", "ambiguous-target");
  }
  if (blocker.includes("mapping-not-found")) {
    return stopped("fenced-edit-no-match", "patch-from-not-found");
  }
  if (
    blocker.includes("missing-target") ||
    blocker.includes("target-missing") ||
    blocker.includes("workspace-path-outside-workspace") ||
    blocker.includes("workspace-boundary")
  ) {
    return stopped("fenced-edit-missing-target", "patch-target-missing");
  }
  if (blocker.includes("missing-mapping")) {
    return stopped("fenced-edit-missing-mapping", "patch-content-missing");
  }
  if (blocker.includes("unsupported-fuzzy")) {
    return stopped("fenced-edit-unsupported-fuzzy", "unsupported-future-edit");
  }
  if (blocker.includes("unsupported-discovery")) {
    return stopped(
      "fenced-edit-unsupported-discovery",
      "unsupported-future-edit",
    );
  }
  if (
    blocker.includes("unsupported-broad") ||
    blocker.includes("unsupported-multi-file")
  ) {
    return stopped(
      "fenced-edit-unsupported-multi-file",
      "unsupported-future-edit",
    );
  }
  if (
    blocker.includes("unsupported-generated") ||
    blocker.includes("unsupported-rollback")
  ) {
    return stopped(
      "fenced-edit-unsupported-generated",
      "unsupported-future-edit",
    );
  }
  if (blocker.includes("post-write-verification")) {
    return outcome({
      kind: "fenced-edit-verification-failed",
      state: "failed",
      terminalClassification: "error",
      resultStatus: "stopped_error",
      actionableBlockerKind: "verification-failed",
      mutationRan: true,
      continuationEvidenceAllowed: true,
    });
  }
  return stopped("fenced-edit-missing-mapping", "patch-content-missing");
}

export function fencedEditOutcomeEvidence(
  outcomeValue: FencedEditOutcome,
): readonly string[] {
  return [
    outcomeValue.marker,
    `fenced-edit-outcome-state:${outcomeValue.state}`,
    `fenced-edit-result-status:${outcomeValue.resultStatus}`,
    `fenced-edit-mutation:${outcomeValue.mutationRan ? "ran" : "not-run"}`,
    `fenced-edit-continuation-evidence:${
      outcomeValue.continuationEvidenceAllowed ? "allowed" : "not-allowed"
    }`,
    ...(outcomeValue.actionableBlockerKind
      ? [`actionable-blocker-kind:${outcomeValue.actionableBlockerKind}`]
      : []),
  ];
}

function stopped(
  kind: FencedEditOutcomeKind,
  actionableBlockerKind: ActionableBlockerKind,
): FencedEditOutcome {
  return outcome({
    kind,
    state: "stopped",
    terminalClassification: "stopped",
    resultStatus: "stopped_error",
    actionableBlockerKind,
    mutationRan: false,
    continuationEvidenceAllowed: true,
  });
}

function outcome(input: Omit<FencedEditOutcome, "marker">): FencedEditOutcome {
  return {
    ...input,
    marker: `fenced-edit-outcome:${input.kind}`,
  };
}
