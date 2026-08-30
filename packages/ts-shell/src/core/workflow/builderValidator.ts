export interface BuilderOutput {
  readonly solution: string;
  readonly modifiedFiles: readonly string[];
  readonly executionLogs?: readonly string[];
}

export interface ValidationCriterion {
  readonly id: string;
  readonly description: string;
  readonly required: boolean;
}

export interface ValidationReport {
  readonly passed: boolean;
  readonly criteriaResults: Array<{
    readonly criterionId: string;
    readonly passed: boolean;
    readonly observation: string;
  }>;
  readonly overallFeedback: string;
  readonly detectedIssues: readonly string[];
}

export type BuilderFn = (taskPrompt: string) => Promise<BuilderOutput>;
export type ValidatorFn = (
  solution: BuilderOutput,
  criteria: readonly ValidationCriterion[],
) => Promise<ValidationReport>;

/**
 * Builder-Validator Pipeline
 * Decouples the Agent that writes code from the Agent that validates it.
 * The Validator only inspects the final output/diff and acceptance criteria,
 * preventing 'self-grading' bias and catching silent gray errors.
 */
export class BuilderValidatorPipeline {
  public static async execute(
    taskPrompt: string,
    criteria: readonly ValidationCriterion[],
    builder: BuilderFn,
    validator: ValidatorFn,
  ): Promise<{
    builderOutput: BuilderOutput;
    validationReport: ValidationReport;
    success: boolean;
  }> {
    // 1. Builder execution
    const builderOutput = await builder(taskPrompt);

    // 2. Independent Validator execution (without builder internal reasoning)
    const validationReport = await validator(builderOutput, criteria);

    const success =
      validationReport.passed &&
      validationReport.criteriaResults.every((c) => (c.passed ? true : !criteria.find((cr) => cr.id === c.criterionId)?.required));

    return {
      builderOutput,
      validationReport,
      success,
    };
  }
}
