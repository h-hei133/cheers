import {
  buildContextPlanningSummary,
  type ContextPlanningSummary,
} from "./contextPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import { projectRuntimeCodingOutcome, type RuntimeOutcomeProjection } from "../../result/projection/runtimeOutcomeProjection.js";

export type ContextPacketTerminalOutcome =
  | "context-packet-created"
  | "context-packet-partial"
  | "missing-target"
  | "no-related-context-found"
  | "needs-more-context-before-planning"
  | "unsupported-broad-planning-request";

export interface ContextPacketResultProjection {
  readonly outcome: ContextPacketTerminalOutcome;
  readonly packet: TargetedContextPacket;
  readonly plan: ContextPlanningSummary;
  readonly output: string;
  readonly evidence: readonly string[];
}

export function buildContextPacketResult(
  packet: TargetedContextPacket,
): ContextPacketResultProjection {
  const plan = buildContextPlanningSummary(packet);
  const outcome: ContextPacketTerminalOutcome =
    packet.completenessStatus === "complete"
      ? "context-packet-created"
      : packet.selectedCandidateSummaries.length <= 1
        ? "no-related-context-found"
        : "context-packet-partial";
  const omittedByReason = countOmittedReasons(packet);
  const output = [
    `Context packet: ${outcome}`,
    `Target: ${packet.targetSafeLabel}`,
    `Included sources: ${packet.selectedCandidateSummaries.length}`,
    `Omitted sources: ${packet.omittedCandidateSummaries.length}`,
    `Omitted reasons: ${omittedByReason || "none"}`,
    `Planning readiness: ${plan.executionReadiness}`,
    `Suggested reads: ${plan.suggestedNextReads.join(", ") || "none"}`,
    "Mutation authority: not-granted",
  ].join("\n");
  return {
    outcome,
    packet,
    plan,
    output,
    evidence: [
      ...packet.evidence,
      ...plan.evidence,
      `context-packet-result:${outcome}`,
      packet.replaySafeSummary,
      plan.replaySafeSummary,
    ],
  };
}

export function projectContextPacketRuntimeOutcome(input: {
  readonly packet: TargetedContextPacket;
  readonly reason?: string;
}): RuntimeOutcomeProjection {
  const result = buildContextPacketResult(input.packet);
  const stopped =
    result.plan.executionReadiness !== "ready" ||
    result.outcome === "no-related-context-found";
  const reason =
    input.reason ??
    (stopped
      ? "Context packet needs more related reads before planning or mutation."
      : "Context packet created for planning.");
  return projectRuntimeCodingOutcome({
    taskKind: "read-file",
    changedFiles: [],
    failedFiles: stopped
      ? [{ path: input.packet.rootTargetFile, reason }]
      : [],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "not-requested",
      reason: "read-only context packet",
      selectionScope: "none",
      selectionSource: "not-requested",
    },
    repairNotes: [reason],
    evidence: [...result.evidence],
    taskVerdict: stopped ? "insufficient-evidence" : "satisfied",
    taskReasons: [reason],
    userFacingOutput: result.output,
  });
}

function countOmittedReasons(packet: TargetedContextPacket): string {
  const counts = new Map<string, number>();
  for (const source of packet.omittedCandidateSummaries) {
    const reason = source.reason ?? "omitted";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => `${reason}:${count}`)
    .join(", ");
}
