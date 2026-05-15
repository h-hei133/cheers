import type { CompactContinuityPacket } from "./compactContinuityPacket.js";

export function renderCompactHandoffMarkdown(
  packet: CompactContinuityPacket,
): string {
  const lines = [
    "# Compact v2 Handoff",
    "",
    "## Current task / route",
    bullet("Packet", `${packet.packetVersion} from ${packet.source} at ${packet.generatedAt}`),
    bullet("Objective", packet.taskGoal.objective ?? packet.route.objective),
    bullet("Route", labelRoute(packet)),
    bullet("Current phase", packet.route.currentPhase),
    bullet("Next action", packet.route.nextAction ?? packet.taskGoal.nextAction),
    ...list("Constraints", packet.taskGoal.constraints),
    "",
    "## Project state",
    bullet("Project root", packet.project.projectRoot),
    bullet("Branch", packet.project.branch),
    bullet("Base commit", packet.project.baseCommit),
    ...list("Repository hints", packet.project.repositoryHints),
    "",
    "## Supported edit capability envelope",
    bullet("Closeout status", packet.editCapability.closeoutStatus),
    bullet("Bounded cap", packet.editCapability.boundedCap?.toString()),
    ...list("Default supported", packet.editCapability.supportedDefault),
    ...list("Non-default supported", packet.editCapability.supportedNonDefault),
    ...list("Explicit opt-in only", packet.editCapability.explicitOptInOnly),
    bullet("Automatic recovery", "blocked; explicit restore only"),
    bullet("Atomic rollback", "blocked; no atomic rollback claim"),
    "",
    "## Blocked-by-design capabilities",
    ...blockedCapabilities(packet),
    "",
    "## Mutation evidence",
    ...list("Planned files", packet.mutationEvidence.plannedFiles),
    ...list("Changed files", packet.mutationEvidence.changedFiles),
    ...failedFiles(packet),
    bullet("Post-write verification", packet.mutationEvidence.postWriteVerification),
    bullet("Writer started", boolLabel(packet.mutationEvidence.writerStarted)),
    bullet("Write effect", packet.mutationEvidence.writeEffect),
    ...list("Writer flags", packet.mutationEvidence.writerFlags),
    "",
    "## Recovery / restore state",
    bullet("Restore available", boolLabel(packet.recovery.restoreAvailable)),
    bullet("Restore preview available", boolLabel(packet.recovery.restorePreviewAvailable)),
    bullet("Restore execution", "explicit-only"),
    bullet("Automatic recovery", "not available"),
    bullet("Atomic rollback", "not available"),
    bullet("Recovery executed", "false"),
    ...list("Recovery authority references", packet.recovery.recoveryAuthorityReferences),
    ...list("Restorable files", packet.recovery.restorableFiles),
    ...blockedFiles(packet),
    bullet("Current-content guard", packet.recovery.currentContentGuardSummary),
    "",
    "## Validation evidence",
    ...list("Tests run", packet.validation.testsRun),
    ...verifierResults(packet),
    bullet("Build", packet.validation.buildStatus),
    bullet("Result contract", packet.validation.resultContractStatus),
    bullet("Command output", packet.validation.commandOutputSummary),
    "",
    "## Constraints / forbidden scope",
    ...list("Stop conditions", packet.route.stopConditions),
    ...list("Forbidden scope", packet.route.forbiddenScope),
    "",
    "## Context projection labels",
    ...list("Compact survivors", packet.context.compactSurvivorFacts),
    ...list("Memory candidates", packet.context.memoryCandidates),
    ...list("Sidebar facts", packet.context.sidebarFacts),
    ...list("Startup warm candidates", packet.context.startupWarmCandidates),
    "",
    "## Next action",
    `- ${packet.route.nextAction ?? packet.taskGoal.nextAction ?? "No next action recorded."}`,
    "",
    "## Redactions / warnings",
    ...redactions(packet),
    ...warnings(packet),
    "",
  ];
  return lines.filter((line, index, array) => {
    if (line !== "" || array[index - 1] !== "") {
      return true;
    }
    return false;
  }).join("\n");
}

function labelRoute(packet: CompactContinuityPacket): string | undefined {
  if (!packet.route.routeId && !packet.route.name) {
    return undefined;
  }
  return [packet.route.routeId, packet.route.name].filter(Boolean).join(" ");
}

function bullet(label: string, value: string | undefined): string {
  return `- ${label}: ${value?.trim() ? value : "not recorded"}`;
}

function boolLabel(value: boolean | undefined): string {
  if (value === undefined) {
    return "not recorded";
  }
  return value ? "yes" : "no";
}

function list(label: string, values: readonly string[]): string[] {
  if (values.length === 0) {
    return [`- ${label}: none recorded`];
  }
  return [`- ${label}:`, ...values.map((value) => `  - ${value}`)];
}

function blockedCapabilities(packet: CompactContinuityPacket): string[] {
  if (packet.editCapability.blockedByDesign.length === 0) {
    return ["- Blocked: none recorded"];
  }
  return packet.editCapability.blockedByDesign.map(
    (entry) => `- ${entry.id}: ${entry.reason}`,
  );
}

function failedFiles(packet: CompactContinuityPacket): string[] {
  if (packet.mutationEvidence.failedFiles.length === 0) {
    return ["- Failed files: none recorded"];
  }
  return [
    "- Failed files:",
    ...packet.mutationEvidence.failedFiles.map(
      (entry) => `  - ${entry.path}: ${entry.reason}`,
    ),
  ];
}

function blockedFiles(packet: CompactContinuityPacket): string[] {
  if (packet.recovery.blockedFiles.length === 0) {
    return ["- Blocked recovery files: none recorded"];
  }
  return [
    "- Blocked recovery files:",
    ...packet.recovery.blockedFiles.map(
      (entry) => `  - ${entry.path}: ${entry.reason}`,
    ),
  ];
}

function verifierResults(packet: CompactContinuityPacket): string[] {
  if (packet.validation.verifierStatus.length === 0) {
    return ["- Verifiers: none recorded"];
  }
  return [
    "- Verifiers:",
    ...packet.validation.verifierStatus.map(
      (entry) => `  - ${entry.command}: ${entry.status}`,
    ),
  ];
}

function redactions(packet: CompactContinuityPacket): string[] {
  if (packet.redactions.length === 0) {
    return ["- Redactions: none recorded"];
  }
  return [
    "- Redactions:",
    ...packet.redactions.map(
      (entry) => `  - ${entry.inputField}: ${entry.reason}`,
    ),
  ];
}

function warnings(packet: CompactContinuityPacket): string[] {
  if (packet.warnings.length === 0) {
    return ["- Warnings: none recorded"];
  }
  return [
    "- Warnings:",
    ...packet.warnings.map((entry) => `  - ${entry.id}: ${entry.message}`),
  ];
}

