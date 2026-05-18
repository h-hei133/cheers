import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { PwFailureCode } from "./pwEvidence.js";
import {
  type PwReportEntry,
  skippedPwReportEntry,
} from "./pwReport.js";

export interface PwMcpBackendContract {
  readonly kind: "playwright-mcp";
  readonly readiness: "optional" | "unavailable" | "not-launched";
  readonly defaultBackend: false;
  readonly launched: false;
  readonly supportedOperations: readonly ["observe", "extract", "click", "type"];
  readonly evidenceModel: "pw-report-entry/v1";
  readonly lifecycleExpectations: readonly string[];
  readonly directControlTradeoffs: readonly string[];
  readonly providerCall: "none";
  readonly modelCall: "none";
  readonly evidence: readonly string[];
}

export interface PwMcpEvidenceInput {
  readonly scenarioId: string;
  readonly request: BrowserExecutionRequest;
  readonly reasonCode?: PwFailureCode;
  readonly evidenceSummary?: string;
}

export function createPwMcpBackendContract(input: {
  readonly readiness?: PwMcpBackendContract["readiness"];
} = {}): PwMcpBackendContract {
  const readiness = input.readiness ?? "not-launched";
  return {
    kind: "playwright-mcp",
    readiness,
    defaultBackend: false,
    launched: false,
    supportedOperations: ["observe", "extract", "click", "type"],
    evidenceModel: "pw-report-entry/v1",
    lifecycleExpectations: [
      "MCP server lifecycle is explicit and external to Direct Playwright core runtime.",
      "Tool evidence must map into the same safe summary and reason-code report model.",
      "MCP backend must not become default browser execution.",
    ],
    directControlTradeoffs: [
      "MCP adds server lifecycle and tool-schema mapping.",
      "Direct Playwright keeps browser/context/page cleanup inside the local control plane.",
    ],
    providerCall: "none",
    modelCall: "none",
    evidence: [
      `pw-mcp:readiness:${readiness}`,
      "pw-mcp:optional-not-default",
      "pw-mcp:not-launched",
      "pw-mcp:shared-report-contract",
      "pw-mcp:no-provider-or-model-call",
    ],
  };
}

export function mapPwMcpUnavailableEvidence(input: PwMcpEvidenceInput): PwReportEntry {
  return skippedPwReportEntry({
    scenarioId: input.scenarioId,
    operation: input.request.actionKind,
    mode: "skipped",
    reasonCode: input.reasonCode ?? "runtime-disabled",
    evidenceSummary: input.evidenceSummary ?? "Playwright MCP optional backend was not launched.",
  });
}
