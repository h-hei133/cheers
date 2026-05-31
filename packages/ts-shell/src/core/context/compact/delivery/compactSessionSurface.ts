import type { CompactCommandRunResult } from "../command/compactCommandRunner.js";
import {
  renderProjectMemoryCandidateSurface,
  summarizeProjectMemoryCandidates,
} from "../../memory/projectMemoryCandidateSurface.js";

export function formatCompactSessionSurface(
  result: CompactCommandRunResult,
): string {
  const packet = result.packet;
  const lines = [
    "Compact v2 handoff generated",
    "Result",
    `- Mode: ${result.request.mode}`,
    `- Source: ${result.request.source}`,
    "- Preview only: yes",
    "- Persistence: none",
    "- Provider/model call: none",
    "- Recovery execution: none",
    `- Packet: ${packet.packetVersion}`,
    `- Current task: ${packet.taskGoal.objective ?? packet.route.objective ?? "not recorded"}`,
    `- Route: ${[packet.route.routeId, packet.route.name].filter(Boolean).join(" ") || "not recorded"}`,
    `- Edit capability status: ${packet.editCapability.closeoutStatus ?? "not recorded"}`,
    `- Mutation evidence: ${summarizeMutation(packet)}`,
    `- Recovery / restore state: ${summarizeRecovery(packet)}`,
    `- Validation status: ${summarizeValidation(packet)}`,
    `- Redactions: ${packet.redactions.length}`,
    `- Warnings: ${packet.warnings.length}`,
    `- Memory candidates: ${summarizeProjectMemoryCandidates(result.memoryCandidates)}`,
    "- Review: run /memory to review candidates; no memory is written by /compact.",
    `- Next action: ${packet.route.nextAction ?? packet.taskGoal.nextAction ?? "not recorded"}`,
    "",
    renderProjectMemoryCandidateSurface({
      candidates: result.memoryCandidates,
      quality: result.memoryCandidateQuality,
    }),
    "",
    "Redactions / warnings",
    ...redactionLines(result),
    ...warningLines(result),
  ];

  if (result.markdown) {
    lines.push("", "Markdown handoff", result.markdown);
  }
  if (result.json) {
    lines.push("", "Structured packet", result.json);
  }

  return lines.join("\n");
}

function summarizeMutation(packet: CompactCommandRunResult["packet"]): string {
  const changed = packet.mutationEvidence.changedFiles.length;
  const planned = packet.mutationEvidence.plannedFiles.length;
  const failed = packet.mutationEvidence.failedFiles.length;
  const writer = packet.mutationEvidence.writerStarted === true ? "writer-started" : "writer-not-recorded";
  return `${planned} planned, ${changed} changed, ${failed} failed, ${writer}`;
}

function summarizeRecovery(packet: CompactCommandRunResult["packet"]): string {
  const restore = packet.recovery.restorePreviewAvailable
    ? "restore-preview-available"
    : "restore-preview-not-recorded";
  const authority = packet.recovery.recoveryAuthorityReferences.length;
  return `${restore}, explicit-only execute, ${authority} authority reference(s), no automatic recovery, no atomic rollback`;
}

function summarizeValidation(packet: CompactCommandRunResult["packet"]): string {
  const tests = packet.validation.testsRun.length;
  const verifiers = packet.validation.verifierStatus.length;
  return `${tests} test command(s), ${verifiers} verifier result(s), build=${packet.validation.buildStatus ?? "not recorded"}, result-contract=${packet.validation.resultContractStatus ?? "not recorded"}`;
}

function redactionLines(result: CompactCommandRunResult): readonly string[] {
  if (result.packet.redactions.length === 0) {
    return ["- Redactions: none recorded"];
  }
  return [
    "- Redactions:",
    ...result.packet.redactions.map(
      (entry) => `  - ${entry.inputField}: ${entry.reason}`,
    ),
  ];
}

function warningLines(result: CompactCommandRunResult): readonly string[] {
  if (result.packet.warnings.length === 0) {
    return ["- Warnings: none recorded"];
  }
  return [
    "- Warnings:",
    ...result.packet.warnings.map(
      (entry) => `  - ${entry.id}: ${entry.message}`,
    ),
  ];
}
