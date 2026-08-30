import type { SynthesizedSolution } from "./types.js";
import { HypothesisGenerator } from "./hypothesisGenerator.js";
import { RedTeamChallenger } from "./redTeamChallenger.js";

/**
 * Creative Synthesizer
 * Synthesizes the 3 orthogonal design hypotheses and their red-team critiques
 * into an optimal, high-taste, zero-fluff architecture specification.
 */
export class CreativeSynthesizer {
  public static synthesize(problemStatement: string): SynthesizedSolution {
    const hypotheses = HypothesisGenerator.generateHypotheses(problemStatement);
    const critiques = hypotheses.map((h) => RedTeamChallenger.critique(h));

    // Find the best synthesis: prefer Minimalist core + Defensive bounded safety
    const minimalistHyp = hypotheses.find((h) => h.perspective === "boring-minimalist")!;
    const defensiveHyp = hypotheses.find((h) => h.perspective === "defensive-high-performance")!;
    const modularHyp = hypotheses.find((h) => h.perspective === "extensible-modular")!;
    const modularCritique = critiques.find((c) => c.hypothesisId === modularHyp.id) ?? critiques[0];
    const keyDecisions = [
      "Adopt Plain TypeScript functions and native Map/Set primitives (zero external dependencies).",
      "Incorporate defensive bound caps: explicit timeout guards and max-size safety limits.",
      "Refuse speculative plugin layers; expose standard typed extension points only where required.",
    ];

    const rejectedCompromises = [
      "Rejected heavyweight external npm libraries for tasks solvable with native ES2022 APIs.",
      `Rejected premature plugin abstraction (${modularCritique.challengeQuestions[0]}).`,
      "Rejected unbounded data accumulation; enforced FIFO / sliding-window limits.",
    ];

    const implementationChecklist = [
      `1. Define clean contract interfaces in core/ types.ts`,
      `2. Implement core engine logic in a single focused module (<= 20 functions)`,
      `3. Add unit tests covering standard execution, edge cases, and timeout boundaries`,
      `4. Verify acyclic module boundaries and run NormProof check`,
    ];

    return {
      challenge: problemStatement,
      selectedPerspective: "boring-minimalist",
      executiveSummary: `Synthesized solution for "${problemStatement}" combining boring native minimalism with defensive bounds. Eliminates over-engineering while guaranteeing rock-solid stability.`,
      finalArchitectureSpec: [
        `# Architecture Specification: ${problemStatement}`,
        "",
        `## 1. Core Philosophy`,
        minimalistHyp.corePhilosophy,
        "",
        `## 2. Defensive Safeguards`,
        defensiveHyp.corePhilosophy,
        "",
        `## 3. Structural Breakdown`,
        minimalistHyp.proposedArchitecture,
      ].join("\n"),
      keyDecisions,
      rejectedCompromises,
      implementationChecklist,
    };
  }
}
