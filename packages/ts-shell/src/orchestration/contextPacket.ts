import crypto from "node:crypto";
import path from "node:path";

import {
  discoverTargetedContext,
  type ContextCandidateKind,
  type ContextDiscoveryResult,
  type ContextDiscoveredSource,
} from "./contextDiscovery.js";
import type { ContextBudgetLimits } from "./contextBudget.js";

export type ContextPacketSourceKind =
  | "target-file-summary"
  | "direct-import"
  | "sibling-file"
  | "nearby-test"
  | "docs-readme-reference"
  | "call-site-candidate"
  | "omitted-over-budget-candidate"
  | "unavailable-source";

export interface ContextPacketSourceSummary {
  readonly kind: ContextPacketSourceKind;
  readonly pathLabel: string;
  readonly relation: string;
  readonly status: "included" | "omitted";
  readonly reason?: string;
  readonly summary?: string;
  readonly byteLength: number;
  readonly redactionApplied: boolean;
}

export interface TargetedContextPacket {
  readonly packetId: string;
  readonly rootTargetFile: string;
  readonly targetSafeLabel: string;
  readonly targetKind: "explicit-code-target";
  readonly readBudget: ContextDiscoveryResult["budget"];
  readonly contextSources: readonly ContextPacketSourceSummary[];
  readonly selectedCandidateSummaries: readonly ContextPacketSourceSummary[];
  readonly omittedCandidateSummaries: readonly ContextPacketSourceSummary[];
  readonly confidence: "high" | "medium" | "low";
  readonly completenessStatus: "complete" | "partial" | "missing-context";
  readonly freshnessFacts: readonly string[];
  readonly redactionStatus: "redacted-and-budgeted";
  readonly replaySafeSummary: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export async function buildTargetedContextPacket(input: {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly limits?: Partial<ContextBudgetLimits>;
}): Promise<TargetedContextPacket> {
  const discovery = await discoverTargetedContext(input);
  const contextSources = discovery.sources.map(projectSourceSummary);
  const selectedCandidateSummaries = contextSources.filter(
    (source) => source.status === "included",
  );
  const omittedCandidateSummaries = contextSources.filter(
    (source) => source.status === "omitted",
  );
  const completenessStatus =
    selectedCandidateSummaries.length <= 1
      ? "missing-context"
      : omittedCandidateSummaries.length > 0
        ? "partial"
        : "complete";
  const confidence =
    completenessStatus === "complete"
      ? "high"
      : completenessStatus === "partial"
        ? "medium"
        : "low";
  const packetId = buildPacketId(discovery);
  const replaySafeSummary = [
    `context-packet ${packetId}`,
    `target=${discovery.targetLabel}`,
    `included=${selectedCandidateSummaries.length}`,
    `omitted=${omittedCandidateSummaries.length}`,
    `confidence=${confidence}`,
    "mutationAuthority=not-granted",
  ].join("; ");

  return {
    packetId,
    rootTargetFile: path.relative(path.resolve(input.workspaceRoot), discovery.targetPath) || discovery.targetPath,
    targetSafeLabel: discovery.targetLabel,
    targetKind: "explicit-code-target",
    readBudget: discovery.budget,
    contextSources,
    selectedCandidateSummaries,
    omittedCandidateSummaries,
    confidence,
    completenessStatus,
    freshnessFacts: [
      "context-freshness:read-during-current-turn",
      "context-freshness:no-stale-read-authority",
    ],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary,
    mutationAuthority: "not-granted",
    evidence: [
      ...discovery.evidence,
      `context-packet:id:${packetId}`,
      `context-packet:target:${discovery.targetLabel}`,
      `context-packet:completeness:${completenessStatus}`,
      "context-packet:redacted-and-budgeted",
      "context-packet:raw-full-content-excluded",
      "context-packet:mutation-authority:not-granted",
      `context-packet:replay-safe:${packetId}`,
    ],
  };
}

function projectSourceSummary(
  source: ContextDiscoveredSource,
): ContextPacketSourceSummary {
  const status = source.decision === "included" ? "included" : "omitted";
  return {
    kind: mapSourceKind(source.kind, source.decision),
    pathLabel: source.safeLabel,
    relation: source.relation,
    status,
    byteLength: source.byteLength,
    redactionApplied: source.redactionApplied,
    ...(source.summary && status === "included" ? { summary: source.summary } : {}),
    ...(status === "omitted"
      ? { reason: source.reason ?? source.decision }
      : {}),
  };
}

function mapSourceKind(
  kind: ContextCandidateKind,
  decision: ContextDiscoveredSource["decision"],
): ContextPacketSourceKind {
  if (decision !== "included") {
    if (
      decision === "omitted-over-file-budget" ||
      decision === "omitted-over-total-budget"
    ) {
      return "omitted-over-budget-candidate";
    }
    return "unavailable-source";
  }
  switch (kind) {
    case "target-file":
      return "target-file-summary";
    case "direct-import":
      return "direct-import";
    case "sibling-file":
      return "sibling-file";
    case "nearby-test":
      return "nearby-test";
    case "docs-readme":
      return "docs-readme-reference";
    case "call-site":
      return "call-site-candidate";
  }
}

function buildPacketId(discovery: ContextDiscoveryResult): string {
  const payload = JSON.stringify({
    target: discovery.targetLabel,
    sources: discovery.sources.map((source) => [
      source.kind,
      source.safeLabel,
      source.decision,
      source.byteLength,
    ]),
  });
  return `ctx_${crypto.createHash("sha256").update(payload).digest("hex").slice(0, 12)}`;
}

