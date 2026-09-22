import type { CompactContinuityPacket } from "../context/compact/continuity/compactContinuityPacket.js";
import type {
  ContextProjectionFact,
  ContextStateProjection,
  ContextStateProjectionInput,
} from "../core/context/model/contextStateProjection.js";
import {
  createProjectMemoryCandidate,
  dedupeProjectMemoryCandidates,
  type ProjectMemoryCandidate,
  type ProjectMemoryCandidateConfidence,
  type ProjectMemoryCandidateKind,
  type ProjectMemoryCandidateSource,
} from "./projectMemoryCandidate.js";

export interface ProjectMemorySourceFact {
  readonly summary: string;
  readonly kind?: ProjectMemoryCandidateKind;
  readonly source?: ProjectMemoryCandidateSource;
  readonly evidence?: readonly string[];
  readonly confidence?: ProjectMemoryCandidateConfidence;
  readonly stable?: boolean;
}

export interface ExplicitUserPreferenceFact {
  readonly summary: string;
  readonly explicit: boolean;
  readonly evidence?: readonly string[];
}

export interface UnsafeMemoryCandidateFact {
  readonly summary: string;
  readonly source?: ProjectMemoryCandidateSource;
  readonly reason: string;
  readonly evidence?: readonly string[];
}

export interface ExtractProjectMemoryCandidatesInput {
  readonly compactPacket?: CompactContinuityPacket;
  readonly contextProjection?: ContextStateProjection;
  readonly routeHandoffFacts?: readonly ProjectMemorySourceFact[];
  readonly validationEvidence?: ContextStateProjectionInput["validationEvidence"];
  readonly editCloseoutFacts?: {
    readonly status?: string;
    readonly blockedByDesign?: readonly {
      readonly id: string;
      readonly reason: string;
    }[];
    readonly evidence?: readonly string[];
  };
  readonly explicitUserPreferenceFacts?: readonly ExplicitUserPreferenceFact[];
  readonly unsafeFacts?: readonly UnsafeMemoryCandidateFact[];
}

export function extractProjectMemoryCandidates(
  input: ExtractProjectMemoryCandidatesInput,
): readonly ProjectMemoryCandidate[] {
  const candidates: ProjectMemoryCandidate[] = [];

  if (input.compactPacket) {
    extractFromCompactPacket(input.compactPacket, candidates);
  }
  if (input.contextProjection) {
    extractFromContextProjection(input.contextProjection, candidates);
  }
  if (input.routeHandoffFacts) {
    extractFromRouteHandoffFacts(input.routeHandoffFacts, candidates);
  }
  if (input.validationEvidence) {
    extractFromValidationEvidence(input.validationEvidence, candidates);
  }
  if (input.editCloseoutFacts) {
    extractFromEditCloseoutFacts(input.editCloseoutFacts, candidates);
  }
  if (input.explicitUserPreferenceFacts) {
    extractFromUserPreferenceFacts(input.explicitUserPreferenceFacts, candidates);
  }
  if (input.unsafeFacts) {
    extractUnsafeFacts(input.unsafeFacts, candidates);
  }

  return dedupeProjectMemoryCandidates(
    candidates.map((candidate) =>
      isUnsafeSummary(candidate.summary)
        ? createRejectedCandidate({
            summary: redactUnsafeSummary(candidate.summary),
            source: candidate.source,
            reason: "Candidate text looked like raw content, secret material, provider credentials, or hidden reasoning.",
            evidence: candidate.evidence,
            redactions: [...candidate.redactions, "candidate.summary"],
          })
        : candidate,
    ),
  );
}

function extractFromCompactPacket(
  packet: CompactContinuityPacket,
  candidates: ProjectMemoryCandidate[],
): void {
  if (packet.project.repositoryHints.length > 0) {
    for (const hint of packet.project.repositoryHints) {
      candidates.push(
        createProjectMemoryCandidate({
          candidateKind: classifyProjectHint(hint),
          retentionClass: "project-scoped-candidate",
          confidence: "medium",
          source: "compact-packet",
          summary: hint,
          reason: "Compact packet carried this as a repository hint.",
          evidence: compactEvidence(packet, "compact-packet:project.repositoryHints"),
        }),
      );
    }
  }

  if (packet.editCapability.closeoutStatus) {
    candidates.push(
      createProjectMemoryCandidate({
        candidateKind: "capability-state",
        retentionClass: "project-scoped-candidate",
        confidence: "high",
        source: "compact-packet",
        summary: `Edit capability closeout status is ${packet.editCapability.closeoutStatus}.`,
        reason: "Compact packet carries the current edit capability closeout state without raw edit content.",
        evidence: compactEvidence(packet, "compact-packet:editCapability.closeoutStatus"),
      }),
    );
  }

  for (const blocked of packet.editCapability.blockedByDesign) {
    candidates.push(
      createProjectMemoryCandidate({
        candidateKind: "blocked-by-design-decision",
        retentionClass: "project-scoped-candidate",
        confidence: "high",
        source: "compact-packet",
        summary: `${blocked.id} is blocked by design.`,
        reason: blocked.reason,
        evidence: compactEvidence(packet, "compact-packet:editCapability.blockedByDesign"),
      }),
    );
  }

  if (packet.route.routeId || packet.route.name || packet.route.currentPhase) {
    candidates.push(
      createProjectMemoryCandidate({
        candidateKind: "route-decision",
        retentionClass: "session-scoped-only",
        confidence: "medium",
        source: "compact-packet",
        summary: routeSummary(packet),
        reason: "Route state is useful for handoff but remains session-only until reviewed as stable memory.",
        evidence: compactEvidence(packet, "compact-packet:route"),
      }),
    );
  }

  if (
    packet.recovery.restoreExecuteExplicitOnly ||
    packet.recovery.automaticRecoveryAvailable === false ||
    packet.recovery.atomicRollbackAvailable === false
  ) {
    candidates.push(
      createProjectMemoryCandidate({
        candidateKind: "restore/recovery-boundary",
        retentionClass: "project-scoped-candidate",
        confidence: "high",
        source: "compact-packet",
        summary: "Restore execution remains explicit-only; automatic recovery and atomic rollback are unavailable.",
        reason: "Recovery boundaries are safety-sensitive project facts.",
        evidence: compactEvidence(packet, "compact-packet:recovery"),
      }),
    );
  }

  extractValidationCandidate(
    {
      testsRun: packet.validation.testsRun,
      verifierResults: packet.validation.verifierStatus,
      buildStatus: packet.validation.buildStatus,
      resultContractStatus: packet.validation.resultContractStatus,
    },
    candidates,
    "compact-packet",
    compactEvidence(packet, "compact-packet:validation"),
  );

  for (const redaction of packet.redactions) {
    candidates.push(
      createRejectedCandidate({
        summary: `${redaction.inputField} was excluded from memory candidates.`,
        source: "compact-packet",
        reason: redaction.reason,
        evidence: compactEvidence(packet, `compact-packet:redaction:${redaction.inputField}`),
        redactions: [redaction.inputField],
      }),
    );
  }
}

function extractFromContextProjection(
  projection: ContextStateProjection,
  candidates: ProjectMemoryCandidate[],
): void {
  for (const fact of projection.memoryCandidates) {
    for (const summary of summariesFromProjectionFact(fact)) {
      candidates.push(
        createProjectMemoryCandidate({
          candidateKind: classifyProjectionFact(fact),
          retentionClass: "project-scoped-candidate",
          confidence: "medium",
          source: "context-projection",
          summary,
          reason: fact.summary,
          evidence: [...fact.evidence, ...projection.evidence, `context-projection:${fact.id}`],
        }),
      );
    }
  }
  for (const redaction of projection.redactions) {
    candidates.push(
      createRejectedCandidate({
        summary: `${redaction.inputField} was excluded from memory candidates.`,
        source: "context-projection",
        reason: redaction.reason,
        evidence: [...projection.evidence, `context-projection:redaction:${redaction.inputField}`],
        redactions: [redaction.inputField],
      }),
    );
  }
}

function extractFromRouteHandoffFacts(
  facts: readonly ProjectMemorySourceFact[],
  candidates: ProjectMemoryCandidate[],
): void {
  for (const fact of facts) {
    candidates.push(
      createProjectMemoryCandidate({
        candidateKind: fact.kind ?? "route-decision",
        retentionClass: fact.stable ? "project-scoped-candidate" : "session-scoped-only",
        confidence: fact.confidence ?? (fact.stable ? "high" : "medium"),
        source: fact.source ?? "route-handoff",
        summary: fact.summary,
        reason: fact.stable
          ? "Route handoff marked this fact as stable."
          : "Route handoff fact remains session-only until reviewed.",
        evidence: fact.evidence ?? ["route-handoff:fact"],
      }),
    );
  }
}

function extractFromValidationEvidence(
  validation: ContextStateProjectionInput["validationEvidence"],
  candidates: ProjectMemoryCandidate[],
): void {
  extractValidationCandidate(
    validation,
    candidates,
    "validation-evidence",
    ["validation-evidence:input"],
  );
  if (validation?.fullCommandOutput) {
    candidates.push(
      createRejectedCandidate({
        summary: "Full command output was excluded from memory candidates.",
        source: "validation-evidence",
        reason: "Transient command output must not become long-lived memory.",
        evidence: ["validation-evidence.fullCommandOutput"],
        redactions: ["validationEvidence.fullCommandOutput"],
      }),
    );
  }
}

function extractFromEditCloseoutFacts(
  edit: NonNullable<ExtractProjectMemoryCandidatesInput["editCloseoutFacts"]>,
  candidates: ProjectMemoryCandidate[],
): void {
  const evidence = edit.evidence ?? ["edit-closeout-facts:input"];
  if (edit.status) {
    candidates.push(
      createProjectMemoryCandidate({
        candidateKind: "capability-state",
        retentionClass: "project-scoped-candidate",
        confidence: "high",
        source: "system-derived",
        summary: `Edit capability closeout status is ${edit.status}.`,
        reason: "Edit closeout facts are explicit route evidence.",
        evidence,
      }),
    );
  }
  for (const blocked of edit.blockedByDesign ?? []) {
    candidates.push(
      createProjectMemoryCandidate({
        candidateKind: "blocked-by-design-decision",
        retentionClass: "project-scoped-candidate",
        confidence: "high",
        source: "system-derived",
        summary: `${blocked.id} is blocked by design.`,
        reason: blocked.reason,
        evidence,
      }),
    );
  }
}

function extractFromUserPreferenceFacts(
  facts: readonly ExplicitUserPreferenceFact[],
  candidates: ProjectMemoryCandidate[],
): void {
  for (const fact of facts) {
    if (!fact.explicit) {
      candidates.push(
        createRejectedCandidate({
          summary: "Ambiguous user behavior was not treated as a user preference.",
          source: "user-stated-preference",
          reason: "User preference memory requires an explicit user signal.",
          evidence: fact.evidence ?? ["user-preference:ambiguous"],
        }),
      );
      continue;
    }
    candidates.push(
      createProjectMemoryCandidate({
        candidateKind: "user-preference-candidate",
        retentionClass: "user-memory-candidate",
        confidence: "high",
        source: "user-stated-preference",
        safety: "needs-review",
        summary: fact.summary,
        reason: "User explicitly stated this preference; future review must decide whether to persist it.",
        evidence: fact.evidence ?? ["user-preference:explicit"],
      }),
    );
  }
}

function extractUnsafeFacts(
  facts: readonly UnsafeMemoryCandidateFact[],
  candidates: ProjectMemoryCandidate[],
): void {
  for (const fact of facts) {
    candidates.push(
      createRejectedCandidate({
        summary: redactUnsafeSummary(fact.summary),
        source: fact.source ?? "system-derived",
        reason: fact.reason,
        evidence: fact.evidence ?? ["unsafe-fact:input"],
        redactions: ["unsafeFact.summary"],
      }),
    );
  }
}

function extractValidationCandidate(
  validation: ContextStateProjectionInput["validationEvidence"],
  candidates: ProjectMemoryCandidate[],
  source: ProjectMemoryCandidateSource,
  evidence: readonly string[],
): void {
  if (!validation) {
    return;
  }
  const tests = validation.testsRun ?? [];
  const verifiers = validation.verifierResults ?? [];
  if (
    tests.length === 0 &&
    verifiers.length === 0 &&
    !validation.buildStatus &&
    !validation.resultContractStatus
  ) {
    return;
  }
  const summaryParts = [
    tests.length > 0 ? `${tests.length} focused test command(s)` : undefined,
    verifiers.length > 0 ? `${verifiers.length} verifier command(s)` : undefined,
    validation.buildStatus ? `build=${validation.buildStatus}` : undefined,
    validation.resultContractStatus
      ? `result-contract=${validation.resultContractStatus}`
      : undefined,
  ].filter(Boolean);
  candidates.push(
    createProjectMemoryCandidate({
      candidateKind: "validation-pattern",
      retentionClass: "project-scoped-candidate",
      confidence: "medium",
      source,
      summary: `Validation pattern recorded: ${summaryParts.join(", ")}.`,
      reason: "Validation evidence may become reusable project memory when it recurs across routes.",
      evidence: [
        ...evidence,
        ...tests.map((test) => `test:${test}`),
        ...verifiers.map((verifier) => `verifier:${verifier.command}:${verifier.status}`),
      ],
    }),
  );
}

function classifyProjectHint(summary: string): ProjectMemoryCandidateKind {
  const lower = summary.toLowerCase();
  if (lower.includes("rtk") || lower.includes("validation")) {
    return "validation-pattern";
  }
  if (lower.includes("structure") || lower.includes("control plane") || lower.includes("execution plane")) {
    return "project-structure";
  }
  return "project-fact";
}

function classifyProjectionFact(fact: ContextProjectionFact): ProjectMemoryCandidateKind {
  if (fact.id.includes("blocked")) {
    return "blocked-by-design-decision";
  }
  if (fact.id.includes("edit") || fact.id.includes("capability")) {
    return "capability-state";
  }
  return "project-fact";
}

function summariesFromProjectionFact(fact: ContextProjectionFact): readonly string[] {
  const value = fact.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [fact.summary];
  }
  if ("facts" in value && Array.isArray(value.facts)) {
    return value.facts.filter((entry): entry is string => typeof entry === "string");
  }
  if ("blocked" in value && Array.isArray(value.blocked)) {
    return value.blocked
      .filter(
        (entry): entry is { id: string; reason?: string } =>
          typeof entry === "object" &&
          entry !== null &&
          "id" in entry &&
          typeof entry.id === "string",
      )
      .map((entry) => `${entry.id} is blocked by design${entry.reason ? `: ${entry.reason}` : ""}.`);
  }
  return [fact.summary];
}

function routeSummary(packet: CompactContinuityPacket): string {
  const route = [packet.route.routeId, packet.route.name].filter(Boolean).join(" ");
  const phase = packet.route.currentPhase ? ` phase=${packet.route.currentPhase}` : "";
  const next = packet.route.nextAction ? ` next=${packet.route.nextAction}` : "";
  return `Route ${route || "not recorded"} is current.${phase}${next}`;
}

function compactEvidence(
  packet: CompactContinuityPacket,
  evidence: string,
): readonly string[] {
  return [evidence, ...packet.evidence];
}

function createRejectedCandidate(input: {
  readonly summary: string;
  readonly source: ProjectMemoryCandidateSource;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly redactions?: readonly string[];
}): ProjectMemoryCandidate {
  return createProjectMemoryCandidate({
    candidateKind: "rejected",
    retentionClass: "never-remember",
    confidence: "high",
    source: input.source,
    safety: "unsafe",
    summary: input.summary,
    reason: input.reason,
    evidence: input.evidence,
    redactions: input.redactions,
  });
}

function isUnsafeSummary(value: string): boolean {
  return (
    /\bRAW_[A-Z0-9_]+\b/.test(value) ||
    /\braw (file|recovery|content)\b/i.test(value) ||
    /\bhidden reasoning\b/i.test(value) ||
    /\b(chain[- ]?of[- ]?thought)\b/i.test(value) ||
    /\b(provider credential|provider config|authorization|api key|token)\b/i.test(value) ||
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value)
  );
}

function redactUnsafeSummary(value: string): string {
  if (!value.trim()) {
    return "Unsafe candidate was rejected.";
  }
  if (/\bRAW_RECOVERY[A-Z0-9_]*\b/.test(value)) {
    return "Unsafe candidate was rejected: recovery-content marker.";
  }
  if (/\bRAW_[A-Z0-9_]+\b/.test(value)) {
    return "Unsafe candidate was rejected: file-content marker.";
  }
  if (/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value)) {
    return "Unsafe candidate was rejected: private-reasoning marker.";
  }
  return value
    .replace(/\bRAW_[A-Z0-9_]+\b/g, "[redacted-raw-content]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-secret]")
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, "[redacted-secret]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[redacted-secret]");
}
