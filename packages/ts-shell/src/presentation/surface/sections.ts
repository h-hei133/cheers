import {
  evidenceIds,
  markerValue,
  repairSeverity,
  repairStatus,
  safeText,
  section,
  verificationSeverity,
  verificationStatus,
} from "./shared.js";
import { compactSessionPresentationText as compact } from "../../session/presentation/facts.js";
import type { CodingResultSummary } from "../../result/types.js";
import type { ProductSurfaceSection, ProductSurfaceInput } from "./types.js";

/** Top-level section builders, one per surface concern. */

export function taskSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  return section({
    kind: "task",
    title: "Task",
    severity: "info",
    status: "observed",
    summary: codingResult.taskKind,
    facts: [{ label: "kind", value: codingResult.taskKind }],
  });
}

export function contextSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  if (codingResult.diagnosis) {
    return section({
      kind: "context",
      title: "Context",
      severity: "info",
      status: "observed",
      summary: `${codingResult.diagnosis.disposition}; evidenceFiles=${codingResult.diagnosis.evidenceFiles.length}; candidates=${codingResult.diagnosis.candidateFiles.length}`,
    });
  }
  return section({
    kind: "context",
    title: "Context",
    severity: "info",
    status: "observed",
    summary: `attemptedFiles=${codingResult.changeSet.attemptedFiles.length}; evidence=${codingResult.evidence.length}; raw-content=excluded`,
    redaction: "excluded",
  });
}

export function planSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const required = codingResult.taskSatisfaction.requiredEvidence[0] ?? "current task contract";
  const reason = codingResult.taskSatisfaction.reasons[0] ?? "no additional plan note";
  return section({
    kind: "plan",
    title: "Plan",
    severity: "info",
    status: "observed",
    summary: `${required}; ${compact(reason)}`,
  });
}

export function proposalSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const proposalSource = markerValue(codingResult.evidence, "proposal-source:") ??
    markerValue(codingResult.evidence, "tool-ecosystem:source:") ??
    "not-proven";
  const state = markerValue(codingResult.evidence, "proposal-state:") ??
    (codingResult.patches && codingResult.patches.length > 0 ? "applied-record-present" : "not-present");
  const targets = codingResult.changeSet.attemptedFiles.length > 0
    ? codingResult.changeSet.attemptedFiles.map((item) => safeText(item, 120)).join(", ")
    : "none";
  const anchor = markerValue(codingResult.evidence, "anchor-quality:") ?? "not-proven";
  return section({
    kind: "proposal",
    title: "Proposal",
    severity: state === "not-present" ? "not_proven" : "info",
    status: state === "not-present" ? "not_proven" : "observed",
    summary: `source=${proposalSource}; state=${state}; targets=${targets}; anchor=${anchor}`,
    sourceEvidenceIds: evidenceIds(codingResult.evidence, [
      "proposal-source:",
      "tool-ecosystem:source:",
      "proposal-state:",
      "anchor-quality:",
    ]),
  });
}

export function authoritySection(codingResult: CodingResultSummary): ProductSurfaceSection {
  if (codingResult.evidence.some((entry) => entry.includes("authority:granted"))) {
    return section({
      kind: "authority",
      title: "Authority",
      severity: "info",
      status: "observed",
      summary: "explicit authority granted by product contract",
      sourceEvidenceIds: ["authority:granted"],
    });
  }
  if (
    codingResult.evidence.some((entry) => entry.includes("authority:required")) ||
    codingResult.verification.blockerKind === "approval-denied"
  ) {
    return section({
      kind: "authority",
      title: "Authority",
      severity: "blocked",
      status: "pending_authority",
      summary: "authority required; prompt text alone does not grant apply, verify, repair, tool, or provider authority",
      sourceEvidenceIds: ["authority:required"],
    });
  }
  if (codingResult.changedFiles.length > 0) {
    return section({
      kind: "authority",
      title: "Authority",
      severity: "info",
      status: "observed",
      summary: "authority consumed for recorded mutation path",
    });
  }
  return section({
    kind: "authority",
    title: "Authority",
    severity: "info",
    status: "not_run",
    summary: "no mutation authority granted",
  });
}

export function applySection(codingResult: CodingResultSummary): ProductSurfaceSection {
  if (codingResult.changedFiles.length > 0) {
    return section({
      kind: "apply",
      title: "Apply",
      severity: codingResult.failedFiles.length > 0 ? "partial" : "info",
      status: codingResult.failedFiles.length > 0 ? "partial" : "observed",
      summary: `changed=${codingResult.changedFiles.map((item) => safeText(item, 120)).join(", ")}; failed=${codingResult.failedFiles.length}`,
    });
  }
  if (codingResult.failedFiles.length > 0) {
    return section({
      kind: "apply",
      title: "Apply",
      severity: "error",
      status: "failed",
      summary: `changed=none; failed=${codingResult.failedFiles.map((entry) => `${safeText(entry.path, 120)} (${safeText(entry.reason, 120)})`).join("; ")}`,
    });
  }
  return section({
    kind: "apply",
    title: "Apply",
    severity: "info",
    status: "not_run",
    summary: "not-run",
  });
}

export function verificationSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const command = codingResult.verification.command
    ? safeText(codingResult.verification.command, 160)
    : "not-selected";
  const reason = codingResult.verification.reason
    ? `; reason=${safeText(codingResult.verification.reason)}`
    : "";
  const blocker = codingResult.verification.blockerKind
    ? `; blocker=${codingResult.verification.blockerKind}`
    : "";
  const scope = codingResult.verification.selectionScope
    ? `; scope=${codingResult.verification.selectionScope}`
    : "";
  return section({
    kind: "verification",
    title: "Verification",
    severity: verificationSeverity(codingResult.verification.status),
    status: verificationStatus(codingResult.verification.status),
    summary: `status=${codingResult.verification.status}; command=${command}${scope}${blocker}${reason}`,
    notProvenClaims: codingResult.verification.status === "passed"
      ? []
      : ["relevant verification did not pass"],
  });
}

export function repairSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const notes = codingResult.repair.notes.length > 0
    ? `; notes=${codingResult.repair.notes.map((item) => safeText(item)).join(" | ")}`
    : "";
  const originalFailure = codingResult.evidence.some((entry) => entry.includes("original-failure-preserved"))
    ? "; original-failure=preserved"
    : "";
  return section({
    kind: "repair",
    title: "Repair",
    severity: repairSeverity(codingResult.repair.status),
    status: repairStatus(codingResult.repair.status),
    summary: `status=${codingResult.repair.status}; attempts=${codingResult.repair.attempts}${originalFailure}${notes}`,
  });
}

export function toolsSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const toolMarkers = codingResult.evidence
    .filter((entry) =>
      entry.startsWith("tool-ecosystem:receipt:") ||
      entry.startsWith("tool-ecosystem:source:") ||
      entry.startsWith("tool-ecosystem:relevance:") ||
      entry.startsWith("runtime-receipt:"),
    )
    .slice(0, 5);
  const provenance = codingResult.provenance?.toolExecutions ?? [];
  if (toolMarkers.length === 0 && provenance.length === 0) {
    return section({
      kind: "tools",
      title: "Tools",
      severity: "info",
      status: "not_run",
      summary: "not-used",
    });
  }
  const provenanceSummary = provenance
    .slice(-2)
    .map((entry) => `${safeText(entry.toolName, 80)}:${entry.kind}`)
    .join(", ");
  return section({
    kind: "tools",
    title: "Tools",
    severity: "info",
    status: "observed",
    summary: [
      toolMarkers.length > 0 ? `receipts=${toolMarkers.length}` : undefined,
      provenanceSummary ? `executions=${provenanceSummary}` : undefined,
      "task-success-requires-relevance",
    ].filter(Boolean).join("; "),
    sourceEvidenceIds: toolMarkers.map((entry) => safeText(entry, 120)),
  });
}

export function resourceSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const projection = input.resourceProjection;
  if (!projection) {
    return [];
  }
  return [section({
    kind: "resources",
    title: "Resources",
    severity: projection.resources.length > 0 ? "info" : "not_proven",
    status: "observed",
    summary: `count=${projection.resources.length}; registry=${projection.registryMode}; dynamic=${projection.dynamicDiscovery}; execution=${projection.pluginExecution}; providerDefault=${projection.providerDefaultEnablement}`,
    facts: [
      { label: "resourceCount", value: String(projection.resources.length) },
      { label: "dynamicDiscovery", value: projection.dynamicDiscovery },
      { label: "pluginExecution", value: projection.pluginExecution },
    ],
    notProvenClaims: projection.notProvenClaims.map((item) => safeText(item)),
  })];
}

export function providerSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const registry = input.providerRegistry;
  if (!registry) {
    return [];
  }
  return [section({
    kind: "provider",
    title: "Provider",
    severity: registry.providerDefaultEnablement === "disabled" ? "not_proven" : "warning",
    status: "not_proven",
    summary: `providers=${registry.providers.length}; models=${registry.models.length}; compatibility=${registry.compatibilityMatrix[0]?.state ?? "not-proven"}; readiness=${registry.readinessMatrix[0]?.configState ?? "unknown"}; defaultEnablement=${registry.providerDefaultEnablement}; dynamic=${registry.dynamicProviderLoading}; externalPackages=${registry.externalPackageLoading}`,
    facts: [
      { label: "providerCount", value: String(registry.providers.length) },
      { label: "modelCount", value: String(registry.models.length) },
      { label: "compatibilityState", value: registry.compatibilityMatrix[0]?.state ?? "not-proven" },
      { label: "configReadiness", value: registry.readinessMatrix[0]?.configState ?? "unknown" },
      { label: "supportedModes", value: String(registry.compatibilityMatrix[0]?.supportedModes.length ?? 0) },
      { label: "defaultEnablement", value: registry.providerDefaultEnablement },
    ],
    notProvenClaims: registry.notProvenClaims.map((item) => safeText(item)),
  })];
}

export function packageSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const inventory = input.packageInventory;
  if (!inventory) {
    return [];
  }
  return [section({
    kind: "packages",
    title: "Packages",
    severity: inventory.conflicts.length > 0 ? "warning" : "not_proven",
    status: "observed",
    summary: `count=${inventory.packages.length}; conflicts=${inventory.conflicts.length}; installation=${inventory.packageInstallation}; loading=${inventory.packageLoading}; scripts=${inventory.scriptExecution}`,
    facts: [
      { label: "packageCount", value: String(inventory.packages.length) },
      { label: "conflictCount", value: String(inventory.conflicts.length) },
      { label: "packageInstallation", value: inventory.packageInstallation },
    ],
    notProvenClaims: inventory.notProvenClaims.map((item) => safeText(item)),
    machineEventCorrelationIds: inventory.conflicts.map((item) => item.conflictId),
  })];
}

export function sessionSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const projection = input.sessionProjection;
  if (!projection) {
    return [];
  }
  return [section({
    kind: "session",
    title: "Session",
    severity: projection.terminal.terminalSuccessClaim ? "warning" : "info",
    status: "observed",
    summary: `activePath=${projection.activePath.length}; tree=${projection.treeSupport}; branch=${projection.branchSupport}; activeLeaf=${projection.branchFacts.activeLeafResolution}; compaction=${projection.compaction.availability}; retainedContext=${projection.compaction.records.flatMap((record) => record.retainedContextFactIds).length}; missingParents=${projection.branchFacts.missingParentIds.length}; terminalSuccessClaim=${projection.terminal.terminalSuccessClaim}`,
    facts: [
      { label: "activeLeafId", value: safeText(projection.activeLeafId) },
      { label: "activeBranchId", value: projection.activeBranchId ? safeText(projection.activeBranchId) : "none" },
      { label: "branchSupport", value: projection.branchSupport },
      { label: "compactionStatus", value: projection.compaction.availability },
    ],
    notProvenClaims: [
      ...projection.branchFacts.notProvenClaims,
      ...projection.compaction.notProvenClaims,
      ...projection.terminal.notProvenClaims,
    ].map((item) => safeText(item)),
  })];
}

export function eventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents;
  if (!events) {
    return [];
  }
  const lastEvent = events[events.length - 1];
  return [section({
    kind: "events",
    title: "Events",
    severity: "info",
    status: "observed",
    summary: `count=${events.length}; last=${lastEvent?.type ?? "none"}; terminalSuccessClaim=false`,
    machineEventCorrelationIds: events.map((event) => event.id),
    notProvenClaims: events.flatMap((event) => event.notProvenClaims.map((claim) => safeText(claim))),
  })];
}

