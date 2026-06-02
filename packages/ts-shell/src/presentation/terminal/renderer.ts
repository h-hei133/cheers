import type {
  ProductSurfaceSection,
  ProductSurfaceSeverity,
  ProductSurfaceViewModel,
} from "../surface/model.js";
import type { SessionStatusEnvelope } from "../../session/presentation/envelope.js";

export type TerminalMessageRenderMode = "compact" | "detailed";

export interface TerminalMessageRendererOptions {
  readonly mode?: TerminalMessageRenderMode;
}

export interface TerminalMessageRenderResult {
  readonly lines: readonly string[];
}

const SECTION_ORDER = [
  "task",
  "context",
  "context_discovery",
  "context_acquisition",
  "loop",
  "turn",
  "plan",
  "planning",
  "handoff",
  "continuation_context",
  "proposal",
  "authority",
  "apply",
  "verification",
  "repair",
  "tools",
  "execution",
  "save_point",
  "resources",
  "provider",
  "model_boundary",
  "packages",
  "session",
  "events",
  "verdict",
  "not_proven",
  "next_action",
] as const;

export function renderTerminalMessage(
  viewModel: ProductSurfaceViewModel,
  options: TerminalMessageRendererOptions = {},
): TerminalMessageRenderResult {
  const mode = options.mode ?? "compact";
  const ordered = [...viewModel.sections].sort(
    (left, right) =>
      SECTION_ORDER.indexOf(left.kind) - SECTION_ORDER.indexOf(right.kind),
  );
  const lines = [
    "Product surface",
    ...ordered.flatMap((section) => renderSection(section, mode)),
    "",
  ];
  return { lines };
}

export function renderSessionStatusEnvelope(
  envelope: SessionStatusEnvelope,
  options: TerminalMessageRendererOptions = {},
): TerminalMessageRenderResult {
  const mode = options.mode ?? "compact";
  const lines = [
    "Session status",
    `[${envelope.state}] Verdict: ${envelope.terminalVerdict}`,
    `[control] Loop: ${envelope.controlStatus}`,
    `[action] Next: ${envelope.nextAction}`,
    `[request] Request: ${envelope.requestPreparation.summary}`,
    `[provider] Model: ${envelope.providerModel.summary}`,
    `[continuation] Readiness: ${envelope.continuationReadiness}`,
    `[replay] Carry-forward: ${envelope.replayCarryForward.summary}`,
    `[tools] Outcome: ${envelope.toolOutcome.summary}`,
    `[mutation] Recovery: ${envelope.mutationRecovery.summary}`,
    `[verification] Status: ${envelope.verification.summary}`,
    `[repair] Status: ${envelope.repair.summary}`,
    `[proof] Missing: ${envelope.missingProof.length > 0 ? envelope.missingProof.join(",") : "none"}`,
    `[truth] terminalSuccessClaim=${envelope.terminalSuccessClaim}`,
  ];

  if (mode === "detailed") {
    lines.push(
      `[flags] userActionNeeded=${envelope.userActionNeeded}; blocked=${envelope.blocked}; failed=${envelope.failed}; completeProof=${envelope.completeProof}`,
      `[not_proven] ${envelope.notProvenClaims.length > 0 ? envelope.notProvenClaims.join("; ") : "none"}`,
      ...envelope.safeDetails.map((detail) => `[detail] ${detail}`),
    );
  }

  lines.push("");
  return { lines };
}

function renderSection(
  section: ProductSurfaceSection,
  mode: TerminalMessageRenderMode,
): string[] {
  const status = section.status;
  const prefix = severityMarker(section.severity);
  const summary = `${prefix} ${section.title}: ${section.summary}`;
  if (mode === "compact") {
    return [summary];
  }

  const detailLines = [
    summary,
    `  status: ${status}`,
    section.redaction === "none" ? undefined : `  redaction: ${section.redaction}`,
    section.notProvenClaims.length > 0
      ? `  not_proven: ${section.notProvenClaims.join("; ")}`
      : undefined,
    section.sourceEvidenceIds.length > 0
      ? `  evidence: ${section.sourceEvidenceIds.join("; ")}`
      : undefined,
    section.machineEventCorrelationIds.length > 0
      ? `  events: ${section.machineEventCorrelationIds.join("; ")}`
      : undefined,
    ...section.facts.map((fact) => `  ${fact.label}: ${fact.value}`),
  ];
  return detailLines.filter((line): line is string => Boolean(line));
}

function severityMarker(severity: ProductSurfaceSeverity): string {
  switch (severity) {
    case "success":
      return "[success]";
    case "warning":
      return "[warning]";
    case "blocked":
      return "[blocked]";
    case "error":
      return "[error]";
    case "partial":
      return "[partial]";
    case "not_proven":
      return "[not_proven]";
    case "info":
    default:
      return "[info]";
  }
}
