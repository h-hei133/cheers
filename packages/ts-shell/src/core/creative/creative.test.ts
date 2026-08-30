import { describe, it, expect } from "vitest";
import { HypothesisGenerator } from "./hypothesisGenerator.js";
import { RedTeamChallenger } from "./redTeamChallenger.js";
import { CreativeSynthesizer } from "./creativeSynthesizer.js";
import { runBrainstormCommand } from "../commands/brainstormCommandRuntime.js";
import { routeSlashCommand } from "../commands/slashRouter.js";

describe("Creative Reasoning & Multi-Hypothesis Exploration Test Suite", () => {
  const sampleProblem = "Thread-safe event emitter with priority queues";

  describe("HypothesisGenerator", () => {
    it("generates 3 orthogonal design perspectives", () => {
      const hypotheses = HypothesisGenerator.generateHypotheses(sampleProblem);

      expect(hypotheses.length).toBe(3);
      expect(hypotheses.some((h) => h.perspective === "boring-minimalist")).toBe(true);
      expect(hypotheses.some((h) => h.perspective === "extensible-modular")).toBe(true);
      expect(hypotheses.some((h) => h.perspective === "defensive-high-performance")).toBe(true);

      const minimalist = hypotheses.find((h) => h.perspective === "boring-minimalist")!;
      expect(minimalist.zeroDependencyScore).toBe(1.0);
      expect(minimalist.corePhilosophy).toContain("Delete weightless abstractions");
    });
  });

  describe("RedTeamChallenger (Momus Adversarial Critique)", () => {
    it("flags over-engineering risk in extensible-modular hypothesis", () => {
      const hypotheses = HypothesisGenerator.generateHypotheses(sampleProblem);
      const modular = hypotheses.find((h) => h.perspective === "extensible-modular")!;
      const critique = RedTeamChallenger.critique(modular);

      expect(critique.overEngineeringScore).toBeGreaterThanOrEqual(0.6);
      expect(critique.antiPatternRisks.some((r) => r.includes("Premature abstraction"))).toBe(true);
      expect(critique.challengeQuestions.length).toBeGreaterThan(0);
    });

    it("evaluates boring minimalist with low over-engineering score", () => {
      const hypotheses = HypothesisGenerator.generateHypotheses(sampleProblem);
      const minimalist = hypotheses.find((h) => h.perspective === "boring-minimalist")!;
      const critique = RedTeamChallenger.critique(minimalist);

      expect(critique.overEngineeringScore).toBeLessThanOrEqual(0.2);
    });
  });

  describe("CreativeSynthesizer", () => {
    it("synthesizes an optimal high-taste solution with key decisions and checklist", () => {
      const solution = CreativeSynthesizer.synthesize(sampleProblem);

      expect(solution.challenge).toBe(sampleProblem);
      expect(solution.selectedPerspective).toBe("boring-minimalist");
      expect(solution.keyDecisions.length).toBeGreaterThanOrEqual(3);
      expect(solution.rejectedCompromises.length).toBeGreaterThanOrEqual(3);
      expect(solution.implementationChecklist.length).toBeGreaterThanOrEqual(4);
      expect(solution.finalArchitectureSpec).toContain("# Architecture Specification");
    });
  });

  describe("/brainstorm & /explore Slash Command Integration", () => {
    it("renders usage help when invoked without arguments", async () => {
      const res = await runBrainstormCommand([], { cwd: process.cwd() });
      expect(res.kind).toBe("local");
      expect(res.output).toContain("# Architectural Brainstorming & Creative Synthesis (/brainstorm)");
      expect(res.output).toContain("Usage:");
    });

    it("executes creative design synthesis and routes via slashRouter", async () => {
      const routed = await routeSlashCommand(
        "/brainstorm Token bucket rate limiter with sliding window",
        { cwd: process.cwd() },
      );

      expect(routed?.kind).toBe("local");
      if (routed?.kind === "local") {
        expect(routed.output).toContain("Creative Design Synthesis");
        expect(routed.output).toContain("Multi-Perspective Hypotheses Evaluated");
        expect(routed.output).toContain("Synthesized Architecture & Key Decisions");
      }
    });
  });
});
