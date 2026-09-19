import type { ContextSelection } from "../../../context/selection/model.js";
import type { ToolStrategy } from "../../../tools/policy/strategy.js";
import type { VerificationExecution } from "../../../verification/execution/model.js";
import type { ArtifactReceipt } from "../../../artifacts/workflow/types.js";
import type { TaskRequestPacket } from "../../../provider/request/packet.js";
import type {
  TaskCaseDefinition,
  TaskLiveGate,
  TaskLivePolicy,
  TaskLiveReadiness,
  TaskLiveReadinessBlocker,
  TaskLiveReadinessStatus,
  TaskLiveSafetyClass,
} from "./types.js";


/**
 * Live readiness classification.
 *
 * Decides whether a task case may run against a real provider, and which gate
 * governs it. Kept apart from the execution projection because readiness is
 * decided before a run and the projection describes one after.
 */

export function liveReadinessFor(
  definition: TaskCaseDefinition,
  contextSelection: ContextSelection,
  requestPacket: TaskRequestPacket,
  toolStrategy: ToolStrategy,
  verificationExecution: VerificationExecution,
  artifactReceipt: ArtifactReceipt | undefined,
): TaskLiveReadiness {
  if (definition.expectedOutcome === "unsupported") {
    return liveReadiness({
      definition,
      status: "unsupported",
      safetyClass: "unsupported",
      gate: "missing",
      writePolicy: "unsupported",
      requestPacket,
      toolStrategy,
      validationPlan: "unsupported task path",
      blockers: ["unsupported task path"],
      requirements: [],
      hardBlocker: "unsupported task path",
      nextFix: "add a sanctioned owner and explicit gate before live execution",
    });
  }
  if (definition.taskKind === "live-triage") {
    return liveReadiness({
      definition,
      status: "ready",
      safetyClass: "safe-no-write",
      gate: "provider-readiness",
      writePolicy: "no-write",
      requestPacket,
      toolStrategy,
      validationPlan: "provider readiness preflight with redaction checks",
      blockers: [],
      requirements: liveGateRequirements("provider-readiness"),
      hardBlocker: "",
      nextFix: "run the provider readiness gate with explicit opt-in and isolated runtime home",
    });
  }
  if (definition.caseId === "pathless-workspace-question") {
    return liveReadiness({
      definition,
      status: "ready",
      safetyClass: "safe-no-write",
      gate: "read-only-provider",
      writePolicy: "no-write",
      requestPacket,
      toolStrategy,
      validationPlan: "read-only fixture result, no mutation check, and redaction check",
      blockers: [],
      requirements: liveGateRequirements("read-only-provider"),
      hardBlocker: "",
      nextFix: "run the read-only provider path through the existing explicit opt-in gate",
    });
  }
  if (definition.caseId === "resume-from-context") {
    return liveReadiness({
      definition,
      status: contextSelection.refreshed ? "ready" : "blocked",
      safetyClass: "safe-no-write",
      gate: "anchored-provider",
      writePolicy: "no-write",
      requestPacket,
      toolStrategy,
      validationPlan: "anchored no-apply result with continuation marker and redaction checks",
      blockers: contextSelection.refreshed ? [] : ["continuation stale"],
      requirements: liveGateRequirements("anchored-provider"),
      hardBlocker: contextSelection.refreshed ? "" : "continuation stale",
      nextFix: contextSelection.refreshed
        ? "run the anchored provider path through the existing explicit opt-in gate"
        : "refresh continuation context before live execution",
    });
  }
  if (definition.allowedWrites.length > 0) {
    if (definition.taskPath === "artifact" && artifactReceipt) {
      return liveReadiness({
        definition,
        status: "ready",
        safetyClass: "manual-review",
        gate: "artifact-dry-run",
        writePolicy: "manual-review-required",
        requestPacket,
        toolStrategy,
        validationPlan: "provider artifact proposal, no write, artifact validation, and manual review",
        blockers: [],
        requirements: liveGateRequirements("artifact-dry-run"),
        hardBlocker: "",
        nextFix: "run artifact dry-run through explicit opt-in, then require manual review before any write",
      });
    }
    return liveReadiness({
      definition,
      status: definition.taskPath === "artifact" ? "manual-review-required" : "unsafe",
      safetyClass: definition.taskPath === "artifact" ? "manual-review" : "unsafe",
      gate: "missing",
      writePolicy: definition.taskPath === "artifact" ? "manual-review-required" : "dry-run-only",
      requestPacket,
      toolStrategy,
      validationPlan: artifactReceipt
        ? "artifact validation must run inside a sanctioned artifact owner before live writing"
        : "write task requires dry-run or manual review before live execution",
      blockers: definition.taskPath === "artifact"
        ? ["manual review needed", "artifact validation unavailable"]
        : ["manual review needed"],
      requirements: ["manual review", "sanctioned dry-run or no-write gate"],
      hardBlocker: definition.taskPath === "artifact"
        ? "artifact validation gate missing for live write"
        : "write safety gate missing for live task execution",
      nextFix: definition.taskPath === "artifact"
        ? "add or select an existing artifact validation gate before live artifact writing"
        : "keep write-capable task in dry-run until an existing safe write gate is selected",
    });
  }
  const blockers: TaskLiveReadinessBlocker[] = [];
  if (
    verificationExecution.state !== "passed" &&
    definition.taskKind !== "continuation" &&
    definition.taskKind !== "workspace-understanding"
  ) {
    blockers.push("verification unavailable");
  }
  if (
    artifactReceipt &&
    artifactReceipt.validationState !== "validation-passed"
  ) {
    blockers.push("artifact validation unavailable");
  }
  if (definition.taskKind === "continuation" && !contextSelection.refreshed) {
    blockers.push("continuation stale");
  }
  return liveReadiness({
    definition,
    status: blockers.length === 0 ? "ready" : "blocked",
    safetyClass: "safe-no-write",
    gate: "read-only-provider",
    writePolicy: "no-write",
    requestPacket,
    toolStrategy,
    validationPlan: "read-only result with no mutation and redaction checks",
    blockers,
    requirements: liveGateRequirements("read-only-provider"),
    hardBlocker: blockers.join("; "),
    nextFix: blockers.length === 0
      ? "run the read-only provider path through the existing explicit opt-in gate"
      : "resolve live blockers before gate execution",
  });
}

function liveReadiness(input: {
  readonly definition: TaskCaseDefinition;
  readonly status: TaskLiveReadinessStatus;
  readonly safetyClass: TaskLiveSafetyClass;
  readonly gate: TaskLiveGate | "missing";
  readonly writePolicy: TaskLivePolicy;
  readonly requestPacket: TaskRequestPacket;
  readonly toolStrategy: ToolStrategy;
  readonly validationPlan: string;
  readonly blockers: readonly TaskLiveReadinessBlocker[];
  readonly requirements: readonly string[];
  readonly hardBlocker: string;
  readonly nextFix: string;
}): TaskLiveReadiness {
  return freeze({
    caseId: input.definition.caseId,
    status: input.status,
    safetyClass: input.safetyClass,
    gate: input.gate,
    providerReadiness: input.gate === "missing" ? "missing" : "required-at-gate",
    authReadiness: input.gate === "missing" ? "missing" : "required-at-gate",
    toolPolicy: freeze([...input.toolStrategy.actions]),
    writePolicy: input.writePolicy,
    requestPacketStatus: input.requestPacket.state,
    validationPlan: input.validationPlan,
    blockers: freeze(unique(input.blockers)),
    requirements: freeze(unique([
      ...input.requirements,
      "explicit opt-in",
      "isolated runtime home",
      "redacted output",
    ])),
    hardBlocker: input.hardBlocker,
    nextFix: input.nextFix,
    executed: false,
    evidenceResultStatus: "not-proven",
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
  });
}

function liveGateRequirements(gate: TaskLiveGate): readonly string[] {
  switch (gate) {
    case "read-only-provider":
      return ["provider config", "auth readiness", "read-only fixture", "no mutation check"];
    case "anchored-provider":
      return ["provider config", "auth readiness", "no apply", "anchored output validation"];
    case "provider-readiness":
      return ["provider config", "auth readiness", "provider readiness preflight"];
    case "artifact-dry-run":
      return ["provider config", "auth readiness", "no write", "artifact validation", "manual review before write"];
  }
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return freeze(Array.from(new Set(values)));
}
