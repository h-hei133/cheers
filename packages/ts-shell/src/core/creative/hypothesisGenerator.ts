import type { DesignHypothesis } from "./types.js";

/**
 * Multi-Perspective Hypothesis Generator
 * Generates 3 orthogonal design hypotheses:
 * 1. Boring Minimalist (Zero new dependencies, direct language native primitives, minimal code surface)
 * 2. Extensible Modular (Pluggable interfaces, event-driven decouplings, future-proof boundaries)
 * 3. Defensive High-Performance (Strict memory bounds, O(1) lookups, robust edge case isolation)
 */
export class HypothesisGenerator {
  public static generateHypotheses(problemStatement: string): readonly DesignHypothesis[] {
    const cleanProblem = problemStatement.trim();

    return [
      this.generateBoringMinimalist(cleanProblem),
      this.generateExtensibleModular(cleanProblem),
      this.generateDefensivePerformance(cleanProblem),
    ];
  }

  private static generateBoringMinimalist(problem: string): DesignHypothesis {
    return {
      id: "hyp_boring_minimalist",
      perspective: "boring-minimalist",
      title: "Boring Minimalist Native Implementation",
      corePhilosophy: "Delete weightless abstractions, zero external dependencies, plain TypeScript functions.",
      proposedArchitecture: `Solve "${problem}" using native Map/Set, plain pure functions, and direct file I/O. Reject complex class hierarchies and external packages.`,
      tradeOffs: {
        pros: [
          "Zero bundle bloat and zero external supply-chain risk",
          "Trivial to maintain, debug, and understand in 6 months",
          "Sub-millisecond cold start and execution",
        ],
        cons: [
          "Requires hand-coding domain algorithms rather than importing heavyweight libraries",
        ],
      },
      estimatedComplexity: "low",
      zeroDependencyScore: 1.0,
    };
  }

  private static generateExtensibleModular(problem: string): DesignHypothesis {
    return {
      id: "hyp_extensible_modular",
      perspective: "extensible-modular",
      title: "Pluggable & Extensible Modular Architecture",
      corePhilosophy: "Open-Closed Principle: Core engine is closed for modification, open for plugin extensions.",
      proposedArchitecture: `Decompose "${problem}" into a lightweight lifecycle interface with registered middleware adapters and hook listeners.`,
      tradeOffs: {
        pros: [
          "Allows third-party and ecosystem plugins to attach seamlessly",
          "Isolates optional features into self-contained drivers",
        ],
        cons: [
          "Slightly higher indirection and interface boilerplate",
        ],
      },
      estimatedComplexity: "medium",
      zeroDependencyScore: 0.85,
    };
  }

  private static generateDefensivePerformance(problem: string): DesignHypothesis {
    return {
      id: "hyp_defensive_performance",
      perspective: "defensive-high-performance",
      title: "Defensive High-Performance Architecture",
      corePhilosophy: "Zero avoidable allocations, fail-closed boundaries, and strict memory/timeout bounds.",
      proposedArchitecture: `Design "${problem}" with bounded circular buffers, deterministic O(1) indices, explicit timeout guards, and strict input validation schemas.`,
      tradeOffs: {
        pros: [
          "Immune to runaway memory growth and event-loop blocking",
          "Rock-solid edge case resilience and auditability",
        ],
        cons: [
          "Requires upfront buffer sizing and explicit capacity limits",
        ],
      },
      estimatedComplexity: "medium",
      zeroDependencyScore: 0.95,
    };
  }
}
