import { EDIT_CAPABILITY_CLOSEOUT_MANIFEST } from "../../orchestration/patchResult/editCapabilityCloseoutManifest.js";
import { listEditCapabilityReadiness } from "../../orchestration/patchResult/editCapabilityReadiness.js";
import { renderCompactHandoffMarkdown } from "./compactHandoffRenderer.js";
import type { CompactContinuityPacketSource } from "./compactContinuityPacket.js";
import {
  normalizeCompactCommandRequest,
  type CompactCommandRequest,
  type CompactCommandRequestInput,
} from "./compactCommandContract.js";
import { extractProjectMemoryCandidates } from "./projectMemoryCandidateExtractor.js";
import type { ProjectMemoryCandidate } from "./projectMemoryCandidate.js";
import {
  evaluateProjectMemoryCandidateQuality,
  type ProjectMemoryCandidateQualityResult,
} from "./projectMemoryCandidateQuality.js";
import { buildRouteContinuityHandoffPacket } from "./routeContinuityHandoff.js";

export interface CompactCommandRunResult {
  readonly request: CompactCommandRequest;
  readonly packet: ReturnType<typeof buildRouteContinuityHandoffPacket>;
  readonly memoryCandidates: readonly ProjectMemoryCandidate[];
  readonly memoryCandidateQuality: ProjectMemoryCandidateQualityResult;
  readonly markdown?: string;
  readonly json?: string;
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly recoveryExecution: "none";
}

export function runCompactCommand(
  input: CompactCommandRequestInput | CompactCommandRequest,
): CompactCommandRunResult {
  const request = normalizeCompactCommandRequest(input);
  const packet = buildRouteContinuityHandoffPacket({
    generatedAt: request.generatedAt,
    source: toPacketSource(request.source),
    route: request.routeInfo,
    project: request.projectInfo,
    taskGoal: request.taskGoal,
    editCapabilityCloseoutManifest: EDIT_CAPABILITY_CLOSEOUT_MANIFEST,
    editCapabilityReadiness: listEditCapabilityReadiness(),
    contextProjectionInput: {
      ...(request.mutationEvidence
        ? { mutationEvidence: request.mutationEvidence }
        : {}),
    },
    recoverySurfaceSummary: request.recoverySummary,
    validation: request.validationEvidence,
    secretValues: request.secretValues,
    unsafeInputs: request.unsafeInputs,
  });
  const memoryCandidates = extractProjectMemoryCandidates({
    compactPacket: packet,
    validationEvidence: request.validationEvidence,
  });
  const memoryCandidateQuality =
    evaluateProjectMemoryCandidateQuality(memoryCandidates);
  const markdown = request.includeMarkdown
    ? renderCompactHandoffMarkdown(packet)
    : undefined;
  const json = request.includeJson ? JSON.stringify(packet, null, 2) : undefined;

  return {
    request,
    packet,
    memoryCandidates,
    memoryCandidateQuality,
    markdown,
    json,
    warnings: packet.warnings.map((warning) => `${warning.id}: ${warning.message}`),
    evidence: [
      ...request.evidence,
      ...packet.evidence,
      "compact-command-runner:pure",
      "compact-command-runner:no-persistence",
      "compact-command-runner:no-provider-call",
      "compact-command-runner:no-memory-write",
      "compact-command-runner:no-automatic-recovery",
      "compact-command-runner:no-atomic-rollback",
    ],
    persistence: "none",
    providerCall: "none",
    recoveryExecution: "none",
  };
}

function toPacketSource(source: CompactCommandRequest["source"]): CompactContinuityPacketSource {
  switch (source) {
    case "route":
      return "route-handoff";
    case "manual":
      return "manual-export";
    case "session":
      return "session-handoff";
  }
}
