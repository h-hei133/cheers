import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import {
  createCodingResultProvenanceCollector,
  summarizeCodingResultProvenance,
  type CodingResultProvenanceCollector,
} from "./codingResultProvenance.js";
import {
  dispatchToolWithLifecycle,
  type ToolLifecycleResult,
} from "./flowDispatch.js";
import type { CodingResultProvenanceSummary } from "./types.js";

export type {
  CodingResultProvenanceCollector,
  CodingResultProvenanceSummary,
  ToolLifecycleResult,
};

export function createToolRuntimeProvenanceCollector(): CodingResultProvenanceCollector {
  return createCodingResultProvenanceCollector();
}

export function summarizeToolRuntimeProvenance(
  collector: CodingResultProvenanceCollector,
): CodingResultProvenanceSummary | undefined {
  return summarizeCodingResultProvenance(collector);
}

export function dispatchRuntimeTool(input: {
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly toolName: string;
  readonly taskId: string;
  readonly args: Record<string, unknown>;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly abortSignal?: AbortSignal;
  readonly requireApprovalEvent: boolean;
  readonly provenanceCollector?: CodingResultProvenanceCollector;
}): Promise<ToolLifecycleResult> {
  return dispatchToolWithLifecycle(input);
}
