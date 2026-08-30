import type { CommandContext, LocalCommandResult } from "./types.js";
import { CreativeSynthesizer } from "../creative/creativeSynthesizer.js";
import { HypothesisGenerator } from "../creative/hypothesisGenerator.js";
import { RedTeamChallenger } from "../creative/redTeamChallenger.js";

/**
 * /brainstorm & /explore command
 * Explores multiple orthogonal architectural perspectives, runs adversarial red-team critiques,
 * and synthesizes an optimal, high-taste technical specification.
 */
export async function runBrainstormCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const challenge = args.join(" ").trim();

  if (!challenge || challenge === "--help" || challenge === "-h") {
    return {
      kind: "local",
      output: [
        "# Architectural Brainstorming & Creative Synthesis (/brainstorm)",
        "",
        "Explores 3 orthogonal design perspectives (Boring Minimalist, Extensible Modular, Defensive Performance),",
        "executes adversarial Red-Team critique against over-engineering, and synthesizes an optimal architecture.",
        "",
        "Usage:",
        "- `/brainstorm <problem or feature description>`",
        "",
        "Examples:",
        "- `/brainstorm In-memory cache with eviction and persistence`",
        "- `/brainstorm WebSocket connection pool with reconnection backoff`",
        "- `/brainstorm Token bucket rate limiter with sliding window`",
      ].join("\n"),
    };
  }

  const solution = CreativeSynthesizer.synthesize(challenge);
  const hypotheses = HypothesisGenerator.generateHypotheses(challenge);

  const lines: string[] = [
    `# Creative Design Synthesis: ${challenge}`,
    "",
    `> **Executive Summary**: ${solution.executiveSummary}`,
    "",
    "## 1. Multi-Perspective Hypotheses Evaluated",
    "",
  ];

  hypotheses.forEach((h, idx) => {
    const critique = RedTeamChallenger.critique(h);
    lines.push(`### 1.${idx + 1}. [${h.perspective.toUpperCase()}] ${h.title}`);
    lines.push(`- **Philosophy**: ${h.corePhilosophy}`);
    lines.push(`- **Pros**: ${h.tradeOffs.pros.join("; ")}`);
    lines.push(`- **Cons**: ${h.tradeOffs.cons.join("; ")}`);
    lines.push(`- **Red-Team Challenge**: ${critique.challengeQuestions[0]}`);
    lines.push(`- **Over-engineering Risk Score**: ${(critique.overEngineeringScore * 100).toFixed(0)}%`);
    lines.push("");
  });

  lines.push("## 2. Synthesized Architecture & Key Decisions");
  lines.push("");
  solution.keyDecisions.forEach((d) => lines.push(`- ✅ ${d}`));
  lines.push("");

  lines.push("## 3. Explicitly Rejected Anti-Patterns");
  lines.push("");
  solution.rejectedCompromises.forEach((r) => lines.push(`- 🚫 ${r}`));
  lines.push("");

  lines.push("## 4. Implementation Checklist");
  lines.push("");
  solution.implementationChecklist.forEach((step) => lines.push(`- [ ] ${step}`));
  lines.push("");

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}
