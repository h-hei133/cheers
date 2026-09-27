import type { CodingResultSummary } from "../../result/types.js";

/**
 * The verification targets a completed run leaves behind, projected for the
 * session's task state.
 *
 * The builder this module used to carry — the one that assembled a verification
 * command from agent plans, impact queries and quality gates — was never called;
 * the plan types it produced were consumed only by its own tests. What survived
 * was this projection, which the session's continuity snapshot reads on every
 * completed turn, and the shape it returns is the part that is live.
 */

export interface TaskStateVerificationPlanProjection {
  readonly command?: string;
  readonly targetFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly status?: string;
  readonly nextAction?: string;
}

export function projectTaskStateVerificationPlan(
  result: CodingResultSummary,
): TaskStateVerificationPlanProjection {
  const command = result.verification.command?.trim();
  return {
    ...(command ? { command } : {}),
    targetFiles: uniquePlanValues([
      ...result.changedFiles,
      ...result.changeSet.changedFiles,
      ...result.verifiedFiles,
      ...result.unverifiedFiles.map((file) => file.path),
      ...result.failedFiles.map((file) => file.path),
      ...(command ? inferCommandTargets(command) : []),
    ]),
    failedFiles: uniquePlanValues(result.failedFiles.map((file) => file.path)),
    ...(result.verification.status ? { status: result.verification.status } : {}),
    ...(result.verification.nextAction ? { nextAction: result.verification.nextAction } : {}),
  };
}

/**
 * Test and build entry points named on the command line, so a plan can name the
 * files a verification run would touch without running anything.
 */
function inferCommandTargets(command: string): readonly string[] {
  return uniquePlanValues(
    command.split(/\s+/).filter((part) => /\.[cm]?[tj]sx?$|\.test\.[cm]?[tj]sx?$/.test(part)),
  );
}

function uniquePlanValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))];
}
