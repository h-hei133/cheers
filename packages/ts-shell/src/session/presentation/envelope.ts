import type {
  ProductSurfaceFact,
  ProductSurfaceSection,
  ProductSurfaceViewModel,
} from "../../presentation/surface/model.js";
import { compactSessionPresentationText as compact } from "./facts.js";

export type SessionStatusEnvelopeState =
  | "complete_proof"
  | "user_action_needed"
  | "blocked"
  | "failed"
  | "partial"
  | "not_proven";

export interface SessionStatusEnvelopeDetail {
  readonly status: string;
  readonly summary: string;
  readonly blockers: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export interface SessionStatusEnvelope {
  readonly terminalVerdict: string;
  readonly terminalTruthStatus: string;
  readonly controlStatus: string;
  readonly state: SessionStatusEnvelopeState;
  readonly nextAction: string;
  readonly requestPreparation: SessionStatusEnvelopeDetail;
  readonly providerModel: SessionStatusEnvelopeDetail;
  readonly continuationReadiness: string;
  readonly sessionBranch: SessionStatusEnvelopeDetail;
  readonly sessionCompaction: SessionStatusEnvelopeDetail;
  readonly replayCarryForward: SessionStatusEnvelopeDetail;
  readonly toolOutcome: SessionStatusEnvelopeDetail;
  readonly mutationRecovery: SessionStatusEnvelopeDetail;
  readonly verification: SessionStatusEnvelopeDetail;
  readonly repair: SessionStatusEnvelopeDetail;
  readonly missingProof: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly safeDetails: readonly string[];
  readonly userActionNeeded: boolean;
  readonly blocked: boolean;
  readonly failed: boolean;
  readonly completeProof: boolean;
  readonly terminalSuccessClaim: false;
}

export function projectSessionStatusEnvelope(
  viewModel: ProductSurfaceViewModel,
): SessionStatusEnvelope {
  const completion = findSection(viewModel, "Product completion packet");
  const verdict = firstSection(viewModel, "verdict");
  const request = findSection(viewModel, "Request preparation");
  const providerModel = findSection(viewModel, "Controlled invocation") ??
    findSection(viewModel, "Response cycle") ??
    findSection(viewModel, "Provider stream adapter") ??
    findSection(viewModel, "Invocation gate") ??
    findSection(viewModel, "Provider");
  const replay = findSection(viewModel, "Replay carry forward");
  const session = findSection(viewModel, "Session");
  const toolOutcome = findSection(viewModel, "Tool outcome");
  const mutationRecovery = findSection(viewModel, "Mutation recovery");
  const verification = firstSection(viewModel, "verification");
  const repair = firstSection(viewModel, "repair");
  const missingProof = parseMissingProof(fact(completion, "missingProof"));
  const completeProof = Boolean(
    completion?.status === "passed" &&
      fact(completion, "resultStatus") === "verified_with_repair" &&
      verdict?.severity === "success",
  );
  const blocked = hasSeverity(viewModel, "blocked") ||
    request?.severity === "warning" ||
    toolOutcome?.severity === "warning";
  const failed = hasStatus(viewModel, "failed");
  const partial = hasStatus(viewModel, "partial") || hasSeverity(viewModel, "partial");
  const userActionNeeded = blocked ||
    completion?.status === "not_proven" ||
    fact(completion, "loopDecision") === "await_user";
  const state = stateFor({ completeProof, blocked, failed, partial, userActionNeeded, missingProof });

  return {
    terminalVerdict: safe(viewModel.verdict, 240),
    terminalTruthStatus: safe(verdict?.status ?? verdict?.severity ?? "not_proven"),
    controlStatus: safe(fact(completion, "loopDecision") ?? completion?.status ?? "not_observed"),
    state,
    nextAction: safe(viewModel.nextAction, 240),
    requestPreparation: detail(request),
    providerModel: detail(providerModel),
    continuationReadiness: safe(
      fact(request, "continuationReadiness") ??
        valueFromSummary(request, "continuation") ??
        "not_observed",
    ),
    sessionBranch: detailFrom({
      status: fact(session, "branchSupport") ?? valueFromSummary(session, "branch") ?? "not_observed",
      summary: [
        `branch=${fact(session, "branchSupport") ?? valueFromSummary(session, "branch") ?? "not_observed"}`,
        `activeLeaf=${valueFromSummary(session, "activeLeaf") ?? "not_observed"}`,
        `activeBranch=${fact(session, "activeBranchId") ?? "none"}`,
      ].join("; "),
      blockers: valueFromSummary(session, "missingParents") === "0" ? [] : [`missingParents=${valueFromSummary(session, "missingParents") ?? "not_observed"}`],
      notProvenClaims: session?.notProvenClaims ?? [],
    }),
    sessionCompaction: detailFrom({
      status: fact(session, "compactionStatus") ?? valueFromSummary(session, "compaction") ?? "not_observed",
      summary: [
        `compaction=${fact(session, "compactionStatus") ?? valueFromSummary(session, "compaction") ?? "not_observed"}`,
        `retainedContext=${valueFromSummary(session, "retainedContext") ?? "0"}`,
      ].join("; "),
      blockers: [],
      notProvenClaims: session?.notProvenClaims ?? [],
    }),
    replayCarryForward: detail(replay),
    toolOutcome: detail(toolOutcome),
    mutationRecovery: detail(mutationRecovery),
    verification: detail(verification),
    repair: detail(repair),
    missingProof,
    notProvenClaims: uniqueSafe(viewModel.notProvenClaims),
    safeDetails: safeDetails(viewModel),
    userActionNeeded,
    blocked,
    failed,
    completeProof,
    terminalSuccessClaim: false,
  };
}

function stateFor(input: {
  readonly completeProof: boolean;
  readonly blocked: boolean;
  readonly failed: boolean;
  readonly partial: boolean;
  readonly userActionNeeded: boolean;
  readonly missingProof: readonly string[];
}): SessionStatusEnvelopeState {
  if (input.completeProof) {
    return "complete_proof";
  }
  if (input.blocked) {
    return "blocked";
  }
  if (input.failed) {
    return "failed";
  }
  if (input.partial) {
    return "partial";
  }
  if (input.userActionNeeded) {
    return "user_action_needed";
  }
  if (input.missingProof.length > 0) {
    return "partial";
  }
  return "not_proven";
}

function detail(section: ProductSurfaceSection | undefined): SessionStatusEnvelopeDetail {
  return {
    status: safe(section?.status ?? "not_observed"),
    summary: safe(section?.summary ?? "not observed", 240),
    blockers: blockersFor(section),
    notProvenClaims: uniqueSafe(section?.notProvenClaims ?? []),
  };
}

function detailFrom(input: SessionStatusEnvelopeDetail): SessionStatusEnvelopeDetail {
  return {
    status: safe(input.status),
    summary: safe(input.summary, 240),
    blockers: uniqueSafe(input.blockers),
    notProvenClaims: uniqueSafe(input.notProvenClaims),
  };
}

function blockersFor(section: ProductSurfaceSection | undefined): readonly string[] {
  if (!section) {
    return [];
  }
  const values = [
    fact(section, "blockedReasons"),
    valueFromSummary(section, "blocked"),
    section.severity === "blocked" || section.severity === "warning" ? section.summary : undefined,
  ];
  return uniqueSafe(values.filter((value): value is string => Boolean(value)));
}

function safeDetails(viewModel: ProductSurfaceViewModel): readonly string[] {
  return uniqueSafe(
    viewModel.sections.flatMap((section) => [
      `${section.title}: ${section.summary}`,
      ...section.facts.map((item) => `${item.label}=${item.value}`),
    ]),
  ).slice(0, 24);
}

function firstSection(
  viewModel: ProductSurfaceViewModel,
  kind: ProductSurfaceSection["kind"],
): ProductSurfaceSection | undefined {
  return viewModel.sections.find((section) => section.kind === kind);
}

function findSection(
  viewModel: ProductSurfaceViewModel,
  title: string,
): ProductSurfaceSection | undefined {
  return viewModel.sections.find((section) => section.title === title);
}

function hasSeverity(
  viewModel: ProductSurfaceViewModel,
  severity: ProductSurfaceSection["severity"],
): boolean {
  return viewModel.sections.some((section) => section.severity === severity);
}

function hasStatus(
  viewModel: ProductSurfaceViewModel,
  status: ProductSurfaceSection["status"],
): boolean {
  return viewModel.sections.some((section) => section.status === status);
}

function fact(
  section: ProductSurfaceSection | undefined,
  label: ProductSurfaceFact["label"],
): string | undefined {
  return section?.facts.find((item) => item.label === label)?.value;
}

function valueFromSummary(
  section: ProductSurfaceSection | undefined,
  key: string,
): string | undefined {
  const match = section?.summary.match(new RegExp(`${key}=([^;]+)`));
  return match?.[1]?.trim();
}

function parseMissingProof(value: string | undefined): readonly string[] {
  if (!value || value === "none" || value === "" || value === "not-observed") {
    return [];
  }
  return uniqueSafe(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function uniqueSafe(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => safe(value)).filter(Boolean)));
}

function safe(value: string, maxLength = 160): string {
  return compact(value, maxLength)
    .replace(/\bprovider\.env\b[^\s;]*/gi, "provider-config=[redacted]")
    .replace(/\b(raw[_ -]?provider[_ -]?output|rawProviderOutput)\b[^\s;]*/gi, "[raw-content-excluded]")
    .replace(/\bhidden[-_ ]?reasoning\b[^\s;]*/gi, "[raw-content-excluded]")
    .replace(/\b(stdout|stderr)\b[\s\S]*/gi, "[raw-content-excluded]");
}
