/**
 * Creative Reasoning & Multi-Hypothesis Types
 * Contracts for orthogonal design perspectives, adversarial challenges, and synthesized architectures.
 */

export type DesignPerspectiveKind =
  | "boring-minimalist"
  | "extensible-modular"
  | "defensive-high-performance";

export interface DesignHypothesis {
  readonly id: string;
  readonly perspective: DesignPerspectiveKind;
  readonly title: string;
  readonly corePhilosophy: string;
  readonly proposedArchitecture: string;
  readonly tradeOffs: {
    readonly pros: readonly string[];
    readonly cons: readonly string[];
  };
  readonly estimatedComplexity: "low" | "medium" | "high";
  readonly zeroDependencyScore: number; // 0.0 - 1.0
}

export interface RedTeamCritique {
  readonly hypothesisId: string;
  readonly antiPatternRisks: readonly string[];
  readonly overEngineeringScore: number; // 0.0 (clean) - 1.0 (bloated)
  readonly edgeCaseVulnerabilities: readonly string[];
  readonly challengeQuestions: readonly string[];
  readonly refactoredRecommendation: string;
}

export interface SynthesizedSolution {
  readonly challenge: string;
  readonly selectedPerspective: DesignPerspectiveKind;
  readonly executiveSummary: string;
  readonly finalArchitectureSpec: string;
  readonly keyDecisions: readonly string[];
  readonly rejectedCompromises: readonly string[];
  readonly implementationChecklist: readonly string[];
  readonly codeScaffoldSnippet?: string;
}
