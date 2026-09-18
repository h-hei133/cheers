import { EDIT_CAPABILITY_CLOSEOUT_MANIFEST } from "../../edit/result/editCapabilityCloseoutManifest.js";
import { listEditCapabilityReadiness } from "../../edit/result/editCapabilityReadiness.js";
import type { ProjectMemoryRecord, ProjectMemoryStore } from "../../memory/projectMemoryStoreContract.js";
import { buildProjectMemoryWakeupPreview } from "../../memory/projectMemoryWakeup.js";
import {
  buildStartupWarmContextCache,
  computeStartupWarmSourceSignature,
  sanitizeWarmCacheText,
  type StartupWarmContextCache,
  type StartupWarmContextCacheMode,
  type StartupWarmContextSection,
} from "./startupWarmContextCache.js";

export interface StartupWarmContextBuilderInput {
  readonly projectRoot: string;
  readonly cacheMode?: StartupWarmContextCacheMode;
  readonly createdAt?: string;
  readonly memoryStore?: ProjectMemoryStore;
  readonly memoryRecords?: readonly ProjectMemoryRecord[];
  readonly compactSummary?: string;
  readonly validationEvidence?: readonly string[];
  readonly routePhase?: {
    readonly summary: string;
    readonly nextAction?: string;
    readonly evidence?: readonly string[];
  };
  readonly memoryInjectionQualitySummary?: string;
}

export interface StartupWarmContextBuildResult {
  readonly cache: StartupWarmContextCache;
  readonly evidence: readonly string[];
}

export async function buildStartupWarmContext(
  input: StartupWarmContextBuilderInput,
): Promise<StartupWarmContextBuildResult> {
  const redactions = new Set<string>();
  const readiness = listEditCapabilityReadiness();
  const activeRecords = await collectActiveMemoryRecords(input);
  const memoryWakeup = await buildMemoryWakeupSection(input, activeRecords, redactions);
  const editCapabilitySummary = section("available", summarizeEditCapability(), [
    "startup-warm-context-builder:edit-capability-readiness",
    `startup-warm-context-builder:readiness-count=${readiness.length}`,
  ]);
  const compactSummary = section(
    input.compactSummary ? "available" : "missing",
    input.compactSummary
      ? sanitizeWarmCacheText(input.compactSummary, redactions)
      : "No compact summary was provided to the warm cache builder.",
    input.compactSummary
      ? ["startup-warm-context-builder:compact-summary-provided"]
      : ["startup-warm-context-builder:compact-summary-missing"],
  );
  const validationSummary = section(
    input.validationEvidence?.length ? "available" : "missing",
    input.validationEvidence?.length
      ? input.validationEvidence.map((entry) => sanitizeWarmCacheText(entry, redactions, 180)).join("; ")
      : "No validation evidence was provided to the warm cache builder.",
    input.validationEvidence?.length
      ? ["startup-warm-context-builder:validation-evidence-provided"]
      : ["startup-warm-context-builder:validation-evidence-missing"],
  );
  const routePhaseSummary = section(
    input.routePhase ? "available" : "missing",
    input.routePhase
      ? [
          sanitizeWarmCacheText(input.routePhase.summary, redactions),
          input.routePhase.nextAction
            ? `Next action: ${sanitizeWarmCacheText(input.routePhase.nextAction, redactions)}`
            : "",
        ].filter(Boolean).join(" ")
      : "No route phase summary was provided.",
    input.routePhase?.evidence ?? ["startup-warm-context-builder:route-phase-missing"],
  );
  const sourceValues = [
    editCapabilitySummary.summary,
    compactSummary.summary,
    memoryWakeup.summary,
    validationSummary.summary,
    routePhaseSummary.summary,
    input.memoryInjectionQualitySummary ?? "",
  ];
  const cache = buildStartupWarmContextCache({
    cacheMode: input.cacheMode ?? "test-only",
    projectRoot: input.projectRoot,
    createdAt: input.createdAt ?? new Date(0).toISOString(),
    sourceSummary: {
      sourceSignature: computeStartupWarmSourceSignature(sourceValues),
      sources: [
        "edit-capability-closeout",
        "compact-v2-summary",
        "project-memory-wakeup-preview",
        "validation-evidence",
        "route-phase-summary",
      ],
      generatedFrom: [
        "startupWarmContextBuilder",
        input.memoryStore ? "projectMemoryStore:list-default-active-only" : "provided-memory-records",
      ],
    },
    editCapabilitySummary,
    compactSummary,
    memoryWakeupSummary: memoryWakeup,
    validationSummary,
    routePhaseSummary,
    redactions: Array.from(redactions),
    warnings: [
      "startup-warm-context:auto-model-injection-disabled",
      "startup-warm-context:startup-auto-load-disabled",
      ...(input.memoryInjectionQualitySummary
        ? [`memory injection quality: ${sanitizeWarmCacheText(input.memoryInjectionQualitySummary, redactions, 180)}`]
        : []),
    ],
  });
  return {
    cache,
    evidence: [
      "startup-warm-context-builder:pure",
      "startup-warm-context-builder:no-provider-call",
      "startup-warm-context-builder:no-persistence-write",
      "startup-warm-context-builder:no-future-turn-injection",
      "startup-warm-context-builder:invalidated-deleted-excluded",
    ],
  };
}

async function collectActiveMemoryRecords(
  input: StartupWarmContextBuilderInput,
): Promise<readonly ProjectMemoryRecord[]> {
  if (input.memoryStore) {
    return (await input.memoryStore.list()).records;
  }
  return (input.memoryRecords ?? []).filter((record) => !record.invalidatedAt);
}

async function buildMemoryWakeupSection(
  input: StartupWarmContextBuilderInput,
  records: readonly ProjectMemoryRecord[],
  redactions: Set<string>,
): Promise<StartupWarmContextSection> {
  if (input.memoryStore) {
    const wakeup = await buildProjectMemoryWakeupPreview(input.memoryStore);
    const selected = [...wakeup.l0.records, ...wakeup.l1.records];
    return section(
      selected.length > 0 ? "available" : "missing",
      selected.length > 0
        ? selected.map((record) => memoryRecordLine(record, redactions)).join("; ")
        : "No active approved project memory records are available for warm cache.",
      [
        ...wakeup.evidence,
        "startup-warm-context-builder:memory-wakeup-preview",
        "startup-warm-context-builder:memory-auto-injection-disabled",
      ],
    );
  }
  return section(
    records.length > 0 ? "available" : "missing",
    records.length > 0
      ? records.slice(0, 8).map((record) => memoryRecordLine(record, redactions)).join("; ")
      : "No active approved project memory records were provided.",
    [
      "startup-warm-context-builder:provided-memory-records",
      "startup-warm-context-builder:memory-auto-injection-disabled",
    ],
  );
}

function summarizeEditCapability(): string {
  const entries = EDIT_CAPABILITY_CLOSEOUT_MANIFEST.entries;
  const ready = entries.filter((entry) => entry.status === "default-ready-candidate").length;
  const blocked = entries.filter((entry) => entry.status === "blocked-by-design").length;
  return [
    `Edit closeout status: ${EDIT_CAPABILITY_CLOSEOUT_MANIFEST.status}.`,
    `Default-ready candidates: ${ready}.`,
    `Blocked-by-design capabilities: ${blocked}.`,
    "Automatic recovery: no.",
    "Atomic rollback: no.",
  ].join(" ");
}

function memoryRecordLine(record: ProjectMemoryRecord, redactions: Set<string>): string {
  return [
    sanitizeWarmCacheText(record.memoryText, redactions, 220),
    `[${record.candidateKind}; ${record.id}]`,
  ].join(" ");
}

function section(
  status: StartupWarmContextSection["status"],
  summary: string,
  evidence: readonly string[],
): StartupWarmContextSection {
  return { status, summary, evidence };
}
