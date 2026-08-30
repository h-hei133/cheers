export interface ProposedDefect {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly filePath?: string;
  readonly severity: "critical" | "high" | "medium" | "low";
}

export interface RefutationResult {
  readonly defectId: string;
  readonly isRefuted: boolean;
  readonly refutationReason: string;
  readonly confidence: number;
}

export interface ConfirmedDefectReport {
  readonly totalProposed: number;
  readonly totalRefuted: number;
  readonly confirmedDefects: readonly ProposedDefect[];
  readonly refutationLogs: readonly RefutationResult[];
}

export type ReviewerFn = (diffOrCode: string) => Promise<readonly ProposedDefect[]>;
export type RefuterFn = (defect: ProposedDefect, diffOrCode: string) => Promise<RefutationResult>;

/**
 * Adversarial Refuter Pipeline
 * Inspired by Oh My Pi's Adversarial Verification:
 * 1. Reviewer proposes suspected defects / issues.
 * 2. Refuter independently attempts to disprove or refute each defect against codebase ground truth.
 * 3. Only defects that cannot be refuted are confirmed as actionable issues, eliminating false positives.
 */
export class AdversarialRefuterPipeline {
  public static async evaluate(
    diffOrCode: string,
    reviewer: ReviewerFn,
    refuter: RefuterFn,
  ): Promise<ConfirmedDefectReport> {
    // 1. Propose potential defects
    const proposed = await reviewer(diffOrCode);
    if (proposed.length === 0) {
      return {
        totalProposed: 0,
        totalRefuted: 0,
        confirmedDefects: [],
        refutationLogs: [],
      };
    }

    // 2. Concurrently attempt to refute each defect
    const refutationLogs = await Promise.all(
      proposed.map((defect) => refuter(defect, diffOrCode)),
    );

    // 3. Filter for unrefuted confirmed defects
    const confirmedDefects = proposed.filter((defect) => {
      const log = refutationLogs.find((r) => r.defectId === defect.id);
      return log ? !log.isRefuted : true;
    });

    return {
      totalProposed: proposed.length,
      totalRefuted: proposed.length - confirmedDefects.length,
      confirmedDefects,
      refutationLogs,
    };
  }
}
