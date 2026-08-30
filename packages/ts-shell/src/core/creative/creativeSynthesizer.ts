import type { DesignHypothesis, SynthesizedSolution } from "./types.js";
import { HypothesisGenerator } from "./hypothesisGenerator.js";
import { RedTeamChallenger } from "./redTeamChallenger.js";

/**
 * Creative Synthesizer
 * Synthesizes orthogonal design hypotheses and adversarial red-team critiques.
 * In live environments, leverages the active LLM provider for deep reasoning synthesis;
 * otherwise uses structured deterministic fallback heuristics.
 */
export class CreativeSynthesizer {
  public static async synthesize(
    problemStatement: string,
    options?: { readonly cwd?: string },
  ): Promise<SynthesizedSolution> {
    const hypotheses = HypothesisGenerator.generateHypotheses(problemStatement);
    const critiques = hypotheses.map((h) => RedTeamChallenger.critique(h));

    const minimalistHyp = hypotheses.find((h) => h.perspective === "boring-minimalist")!;
    const defensiveHyp = hypotheses.find((h) => h.perspective === "defensive-high-performance")!;
    const modularHyp = hypotheses.find((h) => h.perspective === "extensible-modular")!;
    const modularCritique = critiques.find((c) => c.hypothesisId === modularHyp.id) ?? critiques[0];

    let liveLlmExecutiveSummary = "";
    let liveLlmArchitectureSpec = "";

    const apiKey = process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || "";
    const baseUrl = process.env.SILICONFLOW_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const model = process.env.SILICONFLOW_API_KEY ? "deepseek-ai/DeepSeek-V4-Flash" : "gpt-4o-mini";

    if (apiKey && !process.env.VITEST && process.env.NODE_ENV !== "test") {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are a principal software architect. Given 3 design hypotheses (Boring Minimalist, Extensible Modular, Defensive High-Performance) and red-team critiques, produce a high-taste synthesized architecture specification.",
              },
              {
                role: "user",
                content: `Problem: ${problemStatement}\n\nHypotheses:\n1. ${minimalistHyp.title}: ${minimalistHyp.proposedArchitecture}\n2. ${modularHyp.title}: ${modularHyp.proposedArchitecture}\n3. ${defensiveHyp.title}: ${defensiveHyp.proposedArchitecture}\n\nSynthesize the single best architecture specification in concise markdown.`,
              },
            ],
            temperature: 0.5,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);
        if (res.ok) {
          const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            liveLlmArchitectureSpec = content;
            liveLlmExecutiveSummary = `AI-Synthesized multi-perspective architecture for "${problemStatement}".`;
          }
        }
      } catch {
        // Fallback to structured deterministic synthesis
      }
    }

    const keyDecisions = [
      "Adopt Plain TypeScript functions and native Map/Set primitives (zero unnecessary external dependencies).",
      "Incorporate defensive bound caps: explicit timeout guards and max-size safety limits.",
      "Refuse speculative plugin layers; expose standard typed extension points only where required.",
    ];

    const rejectedCompromises = [
      "Rejected heavyweight external npm libraries for tasks solvable with native ES2022 APIs.",
      `Rejected premature plugin abstraction (${modularCritique.challengeQuestions[0] || "unnecessary indirection"}).`,
      "Rejected unbounded data accumulation; enforced FIFO / sliding-window limits.",
    ];

    const implementationChecklist = [
      "1. Define clean contract interfaces in core/ types.ts",
      "2. Implement core engine logic in a single focused module (<= 20 functions)",
      "3. Add unit tests covering standard execution, edge cases, and timeout boundaries",
      "4. Verify acyclic module boundaries and run NormProof check",
    ];

    const fallbackSpec = [
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
    ].join("\n");

    return {
      challenge: problemStatement,
      selectedPerspective: "boring-minimalist",
      executiveSummary:
        liveLlmExecutiveSummary ||
        `Synthesized solution for "${problemStatement}" combining boring native minimalism with defensive bounds. Eliminates over-engineering while guaranteeing rock-solid stability.`,
      finalArchitectureSpec: liveLlmArchitectureSpec || fallbackSpec,
      keyDecisions,
      rejectedCompromises,
      implementationChecklist,
    };
  }
}
