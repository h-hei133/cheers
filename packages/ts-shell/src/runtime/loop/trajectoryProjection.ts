import type { SessionContextRebuildProjection } from "../../context/sessionContextRebuildProjection.js";
import type { RuntimeResultFactsProjection, RuntimeProjectionEvent } from "../events/runtimeEventProjection.js";
import { projectJsonRuntimeEventStream, type JsonRuntimeEventStreamEntry } from "../events/jsonEventStream.js";
import type { RuntimeExecutionReceiptProjection } from "../execution/executionReceipt.js";
import type { PackageInventoryProjection } from "../resources/packageInventory.js";
import type { StaticResourceProjection } from "../resources/staticResourceProjection.js";
import type { ProviderRegistryProjection } from "../../provider/providerRegistry.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";
import type {
  ToolAfterObservationAnnotation,
  ToolBeforePolicyDecision,
} from "../../tools/interception.js";
import type { ToolExecutionResult } from "../../tools/types.js";
import type { AgentLoopContractProjection } from "./agentLoopContract.js";
import {
  createLoopInfrastructureMap,
  type LoopInfrastructureCategory,
  type LoopInfrastructureConnectionStatus,
} from "./infrastructureMap.js";

export type LoopTrajectoryStageStatus =
  | "observed"
  | "partial"
  | "unsupported"
  | "not_proven";

export interface LoopTrajectoryStage {
  readonly category: LoopInfrastructureCategory;
  readonly ownerDomain: string;
  readonly connectionStatus: LoopInfrastructureConnectionStatus;
  readonly observationStatus: LoopTrajectoryStageStatus;
  readonly sourceIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface LoopTrajectoryProjectionInput {
  readonly loopId: string;
  readonly prompt?: string;
  readonly loop?: AgentLoopContractProjection;
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly toolPolicyDecisions?: readonly ToolBeforePolicyDecision[];
  readonly toolResultAnnotations?: readonly ToolAfterObservationAnnotation[];
  readonly sessionProjection?: SessionTreeProjection;
  readonly contextRebuildProjection?: SessionContextRebuildProjection;
  readonly resourceProjection?: StaticResourceProjection;
  readonly packageInventory?: PackageInventoryProjection;
  readonly resultFacts?: RuntimeResultFactsProjection;
  readonly productSurfaceSectionIds?: readonly string[];
}

export interface LoopTrajectoryProjection {
  readonly loopId: string;
  readonly turnIds: readonly string[];
  readonly snapshotIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly receiptIds: readonly string[];
  readonly toolPolicyIds: readonly string[];
  readonly toolResultMessageIds: readonly string[];
  readonly savePointIds: readonly string[];
  readonly sessionProjectionIds: readonly string[];
  readonly contextRebuildProjectionIds: readonly string[];
  readonly providerMetadataIds: readonly string[];
  readonly productSurfaceSectionIds: readonly string[];
  readonly stages: readonly LoopTrajectoryStage[];
  readonly events: readonly RuntimeProjectionEvent[];
  readonly jsonEventStream: readonly JsonRuntimeEventStreamEntry[];
  readonly finalObservedFacts: {
    readonly loopState?: string;
    readonly stopReason?: string;
    readonly failureClass?: string;
    readonly resultStatus?: string;
    readonly terminalClassification?: string;
    readonly terminalReason?: string;
    readonly terminalSuccessClaim: false;
  };
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly terminalSuccessClaim: false;
}

const LOOP_PRODUCT_SURFACE_SECTION_IDS = [
  "task",
  "turn",
  "provider",
  "tools",
  "execution",
  "save_point",
  "session",
  "context",
  "events",
  "verdict",
  "not_proven",
  "next_action",
] as const;

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "transcript-dumps",
  "unsafe-file-contents",
] as const;

export function projectLoopTrajectory(
  input: LoopTrajectoryProjectionInput,
): LoopTrajectoryProjection {
  const infrastructureMap = createLoopInfrastructureMap();
  const events: RuntimeProjectionEvent[] = [];
  const observed = new Map<LoopInfrastructureCategory, {
    readonly sourceIds: readonly string[];
    readonly eventIds: readonly string[];
    readonly notProvenClaims: readonly string[];
  }>();
  let redacted = false;
  const loopId = sanitizeText(input.loopId);
  redacted ||= loopId.redacted;
  const prompt = sanitizeText(input.prompt ?? "");
  redacted ||= prompt.redacted;

  const append = (
    category: LoopInfrastructureCategory,
    type: RuntimeProjectionEvent["type"],
    facts: Record<string, unknown>,
    notProvenClaims: readonly string[] = ["terminal-success"],
    sourceIds: readonly string[] = [],
  ) => {
    const sequence = events.length + 1;
    const sanitized = sanitizeValue(facts) as Record<string, unknown>;
    redacted ||= JSON.stringify(facts) !== JSON.stringify(sanitized);
    const redactionStatus: "report-safe" | "redacted" =
      JSON.stringify(facts) === JSON.stringify(sanitized)
        ? "report-safe"
        : "redacted";
    const event: RuntimeProjectionEvent = deepFreeze({
      id: `loop-trajectory-event-${sequence}`,
      sequence,
      type,
      facts: {
        ...sanitized,
        terminalSuccessClaim: false,
      },
      notProvenClaims: Object.freeze([
        ...new Set(["terminal-success", ...notProvenClaims]),
      ]),
      redaction: {
        status: redactionStatus,
        excluded: REDACTION_EXCLUSIONS,
      },
    });
    events.push(event);
    const previous = observed.get(category);
    observed.set(category, {
      sourceIds: Object.freeze([
        ...new Set([...(previous?.sourceIds ?? []), ...sourceIds.map((id) => sanitizeText(id).value)]),
      ]),
      eventIds: Object.freeze([
        ...new Set([...(previous?.eventIds ?? []), event.id]),
      ]),
      notProvenClaims: Object.freeze([
        ...new Set([...(previous?.notProvenClaims ?? []), ...event.notProvenClaims]),
      ]),
    });
  };

  append(
    "prompt-input",
    "loop-input-observed",
    {
      loopId: loopId.value,
      promptSummary: prompt.value ? summarizeText(prompt.value) : "not-provided",
    },
    ["terminal-success", "prompt-input-is-not-task-success"],
  );

  const turns = input.loop?.turns ?? [];
  for (const turn of turns) {
    append(
      "turn-snapshot",
      "loop-turn-snapshot-observed",
      {
        turn: turn.turn,
        snapshotId: turn.snapshot.id,
        sessionId: turn.snapshot.sessionId,
        phase: turn.snapshot.phase,
      },
      turn.snapshot.redaction.excluded,
      [turn.snapshot.id],
    );
    append(
      "runtime-phase",
      "loop-turn-snapshot-observed",
      {
        turn: turn.turn,
        snapshotId: turn.snapshot.id,
        phase: turn.snapshot.phase,
      },
      ["terminal-success"],
      [turn.snapshot.id],
    );
    append(
      "model-boundary",
      "loop-provider-boundary-observed",
      {
        turn: turn.turn,
        responseId: turn.modelBoundary.responseId,
        stopReason: turn.modelBoundary.stopReason,
        responseSource: turn.modelBoundary.responseSource,
        responseStatus: turn.modelBoundary.responseStatus,
        assistantAccumulationStatus: turn.modelBoundary.assistantAccumulationStatus,
        toolCallCount: turn.modelBoundary.toolCallCount,
      },
      turn.notProvenClaims,
      [turn.modelBoundary.responseId],
    );
    if (turn.normalizedToolCallBatch) {
      append(
        "tool-call-batch",
        turn.normalizedToolCallBatch.extractionStatus === "failed"
          ? "tool-call-extraction-failed"
          : "tool-call-batch-extracted",
        {
          turn: turn.turn,
          batchId: turn.normalizedToolCallBatch.batchId,
          extractionStatus: turn.normalizedToolCallBatch.extractionStatus,
          dispatchStatus: turn.normalizedToolCallBatch.dispatchStatus,
          callCount: turn.normalizedToolCallBatch.calls.length,
          malformedCallCount: turn.normalizedToolCallBatch.malformedCallCount,
          unsupportedCallCount: turn.normalizedToolCallBatch.unsupportedCallCount,
          toolNames: turn.normalizedToolCallBatch.calls.map((call) => call.name),
        },
        turn.normalizedToolCallBatch.notProvenClaims,
        [turn.normalizedToolCallBatch.batchId],
      );
      append(
        "before-tool-policy",
        "tool-dispatch-not-run",
        {
          turn: turn.turn,
          batchId: turn.normalizedToolCallBatch.batchId,
          dispatchStatus: turn.normalizedToolCallBatch.dispatchStatus,
          terminalSuccessClaim: false,
        },
        turn.normalizedToolCallBatch.notProvenClaims,
        [turn.normalizedToolCallBatch.batchId],
      );
    } else if (turn.toolCallBatch) {
      append(
        "tool-call-batch",
        "loop-tool-policy-observed",
        {
          turn: turn.turn,
          batchId: turn.toolCallBatch.id,
          policy: turn.toolCallBatch.policy,
          callCount: turn.toolCallBatch.calls.length,
          toolNames: turn.toolCallBatch.calls.map((call) => call.name),
        },
        ["terminal-success", "tool-success"],
        [turn.toolCallBatch.id],
      );
    }
    if (turn.toolResultBatch) {
      if (turn.toolResultBatch.dispatchPlan) {
        append(
          "before-tool-policy",
          "tool-batch-dispatch-planned",
          {
            turn: turn.turn,
            planId: turn.toolResultBatch.dispatchPlan.planId,
            batchId: turn.toolResultBatch.dispatchPlan.batchId,
            dispatchStatus: turn.toolResultBatch.dispatchPlan.dispatchStatus,
            dispatchPolicy: turn.toolResultBatch.dispatchPlan.dispatchPolicy,
            authorityRequiredCallIds: turn.toolResultBatch.dispatchPlan.authorityRequiredCallIds,
            blockedCallIds: turn.toolResultBatch.dispatchPlan.blockedCallIds,
            unsupportedCallIds: turn.toolResultBatch.dispatchPlan.unsupportedCallIds,
            dispatchedCallIds: turn.toolResultBatch.dispatchPlan.dispatchedCallIds,
          },
          turn.toolResultBatch.dispatchPlan.notProvenClaims,
          [turn.toolResultBatch.dispatchPlan.planId],
        );
        for (const planned of turn.toolResultBatch.dispatchPlan.calls) {
          append(
            "before-tool-policy",
            "before-tool-policy-decided",
            {
              turn: turn.turn,
              planId: turn.toolResultBatch.dispatchPlan.planId,
              toolCallId: planned.toolCallId,
              toolName: planned.toolName,
              dispatchStatus: planned.dispatchStatus,
              decisionId: planned.beforePolicyDecision.decisionId,
              decisionStatus: planned.beforePolicyDecision.status,
            },
            planned.notProvenClaims,
            [planned.beforePolicyDecision.decisionId],
          );
        }
      }
      for (const result of turn.toolResultBatch.results) {
        append(
          "tool-result-details",
          "loop-tool-result-observed",
          {
            batchId: turn.toolResultBatch.id,
            successObserved: result.success,
            reportSafe: result.reportSafe,
          },
          ["terminal-success", "tool-success", ...(result.reportSafe?.notProvenClaims ?? [])],
          [turn.toolResultBatch.id],
        );
      }
      for (const receipt of turn.toolResultBatch.executionReceipts) {
        appendReceipt(receipt);
      }
      for (const detail of turn.toolResultBatch.resultDetails ?? []) {
        append(
          "tool-result-details",
          "loop-tool-result-observed",
          {
            turn: turn.turn,
            batchId: turn.toolResultBatch.id,
            resultDetailsId: detail.resultDetailsId,
            toolCallId: detail.toolCallId,
            resultStatus: detail.resultStatus,
            dispatchStatus: detail.systemDetails.dispatchStatus,
            executionReceiptId: detail.systemDetails.executionReceiptId,
          },
          detail.notProvenClaims,
          [detail.resultDetailsId],
        );
      }
      if (turn.toolResultBatch.resultMessages) {
        for (const message of turn.toolResultBatch.resultMessages.messages) {
          append(
            "tool-result-messages",
            "tool-result-message-prepared",
            {
              turn: turn.turn,
              batchId: turn.toolResultBatch.resultMessages.batchId,
              messageId: message.messageId,
              toolCallId: message.toolCallId,
              deliveryStatus: message.deliveryStatus,
              redactionStatus: message.redactionStatus,
            },
            message.notProvenClaims,
            [message.messageId],
          );
        }
      }
      for (const annotation of turn.toolResultBatch.afterAnnotations ?? []) {
        append(
          "after-tool-annotation",
          "loop-tool-result-observed",
          {
            annotationId: annotation.annotationId,
            decisionId: annotation.decisionId,
            toolId: annotation.toolId,
            resultStatus: annotation.resultStatus,
            blockedFollowUp: annotation.blockedFollowUp,
          },
          annotation.notProvenClaims,
          [annotation.annotationId],
        );
      }
    }
    append(
      "save-point",
      "loop-save-point-observed",
      {
        turn: turn.turn,
        savePointId: turn.savePoint.id,
        phase: turn.savePoint.phase,
        resultProjectionStatus: turn.savePoint.resultProjectionStatus,
        sessionPersistenceStatus: turn.savePoint.sessionPersistenceStatus,
      },
      turn.savePoint.notProvenClaims,
      [turn.savePoint.id],
    );
    append(
      "next-turn-preparation",
      "loop-next-turn-prepared",
      {
        turn: turn.turn,
        prepared: turn.nextTurn.prepared,
        pendingFactCount: turn.nextTurn.pendingFacts.length,
      },
      ["terminal-success", "next-turn-success"],
      [`turn:${turn.turn}`],
    );
  }

  if (input.providerRegistry) {
    append(
      "provider-metadata",
      "loop-provider-boundary-observed",
      {
        registryMode: input.providerRegistry.registryMode,
        providerCount: input.providerRegistry.providers.length,
        modelCount: input.providerRegistry.models.length,
        providerDefaultEnablement: input.providerRegistry.providerDefaultEnablement,
      },
      input.providerRegistry.notProvenClaims,
      [
        ...input.providerRegistry.providers.map((provider) => provider.providerId),
        ...input.providerRegistry.models.map((model) => model.modelId),
      ],
    );
  }

  for (const decision of input.toolPolicyDecisions ?? []) {
    append(
      "before-tool-policy",
      "loop-tool-policy-observed",
      {
        decisionId: decision.decisionId,
        toolId: decision.intent.toolId,
        status: decision.status,
        authorityRequirement: decision.authorityRequirement,
        policySource: decision.policySource,
      },
      decision.notProvenClaims,
      [decision.decisionId],
    );
  }

  for (const annotation of input.toolResultAnnotations ?? []) {
    append(
      "after-tool-annotation",
      "loop-tool-result-observed",
      {
        annotationId: annotation.annotationId,
        decisionId: annotation.decisionId,
        toolId: annotation.toolId,
        resultStatus: annotation.resultStatus,
        blockedFollowUp: annotation.blockedFollowUp,
      },
      annotation.notProvenClaims,
      [annotation.annotationId],
    );
  }

  if (input.sessionProjection) {
    append(
      "session-active-path",
      "loop-session-context-projected",
      {
        sessionIdentity: input.sessionProjection.sessionIdentity,
        activeLeafId: input.sessionProjection.activeLeafId,
        pathLength: input.sessionProjection.activePathProjection.pathLength,
        contextRebuildReadiness:
          input.sessionProjection.activePathProjection.contextRebuildReadiness,
      },
      [
        "terminal-success",
        ...input.sessionProjection.activePathProjection.unsupportedClaims,
      ],
      [input.sessionProjection.activeLeafId],
    );
  }

  if (input.contextRebuildProjection) {
    append(
      "context-rebuild-projection",
      "loop-session-context-projected",
      {
        sessionIdentity: input.contextRebuildProjection.rebuildSource.sessionIdentity,
        activeLeafId: input.contextRebuildProjection.rebuildSource.activeLeafId,
        activePathEntriesConsidered:
          input.contextRebuildProjection.activePathEntriesConsidered.length,
        missingFacts: input.contextRebuildProjection.missingFacts,
      },
      input.contextRebuildProjection.notProvenClaims,
      [input.contextRebuildProjection.rebuildSource.activeLeafId],
    );
  }

  if (input.resourceProjection || input.packageInventory) {
    append(
      "package-resource-inventory",
      "loop-session-context-projected",
      {
        resourceCount: input.resourceProjection?.resources.length ?? 0,
        packageCount: input.packageInventory?.packages.length ?? 0,
        dynamicDiscovery:
          input.resourceProjection?.dynamicDiscovery ??
            input.packageInventory?.dynamicDiscovery,
        packageLoading:
          input.resourceProjection?.packageLoading ??
            input.packageInventory?.packageLoading,
      },
      [
        "terminal-success",
        ...(input.resourceProjection?.notProvenClaims ?? []),
        ...(input.packageInventory?.notProvenClaims ?? []),
      ],
    );
  }

  append(
    "runtime-events",
    input.loop?.state === "stopped" || input.loop?.state === "failed" ||
        input.loop?.state === "aborted"
      ? "loop-stopped"
      : "loop-waiting",
    {
      loopState: input.loop?.state ?? "not-observed",
      eventCount: events.length,
      terminalSuccessClaim: false,
    },
    ["terminal-success"],
  );

  if (input.resultFacts) {
    append(
      "result-facts",
      "loop-stopped",
      {
        status: input.resultFacts.status,
        terminalClassification: input.resultFacts.terminalClassification,
        terminalReason: input.resultFacts.terminalReason,
        verdictSource: input.resultFacts.verdictSource ?? "unknown",
      },
      ["terminal-success"],
    );
  }

  const productSurfaceSectionIds = Object.freeze([
    ...new Set([
      ...LOOP_PRODUCT_SURFACE_SECTION_IDS,
      ...(input.productSurfaceSectionIds ?? []),
    ].map((id) => sanitizeText(id).value)),
  ]);
  append(
    "product-surface",
    "loop-product-surface-projected",
    {
      sectionIds: productSurfaceSectionIds,
      terminalSuccessClaim: false,
    },
    ["terminal-success", "product-surface-rendered-is-not-success"],
    productSurfaceSectionIds,
  );

  append(
    "not-proven-claims",
    "loop-stopped",
    {
      claimCount: Array.from(observed.values()).flatMap((item) => item.notProvenClaims).length,
      terminalSuccessClaim: false,
    },
    ["terminal-success"],
  );

  const jsonEventStream = projectJsonRuntimeEventStream({
    streamId: `loop-trajectory:${loopId.value}`,
    events,
  });
  observed.set("json-event-stream", {
    sourceIds: Object.freeze([`loop-trajectory:${loopId.value}`]),
    eventIds: Object.freeze(jsonEventStream.map((entry) => entry.eventId)),
    notProvenClaims: Object.freeze(["terminal-success"]),
  });

  const stages = infrastructureMap.entries.map((mapEntry): LoopTrajectoryStage => {
    const match = observed.get(mapEntry.category);
    const observationStatus: LoopTrajectoryStageStatus = match
      ? mapEntry.connectionStatus === "partial" ? "partial" : "observed"
      : mapEntry.connectionStatus === "unsupported"
        ? "unsupported"
        : "not_proven";
    return {
      category: mapEntry.category,
      ownerDomain: mapEntry.ownerDomain,
      connectionStatus: mapEntry.connectionStatus,
      observationStatus,
      sourceIds: match?.sourceIds ?? [],
      eventIds: match?.eventIds ?? [],
      notProvenClaims: Object.freeze([
        ...new Set([
          ...mapEntry.notProvenClaims,
          ...(match?.notProvenClaims ?? [`${mapEntry.category}-not-observed`]),
        ]),
      ]),
      terminalSuccessClaim: false,
    };
  });

  const turnIds = turns.map((turn) => `turn:${turn.turn}`);
  const receiptIds = turns.flatMap((turn) =>
    turn.toolResultBatch?.executionReceipts.map((receipt) => receipt.receiptId) ?? []
  );
  const toolPolicyIds = [
    ...(input.toolPolicyDecisions ?? []).map((item) => item.decisionId),
    ...turns.flatMap((turn) =>
      turn.toolResultBatch?.dispatchPlan?.calls.map((item) =>
        item.beforePolicyDecision.decisionId
      ) ?? []
    ),
  ];
  const toolResultMessageIds = turns.flatMap((turn) =>
    turn.toolResultBatch?.resultMessages?.messages.map((message) => message.messageId) ?? []
  );

  return deepFreeze({
    loopId: loopId.value,
    turnIds: Object.freeze(turnIds),
    snapshotIds: Object.freeze(turns.map((turn) => turn.snapshot.id)),
    eventIds: Object.freeze(events.map((event) => event.id)),
    receiptIds: Object.freeze(receiptIds),
    toolPolicyIds: Object.freeze(Array.from(new Set(toolPolicyIds))),
    toolResultMessageIds: Object.freeze(Array.from(new Set(toolResultMessageIds))),
    savePointIds: Object.freeze(turns.map((turn) => turn.savePoint.id)),
    sessionProjectionIds: Object.freeze(input.sessionProjection ? [
      input.sessionProjection.sessionIdentity,
      input.sessionProjection.activeLeafId,
    ] : []),
    contextRebuildProjectionIds: Object.freeze(input.contextRebuildProjection ? [
      input.contextRebuildProjection.rebuildSource.activeLeafId,
    ] : []),
    providerMetadataIds: Object.freeze(input.providerRegistry ? [
      ...input.providerRegistry.providers.map((provider) => provider.providerId),
      ...input.providerRegistry.models.map((model) => model.modelId),
    ] : []),
    productSurfaceSectionIds,
    stages: Object.freeze(stages),
    events: Object.freeze(events),
    jsonEventStream,
    finalObservedFacts: {
      loopState: input.loop?.state,
      stopReason: input.loop?.stopReason,
      failureClass: input.loop?.failureClass,
      resultStatus: input.resultFacts?.status,
      terminalClassification: input.resultFacts?.terminalClassification,
      terminalReason: input.resultFacts?.terminalReason,
      terminalSuccessClaim: false,
    },
    notProvenClaims: Object.freeze([
      ...new Set(stages.flatMap((stage) => stage.notProvenClaims)),
    ]),
    redaction: {
      status: redacted || events.some((event) => event.redaction.status === "redacted")
        ? "redacted"
        : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    terminalSuccessClaim: false,
  });

  function appendReceipt(receipt: RuntimeExecutionReceiptProjection) {
    append(
      "execution-receipt",
      "loop-execution-receipt-observed",
      {
        receiptId: receipt.receiptId,
        turnSnapshotId: receipt.turnSnapshotId,
        savePointId: receipt.savePointId,
        operationKind: receipt.operationKind,
        executionStatus: receipt.executionStatus,
        exitCode: receipt.exitCode,
        errorClass: receipt.errorClass,
      },
      receipt.notProvenClaims,
      [receipt.receiptId],
    );
  }
}

function summarizeText(value: string): string {
  return value.length > 120 ? `${value.slice(0, 120)}...` : value;
}

function sanitizeText(value: string): { readonly value: string; readonly redacted: boolean } {
  const before = value;
  const sanitized = value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
  return { value: sanitized, redacted: sanitized !== before };
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value).value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested !== undefined && typeof nested !== "function") {
        output[key] = sanitizeValue(nested);
      }
    }
    return output;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
