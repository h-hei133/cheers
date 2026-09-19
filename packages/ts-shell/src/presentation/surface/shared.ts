import { compactSessionPresentationText as compact } from "../../session/presentation/facts.js";
import type { CodingResultSummary } from "../../result/types.js";
import type {
  ProductSurfaceFact,
  ProductSurfaceSection,
  ProductSurfaceSectionKind,
  ProductSurfaceSeverity,
  ProductSurfaceStatus,
} from "./types.js";

/** Section assembly shared by the event and builder projection layers. */

export function section(input: {
  readonly kind: ProductSurfaceSectionKind;
  readonly title: string;
  readonly severity: ProductSurfaceSeverity;
  readonly status: ProductSurfaceStatus;
  readonly summary: string;
  readonly facts?: readonly ProductSurfaceFact[];
  readonly redaction?: "none" | "applied" | "excluded";
  readonly notProvenClaims?: readonly string[];
  readonly sourceEvidenceIds?: readonly string[];
  readonly machineEventCorrelationIds?: readonly string[];
}): ProductSurfaceSection {
  const summary = safeText(input.summary);
  const facts = (input.facts ?? []).map((fact) => ({
    ...fact,
    label: safeText(fact.label, 80),
    value: safeText(fact.value),
  }));
  const notProvenClaims = (input.notProvenClaims ?? []).map((item) => safeText(item));
  const sourceEvidenceIds = (input.sourceEvidenceIds ?? []).map((item) => safeText(item, 120));
  const machineEventCorrelationIds = (input.machineEventCorrelationIds ?? []).map((item) => safeText(item, 120));
  const redaction = input.redaction ?? (
    summary.includes("[redacted") ||
    facts.some((fact) => fact.value.includes("[redacted")) ||
    notProvenClaims.some((item) => item.includes("[redacted"))
      ? "applied"
      : "none"
  );
  return {
    kind: input.kind,
    title: input.title,
    severity: input.severity,
    status: input.status,
    summary,
    facts,
    redaction,
    notProvenClaims,
    sourceEvidenceIds,
    machineEventCorrelationIds,
  };
}

export function verdictSeverity(truthStatus: string): ProductSurfaceSeverity {
  switch (truthStatus) {
    case "verified-success":
    case "verified-repaired-success":
      return "success";
    case "partial":
      return "partial";
    case "verification-failed":
      return "error";
    case "stopped-authority-required":
    case "blocked":
      return "blocked";
    case "not-proven":
      return "not_proven";
    default:
      return "info";
  }
}

export function verdictStatus(truthStatus: string): ProductSurfaceStatus {
  switch (truthStatus) {
    case "verified-success":
    case "verified-repaired-success":
      return "passed";
    case "partial":
      return "partial";
    case "verification-failed":
      return "failed";
    case "stopped-authority-required":
      return "pending_authority";
    case "blocked":
      return "blocked";
    case "not-proven":
      return "not_proven";
    default:
      return "observed";
  }
}

export function verificationSeverity(status: CodingResultSummary["verification"]["status"]): ProductSurfaceSeverity {
  switch (status) {
    case "passed":
      return "success";
    case "failed":
      return "error";
    case "blocked":
      return "blocked";
    case "skipped":
      return "partial";
    case "not-requested":
      return "not_proven";
    default:
      return "info";
  }
}

export function verificationStatus(status: CodingResultSummary["verification"]["status"]): ProductSurfaceStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "skipped":
      return "not_run";
    case "not-requested":
      return "not_proven";
    default:
      return "observed";
  }
}

export function repairSeverity(status: CodingResultSummary["repair"]["status"]): ProductSurfaceSeverity {
  switch (status) {
    case "recovered":
      return "success";
    case "failed":
      return "error";
    case "not-needed":
      return "info";
    default:
      return "info";
  }
}

export function repairStatus(status: CodingResultSummary["repair"]["status"]): ProductSurfaceStatus {
  switch (status) {
    case "recovered":
      return "passed";
    case "failed":
      return "failed";
    case "not-needed":
      return "not_run";
    default:
      return "observed";
  }
}

export function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  const marker = evidence.find((entry) => entry.startsWith(prefix));
  return marker ? safeText(marker.slice(prefix.length), 120) : undefined;
}

export function evidenceIds(evidence: readonly string[], prefixes: readonly string[]): string[] {
  return evidence
    .filter((entry) => prefixes.some((prefix) => entry.startsWith(prefix)))
    .map((entry) => safeText(entry, 120));
}

export function safeText(value: string, maxLength = 160): string {
  return compact(value, maxLength)
    .replace(/\bprovider\.env\b[^\s;]*/gi, "provider-config=[redacted]")
    .replace(/\b(raw[_ -]?provider[_ -]?output|rawProviderOutput)\b[^\s;]*/gi, "[raw-content-excluded]")
    .replace(/\bhidden[-_ ]?reasoning\b[^\s;]*/gi, "[raw-content-excluded]")
    .replace(/\b(stdout|stderr)\b[\s\S]*/gi, "[raw-content-excluded]");
}

export function factValue(value: unknown): string {
  return safeText(String(value ?? "not-observed"), 120);
}
