import type { BrowserAgentPlan } from "../core/context/browserAgent.js";
import { detectBrowserAgentPlan } from "../core/context/browserAgent.js";
import { browserObservationFromMetadata } from "../core/context/browserObs.js";
import { executeBrowserTransaction } from "../core/context/browserTxn.js";
import type { PwRuntimeStatus } from "../core/context/pwRuntime.js";
import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import {
  buildBrowserAgentBaseEvidence,
  projectBrowserContinuationEvidence,
  projectBrowserObservationEvidence,
  projectBrowserTransactionEvidence,
} from "./flowEvidenceProjection.js";
import {
  projectBrowserContinuationResult,
  projectBrowserObservationResult,
  projectBrowserTransactionResult,
  type BrowserToolFailureProjection,
} from "./flowResultProjection.js";
import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";
import type { RuntimeOutcomeProjection } from "./runtimeOutcomeProjection.js";
import { dispatchRuntimeTool } from "./toolRuntimeModule.js";

export type { BrowserAgentPlan } from "../core/context/browserAgent.js";

export interface BrowserModuleExecutionResult extends RuntimeOutcomeProjection {
  readonly events: QueryEvent[];
  readonly notes: string[];
}

export function detectWorkflowBrowserPlan(input: {
  readonly prompt: string;
  readonly continuityState: ContinuityStateLike;
}): BrowserAgentPlan | undefined {
  return detectBrowserAgentPlan(input);
}

export async function executeBrowserModulePlan(input: {
  readonly plan: BrowserAgentPlan;
  readonly freshnessObservability: {
    readonly notes: readonly string[];
    readonly evidence: readonly string[];
  };
  readonly dispatcher: ToolDispatcher;
  readonly browserRuntimeStatus: PwRuntimeStatus;
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
}): Promise<BrowserModuleExecutionResult> {
  const events: QueryEvent[] = [];
  const notes = [
    ...input.freshnessObservability.notes,
    "browser-agent: tool pipeline selected",
  ];
  const evidence = buildBrowserAgentBaseEvidence({
    freshnessEvidence: input.freshnessObservability.evidence,
    planEvidence: input.plan.evidence,
  });

  if (input.plan.actions.length === 0 && input.plan.continuationSummary) {
    const projected = projectBrowserContinuationResult({
      evidence: projectBrowserContinuationEvidence(evidence),
      continuationSummary: input.plan.continuationSummary,
    });
    return { events, notes, ...projected };
  }

  if (input.plan.transactionPlan) {
    const transaction = await executeBrowserTransaction(input.plan.transactionPlan, {
      runtimeStatus: input.browserRuntimeStatus,
    });
    const transactionEvidence = projectBrowserTransactionEvidence({
      evidence,
      transaction,
    });
    notes.push(
      `browser-transaction: ${transaction.status} ${transaction.reasonCode} repair=${transaction.repairStatus} cleanup=${transaction.cleanupStatus}`,
    );
    const projected = projectBrowserTransactionResult({
      evidence: transactionEvidence,
      transaction,
    });
    return { events, notes, ...projected };
  }

  const observations = [];
  let firstFailure: BrowserToolFailureProjection | undefined;
  for (let index = 0; index < input.plan.actions.length; index += 1) {
    const action = input.plan.actions[index]!;
    const taskId = `browser_agent_${input.turn}_${index + 1}_${action.toolName.replace(/[^a-z0-9]+/gi, "_")}`;
    const result = await dispatchRuntimeTool({
      dispatcher: input.dispatcher,
      events,
      toolName: action.toolName,
      taskId,
      args: action.args,
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      requireApprovalEvent: false,
    });
    const observation = browserObservationFromMetadata(result.metadata);
    if (observation) {
      observations.push(observation);
      evidence.push(...projectBrowserObservationEvidence(observation));
      notes.push(
        `browser-action: ${observation.operation} ${observation.status} ${observation.reasonCode} cleanup=${observation.cleanupStatus}`,
      );
    }
    if (!result.success) {
      firstFailure = {
        reason:
          result.error ?? observation?.visibleTextSummary ?? "Browser tool failed",
        reasonCode: observation?.reasonCode ?? "unknown",
      };
      break;
    }
  }

  const finalObservation = observations[observations.length - 1];
  const projected = projectBrowserObservationResult({
    evidence,
    firstFailure,
    finalObservation,
  });
  return { events, notes, ...projected };
}
