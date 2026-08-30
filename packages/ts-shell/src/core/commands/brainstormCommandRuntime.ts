import type { CommandContext, LocalCommandResult } from "./types.js";
import { CreativeSynthesizer } from "../creative/creativeSynthesizer.js";
import { HypothesisGenerator } from "../creative/hypothesisGenerator.js";
import { RedTeamChallenger } from "../creative/redTeamChallenger.js";
import { executeMemoryRetain } from "../memory/memoryTools.js";
import fs from "node:fs";
import path from "node:path";

/**
 * /brainstorm & /explore command
 * Explores multiple orthogonal architectural perspectives, runs adversarial red-team critiques,
 * supports interactive Socratic requirement elicitation (-i), and persists ADR specs (-s).
 */
export async function runBrainstormCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const flags = new Set<string>();
  const positionalArgs: string[] = [];

  for (const arg of args) {
    if (arg === "-i" || arg === "--interactive") {
      flags.add("interactive");
    } else if (arg === "-s" || arg === "--save") {
      flags.add("save");
    } else if (arg.startsWith("-")) {
      flags.add(arg);
    } else {
      positionalArgs.push(arg);
    }
  }

  const challenge = positionalArgs.join(" ").trim();

  if (!challenge || flags.has("--help") || flags.has("-h")) {
    return {
      kind: "local",
      output: [
        "# Architectural Brainstorming & Creative Synthesis (/brainstorm)",
        "",
        "Explores 3 orthogonal design perspectives (Boring Minimalist, Extensible Modular, Defensive Performance),",
        "executes adversarial Red-Team critique against over-engineering, and synthesizes an optimal architecture.",
        "",
        "Usage:",
        "- `/brainstorm <topic>` : Fast synthesis (3 perspectives + Momus critique + ADR spec)",
        "- `/brainstorm -i <topic>` : Interactive Socratic requirement & boundary elicitation",
        "- `/brainstorm -s <topic>` : Synthesize and save ADR design doc to docs/specs/ and QuadMemory",
        "",
        "Examples:",
        "- `/brainstorm In-memory cache with eviction and persistence`",
        "- `/brainstorm -i Multi-tenant rate limiter with sliding window`",
        "- `/brainstorm -s WebSocket connection pool with reconnection backoff`",
      ].join("\n"),
    };
  }

  // 1. Interactive Socratic Mode (Inspired by Superpowers brainstorming protocol)
  if (flags.has("interactive")) {
    return {
      kind: "local",
      output: generateSocraticQuestionnaire(challenge),
    };
  }

  // 2. Default & Save Mode: Generate Full Synthesis
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

  // 3. Save Mode: Persist ADR and retain in QuadMemory
  if (flags.has("save")) {
    const rawSlug = challenge.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const slug = rawSlug || `spec-${Date.now()}`;
    const specsDir = path.join(context.cwd, "docs", "specs");
    const filePath = path.join(specsDir, `${slug}-design.md`);

    try {
      fs.mkdirSync(specsDir, { recursive: true });
      fs.writeFileSync(filePath, lines.join("\n"), "utf8");

      // Retain key architecture decision in QuadMemory
      await executeMemoryRetain({
        items: [
          {
            statement: `Architecture decision for '${challenge}': ${solution.keyDecisions[0]}`,
            category: "architecture",
            scope: "project",
          },
        ],
      });

      lines.push(
        "---",
        `💾 **Spec Saved**: \`${path.relative(context.cwd, filePath)}\``,
        `🧠 **Retained in QuadMemory**: Architecture rule retained in project memory bank.`,
      );
    } catch {
      lines.push("---", `⚠️ Could not write spec file to disk.`);
    }
  }

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}

function generateSocraticQuestionnaire(challenge: string): string {
  const lines: string[] = [
    `# Socratic Design Exploration: ${challenge}`,
    "",
    "To build the cleanest, highest-taste architecture, answer or refine the following 3 core questions:",
    "",
    "### 1. Scope & Primary Purpose",
    "- What is the single most important user/system outcome this feature must deliver?",
    "- Is this a standalone utility, or does it need to integrate deeply with existing pipelines?",
    "",
    "### 2. Boundaries & Non-Goals (YAGNI)",
    "- What is explicitly OUT of scope for the first iteration?",
    "- Are you optimizing for zero-dependencies, maximum extensibility, or microsecond throughput?",
    "",
    "### 3. Verification & Observable Contract",
    "- How will we verify correctness deterministically (e.g. Unit tests, benchmarks, integration scenarios)?",
    "",
    "### Suggested Initial Approaches:",
    "1. **Option A (Minimalist)**: Plain TypeScript pure functions + native data structures (Recommended)",
    "2. **Option B (Modular)**: Pluggable middleware and registered hook listeners",
    "3. **Option C (Defensive)**: Bounded memory buffers with strict timeout guards",
    "",
    "Reply with your preferences or run `/brainstorm " + challenge + "` for instant synthesis.",
  ];

  return lines.join("\n");
}
