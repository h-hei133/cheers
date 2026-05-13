import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";

export interface ProviderDiagnosticHandoffEvidence {
  readonly kind: "failure" | "success";
  readonly status?: string;
  readonly target?: string;
  readonly command?: string;
  readonly reason?: string;
  readonly blockerKind?: string;
}

export interface ProviderOutcomeProjection {
  readonly diagnosticHandoff?: ProviderDiagnosticHandoffEvidence;
  readonly lineage: readonly string[];
}

export function projectProviderOutcome(
  continuity: ContinuityStateLike,
): ProviderOutcomeProjection {
  const diagnosticHandoff = projectProviderSafeDiagnostics(continuity);
  return {
    ...(diagnosticHandoff ? { diagnosticHandoff } : {}),
    lineage: diagnosticHandoff ? formatProviderOutcomeFacts(diagnosticHandoff) : [],
  };
}

export function projectProviderSafeDiagnostics(
  continuity: ContinuityStateLike,
): ProviderDiagnosticHandoffEvidence | undefined {
  return (
    parseDiagnosticHandoffEvidence(
      continuity.lastFailureHandoffDiagnostic,
      "failure",
    ) ??
    parseDiagnosticHandoffEvidence(
      continuity.lastSuccessHandoffDiagnostic,
      "success",
    )
  );
}

export function formatProviderOutcomeFacts(
  evidence: ProviderDiagnosticHandoffEvidence,
): string[] {
  return [
    `diagnosticHandoff=${evidence.kind}`,
    ...(evidence.status
      ? [`diagnosticStatus=${evidence.status.trim().toLowerCase()}`]
      : []),
    ...(evidence.target
      ? [`diagnosticTarget=${normalizePathLike(evidence.target)}`]
      : []),
    ...(evidence.command ? ["diagnosticCommandInherited=yes"] : []),
    ...(evidence.reason ? ["diagnosticReason=yes"] : []),
    ...(evidence.blockerKind
      ? [`diagnosticBlocker=${evidence.blockerKind.trim().toLowerCase()}`]
      : []),
  ];
}

function parseDiagnosticHandoffEvidence(
  raw: string | undefined,
  kind: "failure" | "success",
): ProviderDiagnosticHandoffEvidence | undefined {
  const text = raw?.trim();
  if (!text) {
    return undefined;
  }
  const fields = new Map<string, string>();
  const body = text.includes(":") ? text.slice(text.indexOf(":") + 1) : text;
  for (const chunk of body.split(";")) {
    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }
    const key = chunk.slice(0, separatorIndex).trim().toLowerCase();
    const value = chunk.slice(separatorIndex + 1).trim();
    if (key && value) {
      fields.set(key, value);
    }
  }
  const target = fields.get("target") ?? fields.get("file");
  const command = fields.get("command");
  const status = fields.get("status");
  const reason = fields.get("reason") ?? fields.get("summary");
  const blockerKind = fields.get("blocker") ?? fields.get("blockerkind");
  if (!target && !command && !status && !reason && !blockerKind) {
    return undefined;
  }
  return {
    kind,
    ...(status ? { status } : {}),
    ...(target ? { target } : {}),
    ...(command ? { command } : {}),
    ...(reason ? { reason } : {}),
    ...(blockerKind ? { blockerKind } : {}),
  };
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
