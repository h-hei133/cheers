export type ResearchMode = 'software' | 'paper' | 'mixed';
export interface ResearchRequest {
  readonly question: string;
  readonly mode?: ResearchMode;
  readonly depth: 'quick' | 'deep';
  readonly briefPath?: string;
  readonly save: boolean;
  /** User-selected methods are immutable instructions, separate from retrieved evidence. */
  readonly methods?: {
    readonly originalInput: string;
    readonly skills: readonly import('../../core/prompts/skills.js').SkillInstruction[];
    readonly modifiers: readonly { readonly name: string; readonly instruction: string }[];
  };
}
export interface ResearchBrief {
  readonly revision: number;
  readonly question: string;
  readonly mode: ResearchMode;
  readonly questions: readonly { readonly id: string; readonly text: string }[];
  /** Requested applicability, never proof that a source actually meets it. */
  readonly anchors: { readonly versions: readonly string[]; readonly platforms: readonly string[]; readonly conditions: readonly string[] };
  readonly scope: string;
  readonly exclusions: readonly string[];
}

export const researchLimits = {
  quick: { deadlineMs: 5 * 60_000, investigationSteps: 8, rounds: 2, reviewSteps: 5, fragments: 3 },
  deep: { deadlineMs: 15 * 60_000, investigationSteps: 16, rounds: 3, reviewSteps: 8, fragments: 6 },
} as const;
