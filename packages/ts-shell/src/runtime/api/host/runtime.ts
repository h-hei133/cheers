import {
  projectSessionStatusEnvelope,
  type SessionStatusEnvelope,
} from "../../../session/presentation/envelope.js";
import {
  appendHostSessionTurn,
  createHostSessionState,
  findHostSession,
  listHostSessionHeads,
  projectHostSessionProjection,
  selectOrCreateHostSession,
  updateHostSessionLifecycle,
  type HostSessionRecord,
  type HostSessionState,
} from "../../../session/store/host/state.js";
import { projectHostReplayFacts } from "../../../session/replay/host/facts.js";
import { summarizeReplaySafeLoopState } from "../../../session/replay/state.js";
import { buildLoopContextRebuildInput } from "../../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../../context/sessionContextRebuildProjection.js";
import { evaluateContinuationReadiness } from "../../../session/continuation/readiness.js";
import { projectProductSurfaceViewModel } from "../../../presentation/surface/model.js";
import { runControlledMutationRecovery } from "../../../edit/recovery/model.js";
import { projectHostEvidenceProof } from "../../../evidence/host/proof.js";
import { projectHostTruth } from "../../../result/host/verdict.js";
import {
  projectProviderRegistry,
  unknownProviderCompatibilityFlags,
} from "../../../provider/registry/provider.js";
import { projectJsonRuntimeEventStream } from "../../events/stream.js";
import { projectRuntimeEvents, type RuntimeProjectionEvent } from "../../events/projection.js";
import { projectHostEventEnvelopes } from "../../events/host/envelope.js";
import { runAgentLoopContract, type AgentLoopContractProjection } from "../../loop/contract.js";
import { createSyntheticModelBoundary } from "../../loop/providerBoundary.js";
import {
  hostBlocker,
  hostDiagnostic,
  sanitizeHostText,
  validateHostCommandEnvelope,
  type HostCommandEnvelope,
  type HostCommandResponse,
  type HostResultSummary,
  type HostSessionSummary,
  type HostStatusSnapshot,
} from "./contract.js";

export interface HostRuntime {
  readonly dispatch: (input: unknown) => Promise<HostCommandResponse>;
  readonly getState: () => HostSessionState;
}

export interface HostRuntimeOptions {
  readonly projectRoot?: string;
  readonly now?: () => string;
}

interface HostRunProjection {
  readonly loop?: AgentLoopContractProjection;
  readonly events?: readonly RuntimeProjectionEvent[];
  readonly statusEnvelope?: SessionStatusEnvelope;
}

export function createHostRuntime(options: HostRuntimeOptions = {}): HostRuntime {
  let state = createHostSessionState();
  let clock = 0;
  const projectRoot = options.projectRoot ?? "/workspace";
  const now = options.now ?? (() => {
    clock += 1;
    return `2026-06-02T00:00:${String(clock).padStart(2, "0")}.000Z`;
  });

  const dispatch = async (input: unknown): Promise<HostCommandResponse> => {
    const validation = validateHostCommandEnvelope(input);
    const envelope = validation.envelope;
    if (!validation.accepted) {
      return buildResponse({
        envelope,
        accepted: false,
        blockers: validation.blockers,
        diagnostics: validation.diagnostics,
      });
    }

    if (envelope.action === "run-evaluation-case") {
      return runEvaluationCommand(envelope);
    }

    if (envelope.action === "list-session-heads") {
      return buildResponse({
        envelope,
        accepted: true,
        sessionHeads: listHostSessionHeads(state).map((head) => ({
          sessionId: head.sessionId,
          activeLeafId: head.activeLeafId,
          ...(head.activeBranchId ? { activeBranchId: head.activeBranchId } : {}),
          status: head.lifecycle,
          updatedAt: head.updatedAt,
          terminalSuccessClaim: false,
        })),
      });
    }

    if (envelope.action === "start-turn") {
      const selected = selectOrCreateHostSession({
        state,
        sessionId: envelope.sessionId,
        projectRoot,
        now: now(),
      });
      state = selected.state;
      return runTurn(envelope, selected.record, selected.created);
    }

    const sessionId = envelope.sessionId;
    const record = sessionId ? findHostSession({ state, sessionId }) : undefined;
    if (!record || !sessionId) {
      return buildResponse({
        envelope,
        accepted: false,
        blockers: [hostBlocker("missing-session", "host.session.not-found", "session is not available")],
      });
    }

    if (envelope.action === "continue-session") {
      return runTurn(envelope, record, false);
    }
    if (envelope.action === "get-status") {
      return buildResponse({
        envelope,
        accepted: true,
        record,
      });
    }
    if (envelope.action === "inspect-session-summary") {
      return buildResponse({
        envelope,
        accepted: true,
        record,
        sessionSummary: summarizeSession(record),
      });
    }
    if (envelope.action === "cancel-work" || envelope.action === "stop-work") {
      const lifecycle = envelope.action === "cancel-work" ? "cancelled" : "stopped";
      const updated = updateHostSessionLifecycle({
        state,
        sessionId,
        lifecycle,
        now: now(),
      });
      if (updated) {
        state = updated.state;
      }
      return buildResponse({
        envelope,
        accepted: true,
        record: updated?.record ?? record,
        blockers: [
          hostBlocker(
            envelope.action === "cancel-work" ? "cancel-requested" : "stop-requested",
            envelope.action === "cancel-work" ? "host.cancel.requested" : "host.stop.requested",
            envelope.action === "cancel-work" ? "cancel was requested" : "stop was requested",
          ),
        ],
      });
    }

    return buildResponse({
      envelope,
      accepted: false,
      blockers: [hostBlocker("unsupported-command", "host.action.unsupported", "command is not supported")],
    });
  };

  const runTurn = async (
    envelope: HostCommandEnvelope,
    record: HostSessionRecord,
    _created: boolean,
  ): Promise<HostCommandResponse> => {
    const userTurn = appendHostSessionTurn({
      state,
      sessionId: record.session.id,
      role: "user",
      content: envelope.inputText ?? "",
      timestamp: now(),
      eventCount: record.eventCount,
      lifecycle: "running",
    });
    if (!userTurn) {
      return buildResponse({
        envelope,
        accepted: false,
        blockers: [hostBlocker("missing-session", "host.session.not-found", "session is not available")],
      });
    }
    state = userTurn.state;
    const currentRecord = userTurn.record;
    const loop = await runSharedLane({
      envelope,
      record: currentRecord,
    });
    const eventCount = loop.loop?.events.length ?? currentRecord.eventCount;
    const lifecycle = loop.statusEnvelope?.completeProof
      ? "completed"
      : loop.statusEnvelope?.blocked
        ? "blocked"
        : "stopped";
    const assistantTurn = appendHostSessionTurn({
      state,
      sessionId: currentRecord.session.id,
      role: "assistant",
      content: loop.statusEnvelope?.nextAction ?? "structured host turn completed",
      timestamp: now(),
      eventCount,
      lifecycle,
    });
    if (assistantTurn) {
      state = assistantTurn.state;
    }
    return buildResponse({
      envelope,
      accepted: true,
      record: assistantTurn?.record ?? currentRecord,
      loop,
    });
  };

  const runEvaluationCommand = async (
    envelope: HostCommandEnvelope,
  ): Promise<HostCommandResponse> => {
    const { runEvaluationCase } = await import("../../evaluation/model.js");
    const result = await runEvaluationCase({
      caseId: envelope.evaluationCaseId ?? "read-only-tool-loop",
      dispatch,
    });
    return buildResponse({
      envelope,
      accepted: result.status !== "blocked",
      blockers: result.blockers,
      diagnostics: [hostDiagnostic("host.evaluation.executed", "info", "evaluation case executed")],
      evaluation: result,
    });
  };

  const buildResponse = (input: {
    readonly envelope: HostCommandEnvelope;
    readonly accepted: boolean;
    readonly record?: HostSessionRecord;
    readonly blockers?: readonly ReturnType<typeof hostBlocker>[];
    readonly diagnostics?: readonly ReturnType<typeof hostDiagnostic>[];
    readonly sessionHeads?: HostCommandResponse["details"]["sessionHeads"];
    readonly sessionSummary?: HostSessionSummary;
    readonly loop?: HostRunProjection;
    readonly evaluation?: unknown;
  }): HostCommandResponse => {
    const correlationId = input.envelope.correlationId ??
      `${input.envelope.action}:${input.record?.session.id ?? "no-session"}`;
    const eventStream = projectJsonRuntimeEventStream({
      events: input.loop?.events ?? input.loop?.loop?.events ?? [],
      streamId: correlationId,
    });
    const eventEnvelopes = projectHostEventEnvelopes({
      events: eventStream,
      correlationId,
      ...(input.record ? { sessionId: input.record.session.id } : {}),
    });
    const status = statusFor({
      envelope: input.envelope,
      record: input.record,
      eventCount: eventEnvelopes.length,
      blockerCount: input.blockers?.length ?? 0,
      envelopeState: input.loop?.statusEnvelope,
    });
    const proof = projectHostEvidenceProof({
      proofInput: input.loop?.loop?.turns.at(-1)?.verification.repairVerdictProofInput,
    });
    const truth = projectHostTruth({
      evidence: proof,
      result: input.loop?.loop?.turns.at(-1)?.verification.repairVerdictTerminalProjection,
    });
    const result = resultSummaryFor(truth, input.blockers ?? []);
    const replayFacts = input.record
      ? projectHostReplayFacts({ record: input.record })
      : undefined;
    return freeze({
      schemaVersion: "host-command-response.v1",
      action: input.envelope.action,
      correlationId: sanitizeHostText(correlationId),
      accepted: input.accepted,
      ...(input.record ? { sessionId: input.record.session.id } : {}),
      events: eventStream,
      status,
      result,
      diagnostics: input.diagnostics ?? [],
      blockers: input.blockers ?? [],
      details: {
        redaction: {
          status: eventStream.some((event) => event.redaction.status === "redacted")
            ? "redacted"
            : "report-safe",
          excluded: redactionExclusions(),
        },
        ...(input.sessionHeads ? { sessionHeads: input.sessionHeads } : {}),
        ...(input.sessionSummary ? { sessionSummary: input.sessionSummary } : {}),
        ...(replayFacts ? { replayFacts } : {}),
        truth,
        ...(input.evaluation ? { evaluation: input.evaluation } : {}),
      },
      terminalSuccessClaim: false,
      notProvenClaims: truth.notProvenClaims,
    });
  };

  return {
    dispatch,
    getState: () => state,
  };
}

async function runSharedLane(input: {
  readonly envelope: HostCommandEnvelope;
  readonly record: HostSessionRecord;
}): Promise<HostRunProjection> {
  const sessionProjection = projectHostSessionProjection(input.record);
  const contextRebuildProjection = projectSessionContextRebuild({ sessionProjection });
  const rebuildInput = buildLoopContextRebuildInput({
    sessionProjection,
    contextRebuildProjection,
  });
  const continuationReadiness = evaluateContinuationReadiness({
    sessionProjection,
    contextRebuildProjection,
    rebuildInput,
  });
  const syntheticBoundary = createSyntheticModelBoundary({
    program: programFor(input.envelope),
  });
  const fallbackRequested = Boolean(input.envelope.inputText?.includes("fallback"));
  const providerRegistry = fallbackRequested ? createFallbackRegistry() : undefined;
  const memory = new Map<string, string>([["/workspace/src/target.ts", "before\n"]]);
  const loop = await runAgentLoopContract({
    sessionId: input.record.session.id,
    workspaceRoot: input.record.session.projectRoot,
    prompt: input.envelope.inputText ?? "",
    providerOptIn: input.envelope.providerMode === "synthetic",
    providerFallbackOptIn: fallbackRequested,
    providerMode: "synthetic",
    ...(providerRegistry ? { providerRegistry, providerId: "provider-a" } : {}),
    maxTurns: input.envelope.mode === "read-only" ? 2 : 1,
    executePreparedNextTurn: input.envelope.mode === "read-only",
    toolBatchPolicy: "sequential",
    sessionProjection,
    contextRebuildProjection,
    contextRebuildInput: rebuildInput,
    continuationReadiness,
    modelBoundary: syntheticBoundary,
    toolBatchDispatch: async (call) => ({
      success: true,
      content: call.name === "read" ? "safe file summary" : "controlled mutation request observed",
      reportSafe: {
        redactionStatus: "report-safe",
        notProvenClaims: ["tool-result-is-not-task-success"],
      },
    }),
    ...(fallbackRequested
      ? {
          controlledModelInvocationExecutor: () => {
            throw new Error("network unavailable");
          },
          controlledModelFallbackExecutor: () => ({
            kind: "completed" as const,
            response: {
              content: "fallback safe content",
              finishReason: "stop" as const,
            },
          }),
        }
      : {}),
    ...(input.envelope.mode === "mutation"
      ? {
          mutationRecoveryBoundary: async ({ turnId, toolResultBatch }) => {
            const policyDecision = toolResultBatch?.dispatchPlan?.calls[0]?.beforePolicyDecision;
            return runControlledMutationRecovery({
              laneId: `${input.record.session.id}:mutation`,
              turnId,
              workspaceRoot: input.record.session.projectRoot,
              toolCallId: "call-edit",
              ...(policyDecision ? { toolPolicyDecision: policyDecision } : {}),
              target: {
                relativePath: "src/target.ts",
                expectedContent: "before\n",
                proposedContent: "after\n",
                repairContent: "after repaired\n",
                reportSafeTargetSummary: "src/target.ts",
              },
              executionService: {
                readTextFile: async (request) =>
                  memory.get(request.absolutePath) ?? "before\n",
                writeTextFile: async (request) => {
                  memory.set(request.absolutePath, request.content);
                },
              },
              authority: { status: "granted", source: "explicit_mutation_authority" },
              snapshot: { available: true },
              verification: {
                status: "failed",
                failureClass: "owner-verification-failed",
                repairEligible: true,
              },
              recovery: {
                decision: "repair_required",
                repairAuthority: input.envelope.inputText?.includes("missing proof")
                  ? "missing"
                  : "granted",
                postRepairVerificationStatus: input.envelope.inputText?.includes("missing proof")
                  ? "not_run"
                  : "passed",
              },
            });
          },
        }
      : {}),
  });
  const replay = summarizeReplaySafeLoopState({
    sessionProjection,
    contextRebuildProjection,
    continuationReadiness,
    rebuildInput,
    savePoint: loop.turns.at(-1)?.savePoint,
    nextTurnBundle: loop.turns.at(-1)?.nextTurn.bundle,
    requestPreparation: loop.turns.at(-1)?.nextTurn.requestPreparation,
    toolOutcomeBundle: loop.turns.at(-1)?.toolResultBatch?.outcomeBundle,
    toolResultMessages: loop.turns.at(-1)?.toolResultBatch?.resultMessages,
    mutationRecoveries: loop.turns.at(-1)?.mutationRecovery
      ? [loop.turns.at(-1)!.mutationRecovery!]
      : [],
    terminalResultFacts: {
      status: loop.turns.at(-1)?.verification.repairVerdictTerminalProjection?.status ?? "not_proven",
      terminalClassification:
        loop.turns.at(-1)?.verification.repairVerdictTerminalProjection?.terminalClassification ?? "stopped",
      terminalReason: "completed",
    },
  });
  const replayEvents = projectRuntimeEvents({ replaySafeLoopStateSummaries: [replay] });
  const runtimeEvents = [...loop.events, ...replayEvents];
  const surface = projectProductSurfaceViewModel({
    status: "completed",
    terminalClassification:
      loop.turns.at(-1)?.verification.repairVerdictTerminalProjection?.terminalClassification ?? "stopped",
    terminalReason: "completed",
    runtimeEvents,
  });
  return {
    loop,
    events: runtimeEvents,
    ...(surface ? { statusEnvelope: projectSessionStatusEnvelope(surface) } : {}),
  };
}

function createFallbackRegistry() {
  const compatibility = unknownProviderCompatibilityFlags();
  return projectProviderRegistry({
    providers: [
      {
        providerId: "provider-a",
        safeLabel: "Primary Provider",
        providerKind: "custom",
        endpointClass: "unknown",
        authMode: "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "supported",
        compatibility: {
          ...compatibility,
          streaming: "supported",
          toolCalls: "supported",
        },
        fallbackPolicy: {
          fallbackProviderId: "provider-b",
          eligibleFailureClasses: ["provider_network", "provider_timeout"],
          ineligibleFailureClasses: ["provider_auth"],
          maxAttempts: 1,
          retryRelation: "new-request",
          requiresExplicitOptIn: true,
          executesFallback: true,
          redaction: { status: "report-safe", excluded: [] },
          notProvenClaims: [],
        },
        riskLevel: "low",
      },
      {
        providerId: "provider-b",
        safeLabel: "Fallback Provider",
        providerKind: "custom",
        endpointClass: "unknown",
        authMode: "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "unknown",
        compatibility: {
          ...compatibility,
          streaming: "supported",
          toolCalls: "supported",
        },
        riskLevel: "low",
      },
    ],
    models: [
      {
        modelId: "model-a",
        safeLabel: "Primary Model",
        providerId: "provider-a",
        family: "host",
        compatibility: {
          ...compatibility,
          streaming: "supported",
          toolCalls: "supported",
        },
        knownLimitations: [],
      },
      {
        modelId: "model-b",
        safeLabel: "Fallback Model",
        providerId: "provider-b",
        family: "host",
        compatibility: {
          ...compatibility,
          streaming: "supported",
          toolCalls: "supported",
        },
        knownLimitations: [],
      },
    ],
    auth: [{
      providerId: "provider-a",
      authSourceKind: "none",
      authMode: "none",
      resolutionStatus: "resolved",
    }],
  });
}

function programFor(envelope: HostCommandEnvelope) {
  if (envelope.providerMode === "default-off") {
    return {
      steps: [{ kind: "failed" as const, failureClass: "provider_config" as const }],
    };
  }
  if (envelope.mode === "mutation") {
    return {
      steps: [{
        kind: "completed" as const,
        response: {
          content: "request controlled edit",
          toolCalls: [{
            id: "call-edit",
            name: "edit",
            arguments: {
              path: "src/target.ts",
              oldText: "RAW_OLD_TEXT_SHOULD_NOT_LEAK",
              newText: "RAW_NEW_TEXT_SHOULD_NOT_LEAK",
            },
          }],
          finishReason: "tool_calls" as const,
        },
      }],
    };
  }
  return {
    steps: [
      {
        kind: "completed" as const,
        response: {
          content: "read safe context",
          toolCalls: [{ id: "call-read", name: "read", arguments: { path: "src/target.ts" } }],
          finishReason: "tool_calls" as const,
        },
      },
      {
        kind: "completed" as const,
        response: { content: "safe final response", finishReason: "stop" as const },
      },
    ],
  };
}

function statusFor(input: {
  readonly envelope: HostCommandEnvelope;
  readonly record?: HostSessionRecord;
  readonly eventCount: number;
  readonly blockerCount: number;
  readonly envelopeState?: SessionStatusEnvelope;
}): HostStatusSnapshot {
  const lifecycle = input.blockerCount > 0
    ? "blocked"
    : input.record?.lifecycle === "cancelled"
      ? "cancelled"
      : input.record?.lifecycle === "stopped"
        ? "stopped"
        : input.record?.lifecycle === "completed"
          ? "completed"
          : input.record
            ? "running"
            : "not-found";
  return freeze({
    statusId: `${input.envelope.action}:${input.record?.session.id ?? "no-session"}:status`,
    ...(input.record ? { sessionId: input.record.session.id } : {}),
    lifecycle,
    ...(input.record?.lastTurnId ? { activeTurnId: input.record.lastTurnId } : {}),
    eventCount: input.eventCount,
    blockerCount: input.blockerCount,
    nextAction: input.envelopeState?.nextAction ?? (input.blockerCount > 0 ? "resolve blockers" : "preserve structured host facts"),
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "status-snapshot-is-not-success",
      ...(input.envelopeState?.notProvenClaims ?? []),
    ]),
  });
}

function summarizeSession(record: HostSessionRecord): HostSessionSummary {
  const projection = projectHostSessionProjection(record);
  const compactionBlocked = projection.compaction.records.some((item) =>
    item.staleInputIds.length > 0 ||
    item.unsafeInputIds.length > 0 ||
    item.missingFactIds.length > 0 ||
    item.unsupportedFactIds.length > 0
  );
  return freeze({
    sessionId: record.session.id,
    activeLeafId: projection.activeLeafId,
    activePath: projection.activePath,
    branchSupport: projection.branchSupport,
    compactionStatus: projection.compaction.records.length === 0
      ? "not-proven"
      : compactionBlocked
        ? "blocked"
        : "ready",
    redaction: projection.redaction,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "session-summary-is-not-success",
      ...projection.branchFacts.notProvenClaims,
      ...projection.compaction.notProvenClaims,
    ]),
  });
}

function resultSummaryFor(
  truth: ReturnType<typeof projectHostTruth>,
  blockers: readonly ReturnType<typeof hostBlocker>[],
): HostResultSummary {
  return freeze({
    status: truth.completeProof
      ? "completed"
      : blockers.length > 0
        ? "blocked"
        : "not-proven",
    terminalClassification: truth.terminalClassification,
    evidenceVerdictStatus: truth.evidenceStatus,
    resultVerdictStatus: truth.resultStatus,
    terminalSuccessClaim: false,
    notProvenClaims: truth.notProvenClaims,
  });
}

function redactionExclusions(): readonly string[] {
  return [
    "raw-transcript",
    "raw-provider-output",
    "raw-command-output",
    "raw-edit-text",
    "patch-bodies",
    "hidden-reasoning",
    "secrets",
    "oldText",
    "newText",
  ];
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort();
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
