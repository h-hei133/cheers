import type { DesignHypothesis, RedTeamCritique } from "./types.js";

/**
 * Red-Team Challenger (Momus / Adversarial Critic)
 * Critically reviews each design hypothesis, uncovering over-engineering, hidden traps,
 * leaky abstractions, and single-point-of-failure risks.
 */
export class RedTeamChallenger {
  public static critique(hypothesis: DesignHypothesis): RedTeamCritique {
    switch (hypothesis.perspective) {
      case "boring-minimalist":
        return {
          hypothesisId: hypothesis.id,
          antiPatternRisks: [
            "Risk of 'Not Invented Here' (NIH) if recreating complex RFC specs from scratch without verification",
          ],
          overEngineeringScore: 0.1,
          edgeCaseVulnerabilities: [
            "Edge cases in string manipulation or unicode parsing if hand-rolled naively",
          ],
          challengeQuestions: [
            "Will future requirement changes require rewiring every caller due to lack of extension hooks?",
            "Are error states and boundary conditions handled deterministically?",
          ],
          refactoredRecommendation:
            "Adopt the minimalist core, but define strict typed boundary interfaces to isolate callers from implementation details.",
        };

      case "extensible-modular":
        return {
          hypothesisId: hypothesis.id,
          antiPatternRisks: [
            "Premature abstraction: creating plugin registries and lifecycle hooks before having 2+ real consumers",
            "Weightless layers: intermediate adapter classes that do nothing except pass calls through",
          ],
          overEngineeringScore: 0.7,
          edgeCaseVulnerabilities: [
            "Plugin execution error propagation escaping sandbox boundaries",
          ],
          challengeQuestions: [
            "Do we really have more than one implementation consumer today?",
            "Can we delete 50% of the proposed interfaces without losing capability?",
          ],
          refactoredRecommendation:
            "Refuse unnecessary adapter layers. Implement directly first; extract hooks only at genuine extension boundaries.",
        };

      case "defensive-high-performance":
        return {
          hypothesisId: hypothesis.id,
          antiPatternRisks: [
            "Premature optimization: tuning buffer sizes and bitmasks for low-throughput code paths",
          ],
          overEngineeringScore: 0.4,
          edgeCaseVulnerabilities: [
            "Buffer overflow or silent drops if circular buffer capacity is undersized under burst traffic",
          ],
          challengeQuestions: [
            "Is the throughput high enough to warrant circular buffers over standard arrays with length caps?",
          ],
          refactoredRecommendation:
            "Retain the bounded timeout and memory caps, but use simple array slices with max bounds instead of complex circular data structures.",
        };
    }
  }
}
