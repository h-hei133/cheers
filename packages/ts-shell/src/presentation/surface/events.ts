import type { ContextPlanningBlockStatus, ContextPlanningBlockSummary } from "../../context/acquisition/summary.js";
import type { ModelBoundaryPhaseProjection } from "../../runtime/loop/modelBoundary.js";
import type { RuntimeProjectionEvent } from "../../runtime/events/projection.js";
import type { ProviderStreamAdapterProjection } from "../../runtime/loop/providerStreamAdapter.js";
import { factValue, section, safeText } from "./shared.js";
import type { ProductSurfaceInput, ProductSurfaceSection, ProductSurfaceSeverity, ProductSurfaceStatus } from "./types.js";

/** Event-derived surface sections: each projects one slice of the runtime event stream. */

export function toolOutcomeEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const outcome = events.find((event) => event.type === "tool-outcome-bundle-observed");
  const schedule = events.find((event) => event.type === "tool-scheduling-plan-observed");
  const nextAction = events.find((event) => event.type === "tool-result-next-action-observed");
  const nextTurn = events.find((event) => event.type === "next-turn-bundle-prepared");
  const savePointInput = events.find((event) => event.type === "save-point-input-prepared");
  if (!outcome && !schedule && !nextAction && !nextTurn && !savePointInput) {
    return [];
  }

  return [section({
    kind: "tools",
    title: "Tool outcome",
    severity: events.some((event) =>
      event.type === "next-turn-bundle-blocked" || event.type === "delivery-blocked"
    )
      ? "warning"
      : "info",
    status: "observed",
    summary: [
      outcome ? `outcome=${factValue(outcome.facts.mixedOutcomeStatus)}` : undefined,
      schedule ? `schedule=${factValue(schedule.facts.executionMode)}` : undefined,
      nextAction ? `nextAction=${factValue(nextAction.facts.nextAction)}` : undefined,
      savePointInput ? `savePointInput=${factValue(savePointInput.facts.savePointInputId)}` : undefined,
      nextTurn ? `nextTurn=${factValue(nextTurn.facts.readinessStatus)}` : undefined,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      ...(outcome
        ? [
            {
              label: "executed",
              value: factValue(outcome.facts.executedCount),
              machineEventCorrelationId: outcome.id,
            },
            {
              label: "blocked",
              value: factValue(outcome.facts.blockedCount),
              machineEventCorrelationId: outcome.id,
            },
            {
              label: "failed",
              value: factValue(outcome.facts.failedCount),
              machineEventCorrelationId: outcome.id,
            },
          ]
        : []),
      ...(schedule
        ? [
            {
              label: "schedule",
              value: factValue(schedule.facts.executionMode),
              machineEventCorrelationId: schedule.id,
            },
            {
              label: "parallelGroups",
              value: factValue(schedule.facts.parallelGroupIds),
              machineEventCorrelationId: schedule.id,
            },
            {
              label: "deterministicOrder",
              value: factValue(schedule.facts.deterministicOrder),
              machineEventCorrelationId: schedule.id,
            },
          ]
        : []),
      ...(nextTurn
        ? [
            {
              label: "readiness",
              value: factValue(nextTurn.facts.readinessStatus),
              machineEventCorrelationId: nextTurn.id,
            },
          ]
        : []),
      ...(nextAction
        ? [
            {
              label: "nextAction",
              value: factValue(nextAction.facts.nextAction),
              machineEventCorrelationId: nextAction.id,
            },
            {
              label: "nextActionReason",
              value: factValue(nextAction.facts.nextActionReason),
              machineEventCorrelationId: nextAction.id,
            },
          ]
        : []),
    ],
    machineEventCorrelationIds: [outcome?.id, schedule?.id, nextAction?.id, savePointInput?.id, nextTurn?.id]
      .filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) =>
        event.type === "tool-outcome-bundle-observed" ||
        event.type === "tool-scheduling-plan-observed" ||
        event.type === "tool-result-next-action-observed" ||
        event.type === "save-point-input-prepared" ||
        event.type === "next-turn-bundle-prepared"
      )
      .flatMap((event) => event.notProvenClaims),
  })];
}

export function responseReentryEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const reentry = events.find((event) => event.type === "response-reentry-observed");
  const accumulation = events.find((event) => event.type === "assistant-accumulation-observed");
  const extraction = events.find((event) => event.type === "tool-extraction-observed");
  const noTool = events.find((event) => event.type === "no-tool-response-observed");
  const cycle = events.find((event) => event.type === "loop-cycle-boundary-observed");
  const blocked = events.find((event) => event.type === "loop-cycle-blocked");
  const partial = events.find((event) => event.type === "loop-cycle-partial");
  if (!reentry && !cycle) {
    return [];
  }

  return [section({
    kind: "model_boundary",
    title: "Response cycle",
    severity: blocked ? "blocked" : partial ? "partial" : "not_proven",
    status: blocked ? "blocked" : partial ? "partial" : "observed",
    summary: [
      reentry ? `reentry=${factValue(reentry.facts.reentryStatus)}` : undefined,
      accumulation ? `assistant=${factValue(accumulation.facts.completionStatus)}` : undefined,
      extraction ? `toolExtraction=${factValue(extraction.facts.handoffReadiness)}` : undefined,
      noTool ? `noTool=${factValue(noTool.facts.noToolStatus)}` : undefined,
      cycle ? `cycle=${factValue(cycle.facts.cycleStatus)}` : undefined,
      cycle ? `next=${factValue(cycle.facts.nextHandoffKind)}` : undefined,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      ...(reentry
        ? [{
            label: "responseReentry",
            value: factValue(reentry.facts.reentryId),
            machineEventCorrelationId: reentry.id,
          }]
        : []),
      ...(extraction
        ? [{
            label: "toolExtraction",
            value: factValue(extraction.facts.handoffReadiness),
            machineEventCorrelationId: extraction.id,
          }]
        : []),
      ...(cycle
        ? [{
            label: "cycleBoundary",
            value: factValue(cycle.facts.cycleStatus),
            machineEventCorrelationId: cycle.id,
          }]
        : []),
    ],
    redaction: events.some((event) =>
      event.type === "response-reentry-observed" && event.redaction.status === "redacted"
    )
      ? "applied"
      : "none",
    machineEventCorrelationIds: [
      reentry?.id,
      accumulation?.id,
      extraction?.id,
      noTool?.id,
      cycle?.id,
      blocked?.id,
      partial?.id,
    ].filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) =>
        event.type === "response-reentry-observed" ||
        event.type === "assistant-accumulation-observed" ||
        event.type === "tool-extraction-observed" ||
        event.type === "no-tool-response-observed" ||
        event.type === "loop-cycle-boundary-observed" ||
        event.type === "loop-cycle-blocked" ||
        event.type === "loop-cycle-partial"
      )
      .flatMap((event) => event.notProvenClaims),
  })];
}

export function controlledInvocationEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const adapter = events.find((event) => event.type === "controlled-invocation-adapter-observed");
  if (!adapter) {
    return [];
  }
  const blocked = events.find((event) => event.type === "controlled-invocation-attempt-blocked");
  const failed = events.find((event) =>
    event.type === "controlled-invocation-attempt-failed-as-provider-fact"
  );
  const completed = events.find((event) =>
    event.type === "controlled-invocation-attempt-completed-as-provider-fact"
  );
  const handoff = events.find((event) => event.type === "provider-response-handoff-prepared");
  const fallback = events.find((event) =>
    event.type === "provider-fallback-blocked" ||
    event.type === "provider-fallback-selected" ||
    event.type === "provider-fallback-attempted" ||
    event.type === "provider-fallback-failed" ||
    event.type === "provider-fallback-completed-as-provider-fact"
  );

  return [section({
    kind: "provider",
    title: "Controlled invocation",
    severity: fallback?.type === "provider-fallback-failed"
      ? "error"
      : fallback?.type === "provider-fallback-blocked"
        ? "blocked"
        : failed ? "error" : blocked ? "blocked" : completed ? "not_proven" : "info",
    status: fallback?.type === "provider-fallback-failed"
      ? "failed"
      : fallback?.type === "provider-fallback-blocked"
        ? "blocked"
        : failed ? "failed" : blocked ? "blocked" : "observed",
    summary: [
      `decision=${factValue(adapter.facts.attemptDecision)}`,
      `attempt=${factValue(adapter.facts.attemptStatus)}`,
      `fallbackStatus=${factValue(adapter.facts.fallbackStatus)}`,
      `fallbackAttempted=${factValue(adapter.facts.fallbackAttempted)}`,
      handoff ? `handoff=${factValue(handoff.facts.responseClassification)}` : undefined,
      `provider=${factValue(adapter.facts.providerSafeLabel)}`,
      `model=${factValue(adapter.facts.modelSafeLabel)}`,
      fallback ? `fallbackNext=${factValue(fallback.facts.nextAction)}` : undefined,
      `failure=${factValue(adapter.facts.failureClass)}`,
      `retry=${factValue(adapter.facts.retryEligibility)}`,
      `fallback=${factValue(adapter.facts.fallbackEligibility)}`,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      {
        label: "adapterId",
        value: factValue(adapter.facts.adapterId),
        machineEventCorrelationId: adapter.id,
      },
      {
        label: "requiredUserAction",
        value: blocked ? factValue(adapter.facts.blockedReason) : "review provider outcome facts",
        machineEventCorrelationId: adapter.id,
      },
      ...(handoff
        ? [
            {
              label: "responseHandoff",
              value: factValue(handoff.facts.responseHandoffId),
              machineEventCorrelationId: handoff.id,
            },
            {
              label: "toolExtraction",
              value: factValue(handoff.facts.toolCallExtractionReadiness),
              machineEventCorrelationId: handoff.id,
            },
          ]
        : []),
      ...(fallback
        ? [
            {
              label: "fallbackDecision",
              value: factValue(fallback.facts.decisionId),
              machineEventCorrelationId: fallback.id,
            },
            {
              label: "fallbackStatus",
              value: factValue(fallback.facts.fallbackStatus),
              machineEventCorrelationId: fallback.id,
            },
          ]
        : []),
    ],
    redaction: adapter.redaction.status === "redacted" || handoff?.redaction.status === "redacted"
      ? "applied"
      : "none",
    machineEventCorrelationIds: [
      adapter.id,
      blocked?.id,
      failed?.id,
      completed?.id,
      handoff?.id,
      fallback?.id,
    ]
      .filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) =>
        event.type === "controlled-invocation-adapter-observed" ||
        event.type === "controlled-invocation-attempt-completed-as-provider-fact" ||
        event.type === "controlled-invocation-attempt-failed-as-provider-fact" ||
        event.type === "provider-response-handoff-prepared" ||
        event.type === "provider-fallback-blocked" ||
        event.type === "provider-fallback-selected" ||
        event.type === "provider-fallback-attempted" ||
        event.type === "provider-fallback-failed" ||
        event.type === "provider-fallback-completed-as-provider-fact"
      )
      .flatMap((event) => event.notProvenClaims),
  })];
}

export function modelInvocationEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const gate = events.find((event) => event.type === "model-invocation-gate-observed");
  const attempt = events.find((event) => event.type === "model-invocation-attempt-prepared");
  if (!gate && !attempt) {
    return [];
  }
  const blocked = events.find((event) => event.type === "model-invocation-blocked");
  const optIn = events.find((event) => event.type === "model-invocation-explicit-opt-in-required");
  const redaction = events.find((event) => event.type === "model-invocation-redaction-blocked");

  return [section({
    kind: "model_boundary",
    title: "Invocation gate",
    severity: redaction ? "error" : blocked ? "blocked" : "not_proven",
    status: blocked ? "blocked" : "observed",
    summary: [
      gate ? `eligibility=${factValue(gate.facts.eligibilityStatus)}` : undefined,
      attempt ? `attempt=${factValue(attempt.facts.attemptStatus)}` : undefined,
      gate ? `provider=${factValue(gate.facts.providerSafeLabel)}` : undefined,
      gate ? `model=${factValue(gate.facts.modelSafeLabel)}` : undefined,
      gate ? `optIn=${factValue(gate.facts.optInState)}` : undefined,
      gate ? `auth=${factValue(gate.facts.authReadiness)}` : undefined,
      attempt ? `retry=${factValue(attempt.facts.retryEligibility)}` : undefined,
      attempt ? `fallback=${factValue(attempt.facts.fallbackEligibility)}` : undefined,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      ...(gate
        ? [
            {
              label: "gateId",
              value: factValue(gate.facts.gateId),
              machineEventCorrelationId: gate.id,
            },
            {
              label: "requiredUserAction",
              value: factValue(gate.facts.requiredUserAction),
              machineEventCorrelationId: gate.id,
            },
          ]
        : []),
      ...(attempt
        ? [
            {
              label: "attemptId",
              value: factValue(attempt.facts.attemptId),
              machineEventCorrelationId: attempt.id,
            },
            {
              label: "invocationMode",
              value: factValue(attempt.facts.invocationMode),
              machineEventCorrelationId: attempt.id,
            },
          ]
        : []),
    ],
    redaction: gate?.redaction.status === "redacted" || attempt?.redaction.status === "redacted"
      ? "applied"
      : "none",
    machineEventCorrelationIds: [gate?.id, attempt?.id, blocked?.id, optIn?.id, redaction?.id]
      .filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) =>
        event.type === "model-invocation-gate-observed" ||
        event.type === "model-invocation-attempt-prepared" ||
        event.type === "model-invocation-blocked" ||
        event.type === "model-invocation-explicit-opt-in-required"
      )
      .flatMap((event) => event.notProvenClaims),
  })];
}

export function mutationRecoveryEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const lane = events.find((event) => event.type === "mutation-recovery-lane-observed");
  if (!lane) {
    return [];
  }
  const authority = events.find((event) => event.type === "mutation-authority-observed");
  const staleRead = events.find((event) => event.type === "mutation-stale-read-observed");
  const snapshot = events.find((event) => event.type === "mutation-snapshot-observed");
  const apply = events.find((event) => event.type === "mutation-apply-observed");
  const rollback = events.find((event) => event.type === "mutation-rollback-observed");
  const decision = events.find((event) =>
    event.type === "mutation-recovery-decision-observed"
  );
  const blocked = events.find((event) =>
    event.type === "mutation-denied" ||
    event.type === "mutation-permission-pending" ||
    event.type === "mutation-stale-read-blocked" ||
    event.type === "mutation-snapshot-unavailable"
  );
  const failed = events.find((event) =>
    event.type === "mutation-apply-failed" ||
    (event.type === "mutation-recovery-decision-observed" &&
      factValue(event.facts.verdictStatus) === "failed")
  );
  const verdictStatus = factValue(lane.facts.verdictStatus);
  return [section({
    kind: "apply",
    title: "Mutation recovery",
    severity: verdictStatus === "complete"
      ? "success"
      : failed
        ? "error"
        : blocked
          ? "blocked"
          : "not_proven",
    status: verdictStatus === "complete"
      ? "passed"
      : failed
        ? "failed"
        : blocked
          ? "blocked"
          : "not_proven",
    summary: [
      `lane=${factValue(lane.facts.laneId)}`,
      authority ? `authority=${factValue(authority.facts.authorityStatus)}` : undefined,
      staleRead ? `staleRead=${factValue(staleRead.facts.status)}` : undefined,
      snapshot ? `snapshot=${factValue(snapshot.facts.status)}` : undefined,
      apply ? `apply=${factValue(apply.facts.status)}` : undefined,
      decision ? `decision=${factValue(decision.facts.recoveryDecision)}` : undefined,
      rollback ? `rollback=${factValue(rollback.facts.status)}` : undefined,
      `verdict=${verdictStatus}`,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      {
        label: "lane",
        value: factValue(lane.facts.laneId),
        machineEventCorrelationId: lane.id,
      },
      {
        label: "target",
        value: factValue(lane.facts.targetSummary),
        machineEventCorrelationId: lane.id,
      },
      {
        label: "authority",
        value: authority ? factValue(authority.facts.authorityStatus) : "not-observed",
        machineEventCorrelationId: authority?.id,
      },
      {
        label: "staleRead",
        value: staleRead ? factValue(staleRead.facts.status) : "not-observed",
        machineEventCorrelationId: staleRead?.id,
      },
      {
        label: "snapshot",
        value: snapshot ? factValue(snapshot.facts.status) : "not-observed",
        machineEventCorrelationId: snapshot?.id,
      },
      {
        label: "apply",
        value: apply ? factValue(apply.facts.status) : "not-observed",
        machineEventCorrelationId: apply?.id,
      },
      {
        label: "rollback",
        value: rollback ? factValue(rollback.facts.status) : "not-observed",
        machineEventCorrelationId: rollback?.id,
      },
      {
        label: "verdict",
        value: verdictStatus,
        machineEventCorrelationId: lane.id,
      },
    ],
    redaction: events.some((event) =>
      event.type.startsWith("mutation-") && event.redaction.status === "redacted"
    )
      ? "applied"
      : "excluded",
    machineEventCorrelationIds: [
      lane.id,
      authority?.id,
      staleRead?.id,
      snapshot?.id,
      apply?.id,
      decision?.id,
      rollback?.id,
      blocked?.id,
      failed?.id,
    ].filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) => event.type.startsWith("mutation-"))
      .flatMap((event) => event.notProvenClaims),
  })];
}

export function mutationRuntimeEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const lane = events.find((event) =>
    event.type === "multi-target-mutation-lane-observed"
  );
  if (!lane) {
    return [];
  }
  const plan = events.find((event) =>
    event.type === "multi-target-mutation-plan-observed"
  );
  const conflicts = events.filter((event) =>
    event.type === "multi-target-mutation-conflict-observed"
  );
  const queue = events.filter((event) =>
    event.type === "multi-target-mutation-queue-observed"
  );
  const groups = events.filter((event) =>
    event.type === "multi-target-mutation-group-observed"
  );
  const eligibility = events.filter((event) =>
    event.type === "multi-target-mutation-eligibility-observed"
  );
  const settlements = events.filter((event) =>
    event.type === "multi-target-mutation-settlement-observed"
  );
  const rollback = events.find((event) =>
    event.type === "multi-target-mutation-rollback-observed"
  );
  const verification = events.find((event) =>
    event.type === "multi-target-mutation-verification-observed"
  );
  const proof = events.find((event) =>
    event.type === "multi-target-mutation-proof-input-observed"
  );
  const verdict = events.find((event) =>
    event.type === "multi-target-mutation-verdict-projected"
  );
  const status = factValue(verdict?.facts.status ?? lane.facts.verdictStatus);
  const failed = queue.some((event) => factValue(event.facts.state) === "failed");
  const blocked = conflicts.length > 0 ||
    queue.some((event) =>
      factValue(event.facts.state) === "blocked" ||
      factValue(event.facts.state) === "skipped"
    );
  return [section({
    kind: "apply",
    title: "Mutation runtime",
    severity: status === "complete"
      ? "success"
      : failed
        ? "error"
        : blocked
          ? "blocked"
          : status === "partial"
            ? "partial"
            : "not_proven",
    status: status === "complete"
      ? "passed"
      : failed
        ? "failed"
        : blocked
          ? "blocked"
          : status === "partial"
            ? "partial"
            : "not_proven",
    summary: [
      `lane=${factValue(lane.facts.laneId)}`,
      `targets=${factValue(lane.facts.targetCount)}`,
      plan ? `ordering=${factValue(plan.facts.ordering)}` : undefined,
      plan ? `parallel=${factValue(plan.facts.parallelMutation)}` : undefined,
      `groups=${groups.length}`,
      `parallelGroups=${groups.filter((event) => factValue(event.facts.mode) === "parallel").length}`,
      `eligible=${eligibility.filter((event) => factValue(event.facts.status) === "eligible").length}`,
      `conflicts=${conflicts.length}`,
      `ready=${queue.filter((event) => factValue(event.facts.state) === "ready").length}`,
      `applied=${queue.filter((event) => factValue(event.facts.state) === "applied").length}`,
      `failed=${queue.filter((event) => factValue(event.facts.state) === "failed").length}`,
      `settlements=${settlements.length}`,
      rollback ? `rollback=${factValue(rollback.facts.status)}` : undefined,
      verification ? `groupVerification=${factValue(verification.facts.perGroupStatuses)}` : undefined,
      verification ? `wholeTaskVerification=${factValue(verification.facts.wholeTaskStatus)}` : undefined,
      proof ? `proof=${factValue(proof.facts.proofStatus)}` : undefined,
      `verdict=${status}`,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      {
        label: "lane",
        value: factValue(lane.facts.laneId),
        machineEventCorrelationId: lane.id,
      },
      {
        label: "targetCount",
        value: factValue(lane.facts.targetCount),
        machineEventCorrelationId: lane.id,
      },
      {
        label: "blockedReasons",
        value: conflicts.map((event) => factValue(event.facts.kind)).join(",") ||
          queue.filter((event) => factValue(event.facts.blocker) !== "not-observed")
            .map((event) => factValue(event.facts.blocker)).join(",") ||
          "none",
      },
      {
        label: "parallel",
        value: plan ? factValue(plan.facts.parallelMutation) : "not-observed",
        machineEventCorrelationId: plan?.id,
      },
      {
        label: "groups",
        value: String(groups.length),
        machineEventCorrelationId: groups[0]?.id,
      },
      {
        label: "parallelGroups",
        value: String(groups.filter((event) => factValue(event.facts.mode) === "parallel").length),
        machineEventCorrelationId: groups[0]?.id,
      },
      {
        label: "settlements",
        value: String(settlements.length),
        machineEventCorrelationId: settlements[0]?.id,
      },
      {
        label: "groupVerification",
        value: verification ? factValue(verification.facts.perGroupStatuses) : "not-observed",
        machineEventCorrelationId: verification?.id,
      },
      {
        label: "wholeTaskVerification",
        value: verification ? factValue(verification.facts.wholeTaskStatus) : "not-observed",
        machineEventCorrelationId: verification?.id,
      },
      {
        label: "verdict",
        value: status,
        machineEventCorrelationId: verdict?.id ?? lane.id,
      },
    ],
    redaction: events.some((event) =>
      event.type.startsWith("multi-target-mutation-") &&
      event.redaction.status === "redacted"
    )
      ? "applied"
      : "excluded",
    machineEventCorrelationIds: [
      lane.id,
      plan?.id,
      rollback?.id,
      verification?.id,
      proof?.id,
      verdict?.id,
      ...conflicts.map((event) => event.id),
      ...groups.map((event) => event.id),
      ...queue.map((event) => event.id),
      ...settlements.map((event) => event.id),
    ].filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) => event.type.startsWith("multi-target-mutation-"))
      .flatMap((event) => event.notProvenClaims),
  })];
}

export function requestPreparationEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const request = events.find((event) => event.type === "next-turn-request-preparation-observed");
  const provider = events.find((event) => event.type === "provider-metadata-observed");
  if (!request && !provider) {
    return [];
  }
  const blocked = events.find((event) => event.type === "request-blocked");
  return [section({
    kind: "model_boundary",
    title: "Request preparation",
    severity: blocked ? "warning" : "info",
    status: "observed",
    summary: [
      request ? `readiness=${factValue(request.facts.readinessStatus)}` : undefined,
      provider ? `provider=${factValue(provider.facts.providerSafeLabel)}` : undefined,
      provider ? `model=${factValue(provider.facts.modelSafeLabel)}` : undefined,
      request ? `included=${factValue(request.facts.includedMessageCount)}` : undefined,
      request ? `excluded=${factValue(request.facts.excludedMessageCount)}` : undefined,
      request?.facts.continuationReadinessStatus !== undefined
        ? `continuation=${factValue(request.facts.continuationReadinessStatus)}`
        : undefined,
      blocked ? `blocked=${factValue(blocked.facts.readinessStatus)}` : undefined,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      ...(request
        ? [
            {
              label: "requestPreparation",
              value: factValue(request.facts.requestPreparationId),
              machineEventCorrelationId: request.id,
            },
            {
              label: "requiredUserAction",
              value: blocked ? "resolve-request-blocker" : "explicit-invocation-required",
              machineEventCorrelationId: request.id,
            },
            ...(request.facts.continuationReadinessStatus !== undefined
              ? [{
                  label: "continuationReadiness",
                  value: factValue(request.facts.continuationReadinessStatus),
                  machineEventCorrelationId: request.id,
                }]
              : []),
          ]
        : []),
      ...(provider
        ? [
            {
              label: "auth",
              value: factValue(provider.facts.authReadiness),
              machineEventCorrelationId: provider.id,
            },
            {
              label: "optIn",
              value: factValue(provider.facts.providerOptInState),
              machineEventCorrelationId: provider.id,
            },
          ]
        : []),
    ],
    machineEventCorrelationIds: [request?.id, provider?.id, blocked?.id]
      .filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) =>
        event.type === "next-turn-request-preparation-observed" ||
        event.type === "provider-metadata-observed" ||
        event.type === "provider-opt-in-required" ||
        event.type === "request-input-message-prepared"
      )
      .flatMap((event) => event.notProvenClaims),
  })];
}

export function replayCarryForwardEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const summary = (input.runtimeEvents ?? []).find((event) =>
    event.type === "replay-safe-loop-state-summarized"
  );
  if (!summary) {
    return [];
  }
  return [section({
    kind: "session",
    title: "Replay carry forward",
    severity: "info",
    status: "observed",
    summary: [
      `summary=${factValue(summary.facts.summaryId)}`,
      `request=${factValue(summary.facts.requestReadinessStatus)}`,
      `toolOutcome=${factValue(summary.facts.toolOutcomeStatus)}`,
      summary.facts.toolSchedulingStatus
        ? `toolSchedule=${factValue(summary.facts.toolSchedulingStatus)}`
        : undefined,
      `nextAction=${factValue(summary.facts.toolOutcomeNextAction)}`,
      `provider=${factValue(summary.facts.providerInvocationStatus)}`,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      {
        label: "activePath",
        value: factValue(summary.facts.activePathId),
        machineEventCorrelationId: summary.id,
      },
      {
        label: "requestPreparation",
        value: factValue(summary.facts.requestPreparationId),
        machineEventCorrelationId: summary.id,
      },
      {
        label: "providerInvocations",
        value: factValue(summary.facts.providerInvocationIds),
        machineEventCorrelationId: summary.id,
      },
      {
        label: "providerInvocationStatus",
        value: factValue(summary.facts.providerInvocationStatus),
        machineEventCorrelationId: summary.id,
      },
      {
        label: "toolOutcome",
        value: factValue(summary.facts.toolOutcomeBundleId),
        machineEventCorrelationId: summary.id,
      },
      {
        label: "toolSchedule",
        value: factValue(summary.facts.toolSchedulingPlanId),
        machineEventCorrelationId: summary.id,
      },
      {
        label: "toolScheduleOrder",
        value: factValue(summary.facts.toolSchedulingDeterministicOrder),
        machineEventCorrelationId: summary.id,
      },
      {
        label: "blockedReasons",
        value: factValue(summary.facts.toolOutcomeBlockedReasons),
        machineEventCorrelationId: summary.id,
      },
    ],
    machineEventCorrelationIds: [summary.id],
    notProvenClaims: summary.notProvenClaims,
  })];
}

