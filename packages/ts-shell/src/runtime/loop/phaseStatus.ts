export type ProductLoopPhaseIntegrationStatus =
  | "product_integrated"
  | "observation_only"
  | "contract_only"
  | "projection_only"
  | "unsupported"
  | "not_proven"
  | "deferred";

export interface ProductLoopPhaseStatusEntry {
  readonly phaseId: string;
  readonly title: string;
  readonly ownerDomain: string;
  readonly routeBlock: "PL002" | "PL004" | "PL005" | "PL006" | "PL007" | "PL008" | "PL009";
  readonly status: ProductLoopPhaseIntegrationStatus;
  readonly truthfulnessBoundary: string;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export const PRODUCT_LOOP_PHASE_STATUS_MAP = Object.freeze([
  phase("cli-prompt-input", "CLI prompt input", "core/shell", "PL002", "product_integrated", "Prompt observation is not task success.", ["terminal-success"]),
  phase("turn-snapshot", "Turn snapshot", "turn", "PL002", "product_integrated", "Snapshot capture is not execution success.", ["terminal-success"]),
  phase("provider-model-boundary", "Provider/model boundary", "provider", "PL004", "observation_only", "Model response metadata is a claim, not a result verdict.", ["provider-success", "terminal-success"]),
  phase("assistant-accumulation", "Assistant accumulation", "turn", "PL004", "observation_only", "Assistant text accumulation is not task success.", ["assistant-output-is-not-success", "terminal-success"]),
  phase("tool-call-extraction", "Tool-call extraction", "tools", "PL004", "product_integrated", "Extracted tool calls are not dispatched tool success.", ["tool-success", "terminal-success"]),
  phase("before-tool-policy", "Before-tool policy", "tools", "PL005", "product_integrated", "Policy selection is not write, tool, or task success.", ["tool-success", "terminal-success"]),
  phase("tool-dispatch", "Tool dispatch", "tools", "PL005", "observation_only", "Dispatch observation preserves receipt status without upgrading it.", ["tool-success", "terminal-success"]),
  phase("execution-receipt", "Execution receipt", "runtime/execution", "PL005", "observation_only", "Receipt exit status is not task success.", ["command-success", "terminal-success"]),
  phase("tool-result-details", "Tool result details", "tools", "PL005", "observation_only", "Tool result details remain report-safe observations.", ["tool-success", "terminal-success"]),
  phase("tool-result-messages", "Tool result messages", "turn", "PL005", "product_integrated", "Prepared messages do not execute a next turn.", ["next-turn-success", "tool-success", "terminal-success"]),
  phase("save-point", "Save point", "evidence", "PL006", "product_integrated", "Save point evidence is not terminal success.", ["save-point-success", "terminal-success"]),
  phase("next-turn-bundle", "Next-turn bundle", "turn", "PL006", "contract_only", "Bundle preparation does not execute a provider turn.", ["next-turn-success", "provider-success", "terminal-success"]),
  phase("steering", "Steering", "turn", "PL006", "contract_only", "Steering queue state is not delivery or task success.", ["steering-delivery-success", "next-turn-success", "terminal-success"]),
  phase("follow-up", "Follow-up", "turn", "PL006", "contract_only", "Follow-up queue state is not delivery or task success.", ["follow-up-delivery-success", "next-turn-success", "terminal-success"]),
  phase("delivery-policy", "Delivery policy", "turn", "PL006", "contract_only", "Delivery policy can wait or block without calling a provider.", ["next-turn-success", "provider-called", "terminal-success"]),
  phase("verification-handoff", "Verification handoff", "verification", "PL007", "contract_only", "Verification selection or handoff is not verification success.", ["verification-success", "task-success", "terminal-success"]),
  phase("repair-handoff", "Repair handoff", "repair", "PL007", "contract_only", "Repair handoff or proposal is not repair success.", ["repair-success", "terminal-success"]),
  phase("session-active-path", "Session active path", "session", "PL008", "projection_only", "Active path projection is not storage-backed branching.", ["session-storage-backed-branching", "terminal-success"]),
  phase("context-rebuild", "Context rebuild", "context", "PL008", "projection_only", "Context rebuild input and projection do not prove context completeness.", ["context-completeness", "context-rebuild-success", "terminal-success"]),
  phase("continuation-readiness", "Continuation readiness", "session", "PL008", "not_proven", "Readiness never implies a next turn ran or continuation succeeded.", ["continuation-success", "next-turn-success", "terminal-success"]),
  phase("replay-safe-state", "Replay-safe state", "session", "PL008", "projection_only", "Replay-safe summary is not replay execution or terminal success.", ["replay-safe-summary-is-not-success", "terminal-success"]),
  phase("runtime-events", "Runtime events", "runtime/events", "PL009", "observation_only", "Events are observations only.", ["event-observed-is-not-success", "terminal-success"]),
  phase("json-event-stream", "JSON event stream", "runtime/events", "PL009", "observation_only", "JSON stream entries are report-safe observations only.", ["event-stream-is-not-success", "terminal-success"]),
  phase("product-surface", "Product surface", "presentation", "PL009", "product_integrated", "Rendering cannot upgrade verdict or result truth.", ["product-surface-rendered-is-not-success", "terminal-success"]),
  phase("result-truthfulness", "Result truthfulness", "result", "PL009", "product_integrated", "Result and evidence boundaries own terminal truth.", ["adapter-observed-is-not-success"]),
  phase("storage-backed-branching", "Storage-backed branching", "session", "PL009", "unsupported", "PL009 exposes the gap without implementing branch storage.", ["storage-backed-branching", "branch-summary-truth"]),
  phase("storage-backed-compaction", "Storage-backed compaction", "session", "PL009", "unsupported", "PL009 exposes the gap without implementing compaction storage.", ["storage-backed-compaction", "compaction-summary-truth"]),
  phase("future-capability-blocks", "Future capability blocks", "runtime/loop", "PL009", "deferred", "Future features must declare the feature integration contract first.", ["future-feature-success", "terminal-success"]),
] as const);

export function getProductLoopPhaseStatusMap(): readonly ProductLoopPhaseStatusEntry[] {
  return PRODUCT_LOOP_PHASE_STATUS_MAP;
}

function phase(
  phaseId: string,
  title: string,
  ownerDomain: string,
  routeBlock: ProductLoopPhaseStatusEntry["routeBlock"],
  status: ProductLoopPhaseIntegrationStatus,
  truthfulnessBoundary: string,
  notProvenClaims: readonly string[],
): ProductLoopPhaseStatusEntry {
  return Object.freeze({
    phaseId,
    title,
    ownerDomain,
    routeBlock,
    status,
    truthfulnessBoundary,
    notProvenClaims: Object.freeze([...new Set(["terminal-success", ...notProvenClaims])]),
    terminalSuccessClaim: false,
  });
}
