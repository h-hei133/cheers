import type { TargetSetEditPlan } from "./targetSetEditPlan.js";

export type TargetSetEditJournalStep =
  | "preflight-started"
  | "preflight-passed"
  | "preflight-failed"
  | "authority-checked"
  | "match-count-checked"
  | "stale-read-checked"
  | "snapshot-captured"
  | "write-attempted"
  | "write-succeeded"
  | "write-failed"
  | "verification-projected"
  | "recovery-readiness-projected"
  | "rollback-applied";

export interface TargetSetEditJournalEntry {
  readonly transactionId: string;
  readonly step: TargetSetEditJournalStep;
  readonly targetPath?: string;
  readonly status: "passed" | "failed" | "not-run" | "projected";
  readonly reason?: string;
  readonly evidence: readonly string[];
}

export function buildTargetSetEditPreflightJournal(input: {
  readonly transactionId: string;
  readonly plan: TargetSetEditPlan;
}): readonly TargetSetEditJournalEntry[] {
  const entries: TargetSetEditJournalEntry[] = [
    {
      transactionId: input.transactionId,
      step: "preflight-started",
      status: "projected",
      evidence: [
        "target-set-edit-journal:preflight-started",
        "target-set-edit-journal:raw-content-excluded",
      ],
    },
  ];

  if (input.plan.status === "blocked") {
    entries.push({
      transactionId: input.transactionId,
      step: "preflight-failed",
      ...(input.plan.targetPath ? { targetPath: input.plan.targetPath } : {}),
      status: "failed",
      reason: input.plan.reason,
      evidence: [
        `target-set-edit-journal:preflight-failed:${input.plan.blocker}`,
        "target-set-edit-journal:mutation:not-run",
        "target-set-edit-journal:raw-content-excluded",
      ],
    });
    return entries;
  }

  for (const target of input.plan.targets) {
    entries.push(
      {
        transactionId: input.transactionId,
        step: "authority-checked",
        targetPath: target.targetPath,
        status: "passed",
        evidence: [
          `target-set-edit-journal:authority-checked:${target.targetPath}`,
        ],
      },
      {
        transactionId: input.transactionId,
        step: "match-count-checked",
        targetPath: target.targetPath,
        status: "passed",
        evidence: [
          `target-set-edit-journal:match-count-checked:${target.targetPath}`,
        ],
      },
    );
  }

  entries.push({
    transactionId: input.transactionId,
    step: "preflight-passed",
    status: "passed",
    evidence: [
      "target-set-edit-journal:preflight-passed",
      "target-set-edit-journal:all-targets-before-first-write",
      "target-set-edit-journal:raw-content-excluded",
    ],
  });
  return entries;
}

export function buildTargetSetEditExecutionJournalEntry(input: {
  readonly transactionId: string;
  readonly targetPath: string;
  readonly step: Extract<
    TargetSetEditJournalStep,
    | "stale-read-checked"
    | "snapshot-captured"
    | "write-attempted"
    | "write-succeeded"
    | "write-failed"
    | "verification-projected"
    | "recovery-readiness-projected"
    | "rollback-applied"
  >;
  readonly status: TargetSetEditJournalEntry["status"];
  readonly reason?: string;
  readonly evidence?: readonly string[];
}): TargetSetEditJournalEntry {
  return {
    transactionId: input.transactionId,
    step: input.step,
    targetPath: input.targetPath,
    status: input.status,
    ...(input.reason ? { reason: input.reason } : {}),
    evidence: [
      `target-set-edit-journal:${input.step}:${input.targetPath}`,
      "target-set-edit-journal:raw-content-excluded",
      ...(input.evidence ?? []),
    ],
  };
}

export function projectTargetSetEditJournalEvidence(
  journal: readonly TargetSetEditJournalEntry[],
): readonly string[] {
  return [
    `target-set-edit-journal:entry-count:${journal.length}`,
    "target-set-edit-journal:safe",
    "target-set-edit-journal:raw-content-excluded",
    ...journal.flatMap((entry) => entry.evidence),
  ];
}
