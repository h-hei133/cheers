import type {
  ProductCleanupStatus,
  ProductEvidenceProvenance,
  ProductRedactionStatus,
  ProductVerdict,
} from "../types.js";

export function projectHistoricalReportVerdict(input: {
  readonly routeId?: string;
  readonly reportPath?: string;
  readonly finalStatus?: string;
  readonly independentAuditResult?: string;
  readonly independentPassRerunResult?: string;
  readonly redaction?: ProductRedactionStatus;
  readonly cleanup?: ProductCleanupStatus;
}): ProductVerdict {
  const provenance: ProductEvidenceProvenance = {
    source: "historical-report",
    ...(input.routeId ? { routeId: input.routeId } : {}),
    ...(input.reportPath ? { reportPath: input.reportPath } : {}),
    adapter: "historical-report-verdict",
  };
  const finalStatus = input.finalStatus;
  const auditPartialWithoutPass =
    input.independentAuditResult === "PARTIAL" &&
    finalStatus === "COMPLETE" &&
    input.independentPassRerunResult !== "PASS";

  if (auditPartialWithoutPass) {
    return {
      status: "PARTIAL",
      terminalClassification: "stopped",
      reason:
        "Historical report audit was PARTIAL and has no independent PASS rerun.",
      provenance,
      redaction: input.redaction ?? "unknown",
      cleanup: input.cleanup ?? "unknown",
      notProvenReasons: [],
      partialReasons: [
        "Audit PARTIAL cannot be projected as COMPLETE without independent PASS rerun.",
      ],
      blockedReasons: [],
    };
  }

  if (finalStatus === "COMPLETE") {
    return {
      status: "COMPLETE",
      terminalClassification: "success",
      reason: "Historical report finalStatus is COMPLETE.",
      provenance,
      redaction: input.redaction ?? "unknown",
      cleanup: input.cleanup ?? "unknown",
      notProvenReasons: [],
      partialReasons: [],
      blockedReasons: [],
    };
  }

  if (finalStatus === "BLOCKED") {
    return {
      status: "BLOCKED",
      terminalClassification: "stopped",
      reason: "Historical report finalStatus is BLOCKED.",
      provenance,
      redaction: input.redaction ?? "unknown",
      cleanup: input.cleanup ?? "unknown",
      notProvenReasons: [],
      partialReasons: [],
      blockedReasons: ["Historical report finalStatus is BLOCKED."],
    };
  }

  if (finalStatus === "PARTIAL") {
    return {
      status: "PARTIAL",
      terminalClassification: "stopped",
      reason: "Historical report finalStatus is PARTIAL.",
      provenance,
      redaction: input.redaction ?? "unknown",
      cleanup: input.cleanup ?? "unknown",
      notProvenReasons: [],
      partialReasons: ["Historical report finalStatus is PARTIAL."],
      blockedReasons: [],
    };
  }

  return {
    status: "NOT_PROVEN",
    terminalClassification: "stopped",
    reason: "Historical report finalStatus is missing or unknown.",
    provenance,
    redaction: input.redaction ?? "unknown",
    cleanup: input.cleanup ?? "unknown",
    notProvenReasons: ["Historical report finalStatus is missing or unknown."],
    partialReasons: [],
    blockedReasons: [],
  };
}
