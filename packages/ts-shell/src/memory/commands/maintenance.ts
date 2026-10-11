import type { CommandContext, LocalCommandResult } from "../../core/commands/types.js";
import { createProjectMemoryCandidate, dedupeProjectMemoryCandidates, type ProjectMemoryCandidate } from "../projectMemoryCandidate.js";
import type { ProjectMemoryReviewState, ProjectMemoryReviewStateStore } from "../projectMemoryReviewState.js";
import { DEFAULT_PROJECT_MEMORY_INJECTION_STATE_STORE } from "../projectMemoryInjectionState.js";
import { readProjectMemoryHealth, renderProjectMemoryHealth } from "../store/health.js";
import { containsRawContent, containsSecret, containsHiddenReasoning } from "../memoryValidation.js";
import { KNOWLEDGE_LIMITS, QUEUED_MEMORY_EVIDENCE, importKnowledge, knowledgeView, serializeKnowledge } from "../knowledge/model.js";
import { redactUnsafeReportText } from "../../core/security/reportText.js";

const ACTIONS = new Set(["view", "diagnose", "queue", "enqueue", "sync", "import", "export"]);

export function isMemoryMaintenanceAction(action: string): boolean {
  return ACTIONS.has(action);
}

/** Explicitly queued/imported candidates share the existing review queue. */
export function memoryReviewCandidates(extracted: readonly ProjectMemoryCandidate[], state: ProjectMemoryReviewState): readonly ProjectMemoryCandidate[] {
  return dedupeProjectMemoryCandidates([...extracted, ...state.latestCandidates.filter((candidate) => candidate.evidence.includes(QUEUED_MEMORY_EVIDENCE))]);
}

export async function runMemoryMaintenanceCommand(input: {
  readonly action: string;
  readonly args: readonly string[];
  readonly context: CommandContext;
  readonly scope: string;
  readonly candidates: readonly ProjectMemoryCandidate[];
  readonly reviewStore: ProjectMemoryReviewStateStore;
}): Promise<LocalCommandResult> {
  const { action, args, context, scope, reviewStore } = input;
  const state = reviewStore.updateCandidates({ reviewSessionId: scope, candidates: input.candidates, sourceCommand: "/memory" });
  if (action === "queue" || action === "sync") return { kind: "local", output: renderQueue(state, action) };
  if (action === "enqueue") {
    const summary = args.join(" ").trim();
    if (!summary || summary.length > KNOWLEDGE_LIMITS.text || containsSecret(summary) || containsRawContent(summary) || containsHiddenReasoning(summary)) {
      return blocked("Queued statement is empty, oversized, or unsafe.");
    }
    const candidate = createProjectMemoryCandidate({ candidateKind: "project-fact", retentionClass: "project-scoped-candidate",
      confidence: "medium", source: "context-projection", safety: "safe", summary,
      reason: "Explicitly queued for review; approval and save remain separate operations.", evidence: [QUEUED_MEMORY_EVIDENCE, "memory-maintenance:user-enqueue"] });
    const candidates = dedupeProjectMemoryCandidates([...state.latestCandidates, candidate]);
    if (candidates.length > KNOWLEDGE_LIMITS.records) return blocked("Review queue exceeds 256 candidates.");
    const next = reviewStore.updateCandidates({ reviewSessionId: scope, candidates, sourceCommand: "/memory" });
    return { kind: "local", output: `Queued candidate ${candidate.candidateId}.\n${renderQueue(next, action)}`,
      state: { memoryMaintenance: { version: 1, operation: action, candidateIds: [candidate.candidateId] } } };
  }
  if (action === "import") {
    if (!context.dataTransfer) return blocked("File transfer authority is unavailable.");
    const read = await context.dataTransfer.read({ path: args[0]!, maxBytes: KNOWLEDGE_LIMITS.bytes });
    if (read.outcome !== "read") return blocked(`Import ${read.outcome}: ${read.reason}`);
    const imported = importKnowledge(read.content);
    if (reviewStore.get(scope) !== state) return blocked("Review queue changed during import; retry against the current queue.");
    const candidates = dedupeProjectMemoryCandidates([...state.latestCandidates, ...imported]);
    if (candidates.length > KNOWLEDGE_LIMITS.records) return blocked("Review queue exceeds 256 candidates.");
    const next = reviewStore.updateCandidates({ reviewSessionId: scope, candidates, sourceCommand: "/memory" });
    return { kind: "local", output: `Imported ${imported.length} candidates for local review. External approval fields grant no local approval.\n${renderQueue(next, action)}`,
      state: { memoryMaintenance: { version: 1, operation: action, candidateIds: imported.map((candidate) => candidate.candidateId) } } };
  }
  const health = await readProjectMemoryHealth(context.projectMemoryStore);
  if (action === "diagnose") return { kind: "local", output: ["Project memory diagnostics", ...renderProjectMemoryHealth(health), "- Memory written: no", "- Model/provider call: none"].join("\n") };
  if (!context.projectMemoryStore || !(health.readable ?? health.writable)) return blocked("Memory store is unavailable.", renderProjectMemoryHealth(health));
  const listed = await context.projectMemoryStore.list({ includeInvalidated: true });
  if (action === "export") {
    if (!context.dataTransfer) return blocked("File transfer authority is unavailable.");
    if (!health.ok || listed.diagnostics?.length) return blocked("Damaged knowledge cannot be exported as a complete document.", renderProjectMemoryHealth(health));
    const active = listed.records.filter((record) => !record.invalidatedAt);
    const result = await context.dataTransfer.write({ path: args[0]!, content: serializeKnowledge(active) });
    return { kind: "local", output: `Memory export outcome: ${result.outcome}.${result.reason ? ` ${result.reason}` : ""}\n- Memory written: no` };
  }
  const injection = (context.projectMemoryInjectionStateStore ?? DEFAULT_PROJECT_MEMORY_INJECTION_STATE_STORE).get(scope);
  const records = args[0] ? listed.records.filter((record) => record.id === args[0]) : listed.records.slice(0, KNOWLEDGE_LIMITS.records);
  if (args[0] && !records.length) return blocked("Unknown knowledge record ID.");
  const view = knowledgeView(records);
  return { kind: "local", output: ["Project memory knowledge view", "- Schema version: 1", `- Revision: ${view.revision}`,
    ...renderProjectMemoryHealth(health), ...(listed.diagnostics ?? []).map((diagnostic) => `- Warning: ${diagnostic}`),
    `- Knowledge records shown: ${records.length}/${listed.records.length}`, `- Injection status: ${injection.injectionStatus}`,
    `- Staged record IDs: ${injection.recordIds.join(", ") || "none"}`,
    `- Injection source: ${injection.sourceCommand ?? "none"}`,
    `- Admitted payload hash: ${injection.provenance?.contextHash ?? "none"}`,
    "- Memory written: no", "- Approval grants no write or goal-completion authority.", "",
    ...records.map((record) => `- ${record.id} [version ${record.version}; ${record.invalidatedAt ? "invalidated" : "active"}; source ${record.source}; approved ${record.approvedAt}]: ${redactUnsafeReportText(record.memoryText, undefined, KNOWLEDGE_LIMITS.text)}`),
    "", "Admitted injection sources", ...(injection.provenance?.records.map((record) => `- ${record.id}: ${record.source}; approved ${record.approvedAt}; created ${record.createdAt}`) ?? ["- none"]),
    "", "Admitted injection payload", injection.provenance?.context ?? "No payload admitted in this retained injection state.",
    ...(injection.incomplete ? ["- Injection history is incomplete; older provenance is unavailable."] : []),
  ].join("\n") };
}

function renderQueue(state: ProjectMemoryReviewState, action: string): string {
  return ["Project memory maintenance queue", `- Operation: ${action}`, `- Retained candidates: ${state.latestCandidates.length}`,
    `- Approved for separate save: ${state.approvedCandidates.length}`, "- Memory written: no", "- Auto-injected: no",
    "- Consolidation is local review; run /memory approve then /memory save explicitly.",
    ...(state.incomplete ? ["- Review queue history is incomplete."] : []),
    ...state.decisions.filter((entry) => entry.decision !== "superseded").map((entry) => `- ${entry.candidateId}: ${entry.decision}; ${redactUnsafeReportText(entry.candidate.summary)}`),
  ].join("\n");
}

function blocked(reason: string, detail: readonly string[] = []): LocalCommandResult {
  return { kind: "local", output: ["Project memory maintenance", "- Outcome: blocked", `- Reason: ${reason}`, ...detail, "- Memory written: no", "- Auto-injected: no"].join("\n") };
}
