import { toolOutcomeEventSections, responseReentryEventSections, controlledInvocationEventSections, modelInvocationEventSections, mutationRecoveryEventSections, mutationRuntimeEventSections, requestPreparationEventSections, replayCarryForwardEventSections } from "./events.js";
import {
  providerStreamAdapterSections,
  modelBoundarySections,
  contextPlanningSections,
  productLoopAdapterSections,
  productLoopCloseoutSections,
  productCompletionPacketSections,
  loopTrajectorySections,
} from "./runtimeEvents.js";
import {
  taskSection,
  contextSection,
  planSection,
  proposalSection,
  authoritySection,
  applySection,
  verificationSection,
  repairSection,
  toolsSection,
  resourceSections,
  providerSections,
  packageSections,
  sessionSections,
  eventSections,
} from "./sections.js";
import { factValue, section, verdictSeverity, verdictStatus } from "./shared.js";
import { compactSessionPresentationText as compact, projectSessionPresentationFacts } from "../../session/presentation/facts.js";
import type { CodingResultSummary, OrchestrationStatus, TerminalReason } from "../../result/types.js";
import type { RuntimeProjectionEvent } from "../../runtime/events/projection.js";
import type { LoopTrajectoryProjection } from "../../runtime/loop/trajectory.js";
import type { ProductLoopAdapterProjection } from "../../runtime/loop/adapter.js";
import type { ProviderStreamAdapterProjection } from "../../runtime/loop/providerStreamAdapter.js";
import type { ModelBoundaryPhaseProjection } from "../../runtime/loop/modelBoundary.js";
import type { ContextPlanningBlockSummary } from "../../context/acquisition/summary.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";
import type {
  ProductSurfaceInput,
  ProductSurfaceSection,
  ProductSurfaceViewModel,
} from "./types.js";

// The public surface contract, and every type it names.
export type {
  ProductSurfaceFact,
  ProductSurfaceInput,
  ProductSurfaceSection,
  ProductSurfaceSectionKind,
  ProductSurfaceSeverity,
  ProductSurfaceStatus,
  ProductSurfaceViewModel,
} from "./types.js";

export function projectProductSurfaceViewModel(
  input: ProductSurfaceInput,
): ProductSurfaceViewModel | undefined {
  const codingResult = input.codingResult;
  if (!codingResult && !input.loopTrajectory && !input.productLoopAdapter && !input.contextPlanningSummary && !input.modelBoundaryPhase && !input.providerStreamAdapter && !input.runtimeEvents) {
    return undefined;
  }

  const sessionFacts = codingResult ? projectSessionPresentationFacts(input) : undefined;
  if (codingResult && !sessionFacts) {
    return undefined;
  }
  const repairVerdictEvent = input.loopTrajectory?.events.find((event) =>
    event.type === "loop-result-terminal-projection-observed"
  ) ?? input.runtimeEvents?.find((event) =>
    event.type === "repair-verdict-terminal-projected"
  );
  const mutationVerdictEvent = input.runtimeEvents?.find((event) =>
    event.type === "multi-target-mutation-verdict-projected"
  );
  const loopFinalizationEvent = input.loopTrajectory?.events.find((event) =>
    event.type === "loop-finalization-observed"
  ) ?? input.runtimeEvents?.find((event) =>
    event.type === "loop-finalization-decision-observed"
  );
  const productCloseoutEvent = input.loopTrajectory?.events.find((event) =>
    event.type === "product-loop-closeout-projected"
  ) ?? input.runtimeEvents?.find((event) =>
    event.type === "product-loop-closeout-projected"
  );
  const completionPacketEvent = input.loopTrajectory?.events.find((event) =>
    event.type === "product-completion-packet-observed"
  ) ?? input.runtimeEvents?.find((event) =>
    event.type === "product-completion-packet-observed"
  );
  const toolNextActionEvent = input.loopTrajectory?.events.find((event) =>
    event.type === "tool-result-next-action-observed"
  ) ?? input.runtimeEvents?.find((event) =>
    event.type === "tool-result-next-action-observed"
  );
  const observedNextAction = completionPacketEvent
    ? String(completionPacketEvent.facts.nextAction ?? "preserve product completion packet")
    : productCloseoutEvent
    ? String(productCloseoutEvent.facts.nextAction ?? "preserve product closeout facts")
    : loopFinalizationEvent
      ? String(loopFinalizationEvent.facts.nextAction ?? "preserve loop finalization facts")
      : toolNextActionEvent
        ? String(toolNextActionEvent.facts.nextAction ?? "preserve tool outcome facts")
      : input.contextPlanningSummary?.nextAction ??
        input.providerStreamAdapter?.nextAction ??
        input.productLoopAdapter?.nextAction ??
        "keep loop trajectory observation separate from terminal success";
  const observedNextActionSummary = completionPacketEvent
    ? `packet=${factValue(completionPacketEvent.facts.status)}; resultStatus=${factValue(completionPacketEvent.facts.resultOwnedTerminalStatus)}; loopDecision=${factValue(completionPacketEvent.facts.loopDecision)}; closeout=${factValue(completionPacketEvent.facts.closeoutState)}; nextAction=${factValue(completionPacketEvent.facts.nextAction)}; terminalSuccessClaim=false`
    : productCloseoutEvent
    ? `closeout=${factValue(productCloseoutEvent.facts.status)}; resultStatus=${factValue(productCloseoutEvent.facts.resultOwnedTerminalStatus)}; loopDecision=${factValue(productCloseoutEvent.facts.loopOwnedControlDecision)}; nextAction=${factValue(productCloseoutEvent.facts.nextAction)}; terminalSuccessClaim=false`
    : loopFinalizationEvent
      ? `loopDecision=${factValue(loopFinalizationEvent.facts.decision)}; nextAction=${factValue(loopFinalizationEvent.facts.nextAction)}; resultStatus=${factValue(repairVerdictEvent?.facts.status ?? loopFinalizationEvent.facts.resultTerminalStatus)}; missingProof=${factValue(loopFinalizationEvent.facts.missingProofItems)}; originalFailure=${factValue(loopFinalizationEvent.facts.originalFailureClass)}; terminalSuccessClaim=false`
      : toolNextActionEvent
        ? `toolNextAction=${factValue(toolNextActionEvent.facts.nextAction)}; reason=${factValue(toolNextActionEvent.facts.nextActionReason)}; terminalSuccessClaim=false`
      : observedNextAction;

  const sections = [
    ...(codingResult ? [
      taskSection(codingResult),
      contextSection(codingResult),
      planSection(codingResult),
      proposalSection(codingResult),
      authoritySection(codingResult),
      applySection(codingResult),
      verificationSection(codingResult),
      repairSection(codingResult),
      toolsSection(codingResult),
    ] : []),
    ...contextPlanningSections(input.contextPlanningSummary),
    ...productLoopAdapterSections(input),
    ...productCompletionPacketSections(completionPacketEvent),
    ...productLoopCloseoutSections(productCloseoutEvent),
    ...loopTrajectorySections(input),
    ...resourceSections(input),
    ...providerStreamAdapterSections(input.providerStreamAdapter),
    ...providerSections(input),
    ...modelBoundarySections(input.modelBoundaryPhase),
    ...packageSections(input),
    ...sessionSections(input),
    ...toolOutcomeEventSections(input),
    ...mutationRuntimeEventSections(input),
    ...mutationRecoveryEventSections(input),
    ...requestPreparationEventSections(input),
    ...replayCarryForwardEventSections(input),
    ...modelInvocationEventSections(input),
    ...controlledInvocationEventSections(input),
    ...responseReentryEventSections(input),
    ...eventSections(input),
    section({
      kind: "verdict",
      title: "Verdict",
      severity: sessionFacts
        ? verdictSeverity(sessionFacts.truthStatus)
        : mutationVerdictEvent?.facts.status === "complete"
          ? "success"
        : repairVerdictEvent?.facts.status === "verified_with_repair"
          ? "success"
          : mutationVerdictEvent || repairVerdictEvent
            ? "partial"
            : "not_proven",
      status: sessionFacts
        ? verdictStatus(sessionFacts.truthStatus)
        : mutationVerdictEvent?.facts.status === "complete"
          ? "passed"
        : repairVerdictEvent?.facts.status === "verified_with_repair"
          ? "passed"
          : mutationVerdictEvent || repairVerdictEvent
            ? "partial"
            : "not_proven",
      summary: sessionFacts?.verdict ??
        (mutationVerdictEvent
          ? `resultStatus=${factValue(mutationVerdictEvent.facts.status)}; classification=${factValue(mutationVerdictEvent.facts.terminalClassification)}; missingProof=${factValue(mutationVerdictEvent.facts.missingProofItems)}; terminalSuccessClaim=false`
          : repairVerdictEvent
          ? `resultStatus=${factValue(repairVerdictEvent.facts.status)}; originalFailure=${factValue(repairVerdictEvent.facts.originalFailureClass)}; repairApply=${factValue(repairVerdictEvent.facts.repairApplyState)}; postRepair=${factValue(repairVerdictEvent.facts.postRepairVerificationState)}; missingProof=${factValue(repairVerdictEvent.facts.missingProofItems)}; terminalSuccessClaim=false`
          : `loopState=${input.loopTrajectory?.finalObservedFacts.loopState ?? input.productLoopAdapter?.adapterId ?? "not-observed"}; terminalSuccessClaim=false`
        ),
    }),
    section({
      kind: "not_proven",
      title: "Not proven",
      severity: (sessionFacts?.notProvenClaims.length ?? input.providerStreamAdapter?.notProvenClaims.length ?? input.modelBoundaryPhase?.notProvenClaims.length ?? input.contextPlanningSummary?.notProvenClaims.length ?? input.loopTrajectory?.notProvenClaims.length ?? input.productLoopAdapter?.notProvenClaims.length ?? 0) > 0 ? "not_proven" : "info",
      status: (sessionFacts?.notProvenClaims.length ?? input.providerStreamAdapter?.notProvenClaims.length ?? input.modelBoundaryPhase?.notProvenClaims.length ?? input.contextPlanningSummary?.notProvenClaims.length ?? input.loopTrajectory?.notProvenClaims.length ?? input.productLoopAdapter?.notProvenClaims.length ?? 0) > 0 ? "not_proven" : "observed",
      summary: (sessionFacts?.notProvenClaims.length ?? 0) > 0
        ? sessionFacts!.notProvenClaims.join("; ")
        : (input.providerStreamAdapter?.notProvenClaims.length ?? 0) > 0
          ? input.providerStreamAdapter!.notProvenClaims.slice(0, 8).join("; ")
        : (input.modelBoundaryPhase?.notProvenClaims.length ?? 0) > 0
          ? input.modelBoundaryPhase!.notProvenClaims.slice(0, 8).join("; ")
        : (input.contextPlanningSummary?.notProvenClaims.length ?? 0) > 0
          ? input.contextPlanningSummary!.notProvenClaims.slice(0, 8).join("; ")
        : (completionPacketEvent?.notProvenClaims.length ?? 0) > 0
          ? completionPacketEvent!.notProvenClaims.slice(0, 8).join("; ")
        : (productCloseoutEvent?.notProvenClaims.length ?? 0) > 0
          ? productCloseoutEvent!.notProvenClaims.slice(0, 8).join("; ")
        : (input.loopTrajectory?.notProvenClaims.length ?? 0) > 0
          ? input.loopTrajectory!.notProvenClaims.slice(0, 8).join("; ")
        : (input.productLoopAdapter?.notProvenClaims.length ?? 0) > 0
          ? input.productLoopAdapter!.notProvenClaims.slice(0, 8).join("; ")
        : "none",
      notProvenClaims: sessionFacts?.notProvenClaims ??
        input.providerStreamAdapter?.notProvenClaims ??
        input.modelBoundaryPhase?.notProvenClaims ??
        input.contextPlanningSummary?.notProvenClaims ??
        completionPacketEvent?.notProvenClaims ??
        productCloseoutEvent?.notProvenClaims ??
        input.loopTrajectory?.notProvenClaims ??
        input.productLoopAdapter?.notProvenClaims ?? [],
    }),
    section({
      kind: "next_action",
      title: "Next action",
      severity: sessionFacts && (sessionFacts.truthStatus === "verified-success" ||
        sessionFacts.truthStatus === "verified-repaired-success"
      )
        ? "success"
        : "info",
      status: "observed",
      summary: sessionFacts?.nextAction ?? observedNextActionSummary,
    }),
  ];

  return {
    sections,
    verdict: sessionFacts?.verdict ??
      `loopState=${input.loopTrajectory?.finalObservedFacts.loopState ?? input.productLoopAdapter?.adapterId ?? "not-observed"}`,
    notProvenClaims: sessionFacts?.notProvenClaims ??
      input.modelBoundaryPhase?.notProvenClaims ??
      input.contextPlanningSummary?.notProvenClaims ??
      input.providerStreamAdapter?.notProvenClaims ??
      completionPacketEvent?.notProvenClaims ??
      productCloseoutEvent?.notProvenClaims ??
      input.loopTrajectory?.notProvenClaims ??
      input.productLoopAdapter?.notProvenClaims ?? [],
    nextAction: sessionFacts?.nextAction ?? observedNextAction,
    redaction: sections.some((item) => item.redaction !== "none") ? "applied" : "none",
    terminalSuccessClaim: false,
  };
}

